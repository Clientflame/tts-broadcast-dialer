#!/usr/bin/env python3
"""
PBX Agent for AI TTS Broadcast Dialer
--------------------------------------
Runs on the FreePBX server as a systemd service.
Polls the web app API for pending calls, originates them via local AMI,
monitors call progress, and reports results back.

No inbound connections needed — all communication is outbound HTTPS.
"""

import os
import sys
import json
import time
import socket
import logging
import hashlib
import subprocess
import threading
import queue
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode

# ─── Configuration ───────────────────────────────────────────────────────────
CONFIG = {
    "api_url": os.environ.get("PBX_AGENT_API_URL", ""),  # e.g. https://your-app.manus.space/api/pbx
    "api_key": os.environ.get("PBX_AGENT_API_KEY", ""),
    "ami_host": os.environ.get("AMI_HOST", "127.0.0.1"),
    "ami_port": int(os.environ.get("AMI_PORT", "5038")),
    "ami_user": os.environ.get("AMI_USER", "broadcast_dialer"),
    "ami_secret": os.environ.get("AMI_SECRET", "Br0adcast!D1aler2024"),
    "poll_interval": int(os.environ.get("POLL_INTERVAL", "3")),
    "max_concurrent": int(os.environ.get("MAX_CONCURRENT", "5")),
    "cps_limit": int(os.environ.get("CPS_LIMIT", "1")),  # Calls per second rate limit
    "cps_pacing_ms": int(os.environ.get("CPS_PACING_MS", "1000")),  # Milliseconds between calls (1000=1/s, 2000=1/2s, 3000=1/3s)
    "audio_dir": "/var/lib/asterisk/sounds/custom/broadcast",
    "trunk_name": "vitel-outbound",
}

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/var/log/pbx-agent.log", mode="a"),
    ]
)
log = logging.getLogger("pbx-agent")

# ─── Active call tracking ───────────────────────────────────────────────────
active_calls = {}  # queue_id -> { channel, start_time, phone_number }
active_calls_lock = threading.Lock()


# ─── HTTP Helpers ────────────────────────────────────────────────────────────
def api_request(endpoint, method="GET", data=None):
    """Make an authenticated request to the web app API."""
    url = f"{CONFIG['api_url']}/{endpoint}"
    headers = {
        "Authorization": f"Bearer {CONFIG['api_key']}",
        "Content-Type": "application/json",
        "User-Agent": "PBX-Agent/1.0",
    }

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")

    req = Request(url, data=body, headers=headers, method=method)

    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else ""
        log.error(f"API error {e.code} on {endpoint}: {error_body}")
        return None
    except URLError as e:
        log.error(f"API connection error on {endpoint}: {e.reason}")
        return None
    except Exception as e:
        log.error(f"API request failed on {endpoint}: {e}")
        return None


# ─── AMI Connection ─────────────────────────────────────────────────────────
class AMIConnection:
    """
    AMI client with a dedicated reader thread.
    
    Architecture:
    - A single reader thread continuously reads from the socket and dispatches
      messages to either the action_response queue (for command responses) or
      the event_queue (for async events like OriginateResponse, Hangup).
    - send_action() sends a command and waits on action_response queue.
    - The event monitor reads from event_queue.
    
    This prevents the race condition where events get consumed by send_action.
    """

    def __init__(self):
        self.sock = None
        self.connected = False
        self.send_lock = threading.Lock()
        self._recv_buffer = ""
        self.action_response = queue.Queue()
        self.event_queue = queue.Queue()
        self._reader_thread = None
        self._waiting_for_response = False

    def connect(self):
        """Connect and authenticate to AMI."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(10)
            self.sock.connect((CONFIG["ami_host"], CONFIG["ami_port"]))

            # Read banner (single line, not terminated by blank line)
            banner = self._read_line()
            if not banner:
                raise Exception("No AMI banner received")
            log.info(f"AMI banner: {banner.strip()}")

            # Start the reader thread before login so it can dispatch the response
            self.connected = True
            self._reader_thread = threading.Thread(
                target=self._reader_loop, daemon=True
            )
            self._reader_thread.start()

            # Login
            result = self.send_action({
                "Action": "Login",
                "Username": CONFIG["ami_user"],
                "Secret": CONFIG["ami_secret"],
            })

            if result and result.get("Response") == "Success":
                log.info("AMI authenticated successfully")
                return True
            else:
                log.error(f"AMI auth failed: {result}")
                self.disconnect()
                return False

        except Exception as e:
            log.error(f"AMI connection failed: {e}")
            self.disconnect()
            return False

    def disconnect(self):
        """Close AMI connection."""
        self.connected = False
        if self.sock:
            try:
                self.sock.close()
            except:
                pass
            self.sock = None

    def _read_line(self):
        """Read a single line from the socket (for banner)."""
        try:
            while True:
                chunk = self.sock.recv(4096).decode("utf-8")
                if not chunk:
                    return None
                self._recv_buffer += chunk
                if "\r\n" in self._recv_buffer:
                    line, self._recv_buffer = self._recv_buffer.split("\r\n", 1)
                    return line
        except socket.timeout:
            return None
        except Exception as e:
            log.error(f"AMI read line error: {e}")
            return None

    def _reader_loop(self):
        """
        Dedicated reader thread: reads all AMI messages and dispatches them.
        Action responses go to action_response queue.
        Events go to event_queue.
        """
        log.info("AMI reader thread started")
        self.sock.settimeout(1)  # Short timeout for responsive shutdown

        while self.connected:
            try:
                msg = self._read_message()
                if msg is None:
                    continue

                # Determine if this is an event or a response
                if "Event" in msg:
                    self.event_queue.put(msg)
                elif "Response" in msg:
                    # If someone is waiting for a response, send it there
                    if self._waiting_for_response:
                        self.action_response.put(msg)
                    else:
                        # Unsolicited response (shouldn't happen often)
                        log.debug(f"Unsolicited response: {msg.get('Response')}")
                else:
                    # Unknown message type
                    log.debug(f"Unknown AMI message: {msg}")

            except Exception as e:
                if self.connected:
                    log.error(f"Reader thread error: {e}")
                time.sleep(0.1)

        log.info("AMI reader thread stopped")

    def _read_message(self):
        """Read a single AMI message (terminated by blank line)."""
        data = {}
        raw_lines = []

        # First check if we already have a complete message in the buffer
        while True:
            if "\r\n" in self._recv_buffer:
                line, self._recv_buffer = self._recv_buffer.split("\r\n", 1)
                raw_lines.append(line)
                if line == "":
                    # End of message
                    if not data:
                        # Empty message, skip
                        raw_lines = []
                        continue
                    data["_raw"] = "\r\n".join(raw_lines)
                    return data
                if ": " in line:
                    key, value = line.split(": ", 1)
                    data[key] = value
            else:
                # Need more data from socket
                try:
                    chunk = self.sock.recv(4096).decode("utf-8")
                    if not chunk:
                        return None
                    self._recv_buffer += chunk
                except socket.timeout:
                    # If we have partial data, keep waiting; otherwise return None
                    if raw_lines:
                        continue
                    return None
                except Exception:
                    return None

    def send_action(self, action):
        """Send an AMI action and wait for the response."""
        with self.send_lock:
            if not self.sock:
                return None
            try:
                # Drain any stale responses
                while not self.action_response.empty():
                    try:
                        self.action_response.get_nowait()
                    except queue.Empty:
                        break

                # Build the AMI message
                lines = []
                for key, value in action.items():
                    if key == "Variable" and isinstance(value, dict):
                        for vk, vv in value.items():
                            lines.append(f"Variable: {vk}={vv}")
                    else:
                        lines.append(f"{key}: {value}")
                msg = "\r\n".join(lines) + "\r\n\r\n"

                self._waiting_for_response = True
                self.sock.sendall(msg.encode("utf-8"))

                # Wait for response (up to 10 seconds)
                try:
                    result = self.action_response.get(timeout=10)
                    return result
                except queue.Empty:
                    log.error("Timeout waiting for AMI response")
                    return None
                finally:
                    self._waiting_for_response = False

            except Exception as e:
                log.error(f"AMI send error: {e}")
                self._waiting_for_response = False
                self.connected = False
                return None

    def originate(self, channel, context, exten, priority, variables=None,
                  caller_id=None, timeout=30000, async_mode=True, action_id=None):
        """Originate a call."""
        action = {
            "Action": "Originate",
            "Channel": channel,
            "Context": context,
            "Exten": exten,
            "Priority": str(priority),
            "Timeout": str(timeout),
            "Async": "true" if async_mode else "false",
        }
        if action_id:
            action["ActionID"] = action_id
        if caller_id:
            action["CallerID"] = caller_id
        if variables:
            action["Variable"] = variables

        return self.send_action(action)


# ─── Audio Preparation ───────────────────────────────────────────────────────
def prepare_audio(audio_url, audio_name):
    """Download and convert audio file for Asterisk playback."""
    if not audio_url or not audio_name:
        return None

    audio_dir = CONFIG["audio_dir"]
    os.makedirs(audio_dir, exist_ok=True)

    wav_path = os.path.join(audio_dir, f"{audio_name}.wav")

    # Skip if already converted
    if os.path.exists(wav_path):
        file_age = time.time() - os.path.getmtime(wav_path)
        if file_age < 3600:  # Cache for 1 hour
            return f"custom/broadcast/{audio_name}"

    # Download
    tmp_path = os.path.join(audio_dir, f"{audio_name}_tmp.mp3")
    try:
        log.info(f"Downloading audio: {audio_url[:80]}...")
        req = Request(audio_url, headers={"User-Agent": "PBX-Agent/1.0"})
        with urlopen(req, timeout=30) as resp:
            with open(tmp_path, "wb") as f:
                f.write(resp.read())
    except Exception as e:
        log.error(f"Audio download failed: {e}")
        return None

    # Convert to WAV (8kHz, mono, 16-bit PCM for Asterisk)
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", tmp_path,
            "-ar", "8000", "-ac", "1", "-sample_fmt", "s16",
            wav_path
        ], capture_output=True, timeout=30, check=True)

        # Set ownership
        subprocess.run(["chown", "asterisk:asterisk", wav_path],
                       capture_output=True, timeout=5)

        log.info(f"Audio ready: {wav_path}")
    except Exception as e:
        log.error(f"Audio conversion failed: {e}")
        # Try to use MP3 directly (Asterisk may support it)
        mp3_path = os.path.join(audio_dir, f"{audio_name}.mp3")
        os.rename(tmp_path, mp3_path)
        subprocess.run(["chown", "asterisk:asterisk", mp3_path],
                       capture_output=True, timeout=5)
        return f"custom/broadcast/{audio_name}"
    finally:
        # Cleanup temp file
        try:
            os.remove(tmp_path)
        except:
            pass

    return f"custom/broadcast/{audio_name}"


# ─── Call Processing ─────────────────────────────────────────────────────────
def process_health_check(ami, call_data):
    """
    Process a DID health check.
    
    Strategy: Use AMI SIPpeers/SIPshowpeer or originate a short test call
    using the DID as the caller ID to verify the trunk can place calls with it.
    We originate a call to Asterisk's built-in echo test (extension 10000 in
    the 'default' context) which answers immediately and echoes audio back.
    If the call is answered, the DID is healthy. If it fails, the DID has issues.
    """
    queue_id = call_data["id"]
    variables = call_data.get("variables", {})
    caller_id_id = variables.get("healthCheckCallerIdId")
    did_number = variables.get("healthCheckDID") or variables.get("CALLER_ID", "")
    
    log.info(f"Health check {queue_id}: testing DID {did_number} (callerIdId={caller_id_id})")
    
    if not caller_id_id:
        log.error(f"Health check {queue_id}: missing healthCheckCallerIdId")
        report_result(queue_id, "failed", {"error": "Missing caller ID reference"})
        return
    
    # Method: Originate a short call to FreePBX's echo test (*43) using the DID as caller ID.
    # This validates that the trunk/DID can place outbound calls.
    # We use Local/*43@from-internal which is FreePBX's built-in echo test.
    # If *43 doesn't exist, fall back to 7777@from-internal (Talking Clock) or just
    # test AMI connectivity by originating to a safe local extension.
    action_id = f"call-{queue_id}"
    
    # Use from-internal context which is FreePBX's standard outbound context
    # *43 = Echo Test (built-in), answers immediately and echoes audio back
    result = ami.originate(
        channel=f"Local/*43@from-internal",
        context="from-internal",
        exten="*43",
        priority=1,
        variables={
            "CALLER_ID": did_number,
            "healthCheckCallerIdId": str(caller_id_id),
            "healthCheck": "true",
        },
        caller_id=f"\"{did_number}\" <{did_number}>",
        timeout=15000,  # 15 second timeout for health check
        async_mode=True,
        action_id=action_id,
    )
    
    if result and result.get("Response") != "Error":
        log.info(f"Health check {queue_id}: originated test call for DID {did_number}")
        with active_calls_lock:
            active_calls[queue_id] = {
                "channel": f"Local/*43@from-internal",
                "action_id": action_id,
                "start_time": time.time(),
                "phone_number": did_number,
                "campaign_id": None,
                "actual_channel": None,
                "is_health_check": True,
                "health_check_caller_id_id": caller_id_id,
                "health_check_did": did_number,
            }
    else:
        error_msg = result.get("Message", "Unknown AMI error") if result else "No AMI response"
        log.error(f"Health check {queue_id}: originate failed for DID {did_number}: {error_msg}")
        # Report the health check result as failed
        report_health_check_result(caller_id_id, "failed", f"AMI originate failed: {error_msg}")
        report_result(queue_id, "failed", {"error": error_msg})


def report_health_check_result(caller_id_id, result, details=""):
    """Report DID health check result back to the web app."""
    data = {
        "callerIdId": int(caller_id_id),
        "result": result,
        "details": details,
    }
    resp = api_request("health-check-result", method="POST", data=data)
    if resp:
        log.info(f"Health check result reported for callerIdId={caller_id_id}: {result}")
    else:
        log.error(f"Failed to report health check result for callerIdId={caller_id_id}")


def process_call(ami, call_data):
    """Process a single call from the queue."""
    queue_id = call_data["id"]
    phone_number = call_data["phoneNumber"]
    channel = call_data.get("channel", f"PJSIP/{phone_number}@{CONFIG['trunk_name']}")
    context = call_data.get("context", "tts-broadcast")
    caller_id = call_data.get("callerIdStr")
    audio_url = call_data.get("audioUrl")
    audio_name = call_data.get("audioName")
    variables = call_data.get("variables", {})

    # Detect health check calls and handle them specially
    if context == "health-check" or variables.get("healthCheck") == "true":
        process_health_check(ami, call_data)
        return

    log.info(f"Processing call {queue_id} to {phone_number}")

    # Prepare audio on the PBX
    if audio_url and audio_name:
        audio_path = prepare_audio(audio_url, audio_name)
        if audio_path:
            variables["AUDIOFILE"] = audio_path
        else:
            log.error(f"Failed to prepare audio for call {queue_id}")
            report_result(queue_id, "failed", {"error": "Audio preparation failed"})
            return

    # Originate the call with ActionID for reliable event matching
    action_id = f"call-{queue_id}"
    result = ami.originate(
        channel=channel,
        context=context,
        exten="s",
        priority=1,
        variables=variables,
        caller_id=caller_id,
        timeout=30000,
        async_mode=True,
        action_id=action_id,
    )

    if result and result.get("Response") != "Error":
        log.info(f"Call {queue_id} originated to {phone_number}")
        with active_calls_lock:
            active_calls[queue_id] = {
                "channel": channel,
                "action_id": action_id,
                "start_time": time.time(),
                "phone_number": phone_number,
                "campaign_id": call_data.get("campaignId"),
                "actual_channel": None,  # Will be set from OriginateResponse
            }
    else:
        error_msg = result.get("Message", "Unknown AMI error") if result else "No AMI response"
        log.error(f"Call {queue_id} originate failed: {error_msg}")
        report_result(queue_id, "failed", {"error": error_msg})


def report_result(queue_id, result, details=None):
    """Report call result back to the web app."""
    data = {
        "queueId": queue_id,
        "result": result,
        "details": details or {},
    }
    resp = api_request("report", method="POST", data=data)
    if resp:
        log.info(f"Reported result for {queue_id}: {result}")
    else:
        log.error(f"Failed to report result for {queue_id}")


# ─── AMI Event Monitor ──────────────────────────────────────────────────────
def monitor_ami_events(ami):
    """Background thread to process AMI events from the event queue."""
    log.info("AMI event monitor started")

    while ami.connected:
        try:
            # Block for up to 1 second waiting for events
            try:
                event_data = ami.event_queue.get(timeout=1)
            except queue.Empty:
                continue

            event = event_data.get("Event", "")

            if event == "OriginateResponse":
                channel = event_data.get("Channel", "")
                reason = event_data.get("Reason", "")
                response_val = event_data.get("Response", "")
                action_id = event_data.get("ActionID", "")
                uniqueid = event_data.get("Uniqueid", "")

                log.info(f"OriginateResponse: channel={channel}, reason={reason}, response={response_val}, actionId={action_id}")

                # Match by ActionID (most reliable) or fall back to channel matching
                matched_queue_id = None
                with active_calls_lock:
                    # First try ActionID match (format: call-{queue_id})
                    if action_id and action_id.startswith("call-"):
                        try:
                            qid = int(action_id.split("-", 1)[1])
                            if qid in active_calls:
                                matched_queue_id = qid
                        except (ValueError, IndexError):
                            pass

                    # Fallback: match by trunk name in channel
                    if matched_queue_id is None:
                        trunk = CONFIG["trunk_name"]
                        if trunk in channel:
                            # Find any active call using this trunk
                            for qid, info in list(active_calls.items()):
                                if trunk in info["channel"]:
                                    matched_queue_id = qid
                                    break

                if matched_queue_id is not None:
                    with active_calls_lock:
                        call_info = active_calls.get(matched_queue_id)
                    if call_info:
                        duration = time.time() - call_info["start_time"]

                        # Check if this is a health check call
                        is_hc = call_info.get("is_health_check", False)
                        hc_cid = call_info.get("health_check_caller_id_id")
                        hc_did = call_info.get("health_check_did", "")

                        if response_val == "Success":
                            if is_hc and hc_cid:
                                # Health check answered = DID is healthy
                                log.info(f"Health check {matched_queue_id}: DID {hc_did} is HEALTHY (call answered)")
                                report_health_check_result(hc_cid, "healthy", f"Test call answered successfully")
                                # Immediately hang up the echo test call
                                report_result(matched_queue_id, "answered", {"duration": int(duration)})
                                # Schedule hangup after brief delay
                                with active_calls_lock:
                                    if matched_queue_id in active_calls:
                                        active_calls[matched_queue_id]["answered"] = True
                                        active_calls[matched_queue_id]["answered_at"] = time.time()
                                        active_calls[matched_queue_id]["actual_channel"] = channel
                                        # Auto-hangup health check after 2 seconds
                                        active_calls[matched_queue_id]["auto_hangup_at"] = time.time() + 2
                            else:
                                log.info(f"Call {matched_queue_id} answered (reason: {reason})")
                                # Store the actual channel for Hangup matching
                                with active_calls_lock:
                                    if matched_queue_id in active_calls:
                                        active_calls[matched_queue_id]["answered"] = True
                                        active_calls[matched_queue_id]["answered_at"] = time.time()
                                        active_calls[matched_queue_id]["actual_channel"] = channel
                        else:
                            # Call failed (no answer, busy, congestion)
                            reason_map = {
                                "1": "no-answer",
                                "3": "no-answer",
                                "5": "busy",
                                "8": "congestion",
                            }
                            status = reason_map.get(reason, "failed")

                            if is_hc and hc_cid:
                                # Health check failed
                                log.info(f"Health check {matched_queue_id}: DID {hc_did} FAILED (reason: {reason}, status: {status})")
                                report_health_check_result(hc_cid, "failed", f"Test call failed: {status} (reason {reason})")

                            log.info(f"Call {matched_queue_id} {status} (reason: {reason})")
                            report_result(matched_queue_id, status, {
                                "duration": int(duration),
                                "reason": reason,
                            })
                            with active_calls_lock:
                                active_calls.pop(matched_queue_id, None)
                else:
                    log.warning(f"OriginateResponse for unknown channel: {channel} (actionId={action_id})")

            elif event == "Hangup":
                channel = event_data.get("Channel", "")
                cause = event_data.get("Cause", "")
                cause_txt = event_data.get("Cause-txt", "")

                log.info(f"Hangup: channel={channel}, cause={cause} ({cause_txt})")

                # Match by actual_channel (set from OriginateResponse) or trunk name
                matched_queue_id = None
                with active_calls_lock:
                    for qid, info in list(active_calls.items()):
                        actual_ch = info.get("actual_channel", "")
                        # Match exact channel or base channel (strip ;1, ;2 suffixes)
                        base_event_ch = channel.split(";")[0]
                        base_actual_ch = actual_ch.split(";")[0] if actual_ch else ""
                        if (actual_ch and (base_actual_ch == base_event_ch or actual_ch in channel or channel in actual_ch)):
                            matched_queue_id = qid
                            break
                        # Fallback: trunk name match when only one active call
                        trunk = CONFIG["trunk_name"]
                        if trunk in channel and trunk in info["channel"]:
                            matched_queue_id = qid
                            break

                if matched_queue_id is not None:
                    with active_calls_lock:
                        call_info = active_calls.pop(matched_queue_id, None)

                    if call_info:
                        duration = time.time() - call_info["start_time"]
                        was_answered = call_info.get("answered", False)
                        is_hc = call_info.get("is_health_check", False)

                        if is_hc:
                            # Health check hangup - already reported via OriginateResponse
                            log.info(f"Health check {matched_queue_id} hung up (duration: {int(duration)}s)")
                            # Don't double-report; health check result was already sent
                        elif was_answered:
                            log.info(f"Call {matched_queue_id} completed (duration: {int(duration)}s)")
                            report_result(matched_queue_id, "answered", {
                                "duration": int(duration),
                                "answeredAt": int(call_info.get("answered_at", time.time()) * 1000),
                                "hangupCause": cause,
                                "hangupCauseText": cause_txt,
                                "asteriskChannel": channel,
                            })
                        else:
                            log.info(f"Call {matched_queue_id} hung up before answer (cause: {cause})")
                            report_result(matched_queue_id, "failed", {
                                "duration": int(duration),
                                "hangupCause": cause,
                                "hangupCauseText": cause_txt,
                            })

            elif event in ("Newchannel", "Newstate", "Dial", "Bridge"):
                # Log interesting events for debugging
                log.debug(f"Event {event}: {event_data.get('Channel', '')} {event_data.get('ChannelState', '')}")

        except Exception as e:
            if ami.connected:
                log.error(f"Event monitor error: {e}")
            time.sleep(0.5)

    log.info("AMI event monitor stopped")


# ─── Independent Heartbeat Thread ────────────────────────────────────────────
def heartbeat_loop():
    """
    Independent heartbeat thread that runs every 10 seconds.
    This ensures the agent stays "online" in the dashboard even when
    the poll loop is slow (e.g., during large batch deletes on the server).
    """
    consecutive_failures = 0
    while True:
        try:
            with active_calls_lock:
                current_active = len(active_calls)
            resp = api_request("heartbeat", method="POST", data={
                "activeCalls": current_active,
            })
            if resp:
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                if consecutive_failures >= 3:
                    log.warning(f"Heartbeat failed {consecutive_failures} times in a row — server may be busy")
        except Exception as e:
            consecutive_failures += 1
            log.error(f"Heartbeat error: {e}")
        time.sleep(10)  # Send heartbeat every 10 seconds


# ─── Main Loop ───────────────────────────────────────────────────────────────
def main():
    log.info("=" * 60)
    log.info("PBX Agent starting")
    log.info(f"API URL: {CONFIG['api_url']}")
    log.info(f"AMI: {CONFIG['ami_host']}:{CONFIG['ami_port']}")
    log.info(f"Max concurrent: {CONFIG['max_concurrent']}")
    log.info(f"CPS limit: {CONFIG['cps_limit']}")
    log.info(f"CPS pacing: {CONFIG['cps_pacing_ms']}ms between calls")
    log.info("=" * 60)

    if not CONFIG["api_url"] or not CONFIG["api_key"]:
        log.error("PBX_AGENT_API_URL and PBX_AGENT_API_KEY must be set")
        sys.exit(1)

    # Ensure audio directory exists
    os.makedirs(CONFIG["audio_dir"], exist_ok=True)

    # Start independent heartbeat thread (keeps agent "online" even if poll is slow)
    heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    heartbeat_thread.start()
    log.info("Independent heartbeat thread started (every 10s)")

    ami = AMIConnection()
    poll_failures = 0  # Track consecutive poll failures

    while True:
        # Connect to AMI if not connected
        if not ami.connected:
            log.info("Connecting to AMI...")
            if ami.connect():
                # Start event monitor thread
                monitor_thread = threading.Thread(
                    target=monitor_ami_events, args=(ami,), daemon=True
                )
                monitor_thread.start()
            else:
                log.error("AMI connection failed, retrying in 10s...")
                time.sleep(10)
                continue

        # Count active calls
        with active_calls_lock:
            current_active = len(active_calls)

        # Calculate how many slots are available
        slots = CONFIG["max_concurrent"] - current_active
        if slots <= 0:
            time.sleep(CONFIG["poll_interval"])
            continue

        # Poll for pending calls
        try:
            response = api_request("poll", method="POST", data={
                "limit": slots,
                "activeCalls": current_active,
            })

            if response is None:
                # Server error (500, timeout, etc.) — back off gradually
                poll_failures += 1
                if poll_failures >= 5:
                    backoff = min(30, CONFIG["poll_interval"] * poll_failures)
                    log.warning(f"Poll failed {poll_failures} times — backing off {backoff}s")
                    time.sleep(backoff)
                    continue
            else:
                poll_failures = 0  # Reset on success

            if response and response.get("calls"):
                calls = response["calls"]
                log.info(f"Received {len(calls)} call(s) from queue")

                # Update CPS limit and pacing from server response (server may override)
                server_cps = response.get("cpsLimit")
                if server_cps and isinstance(server_cps, (int, float)) and server_cps > 0:
                    CONFIG["cps_limit"] = int(server_cps)
                server_pacing = response.get("cpsPacingMs")
                if server_pacing and isinstance(server_pacing, (int, float)) and server_pacing > 0:
                    CONFIG["cps_pacing_ms"] = int(server_pacing)

                # CPS rate limiting: use pacing interval (ms between calls)
                # cpsPacingMs takes priority - it's the actual delay between calls
                pacing_ms = CONFIG["cps_pacing_ms"]
                cps = max(1, CONFIG["cps_limit"])
                cps_delay = 1.0 / cps  # e.g., 1 CPS = 1.0s between calls
                pacing_delay = pacing_ms / 1000.0  # e.g., 2000ms = 2.0s between calls
                delay_between_calls = max(cps_delay, pacing_delay)  # use the slower of the two

                for i, call_data in enumerate(calls):
                    try:
                        # Apply CPS delay between calls (not before the first one)
                        if i > 0 and delay_between_calls > 0:
                            time.sleep(delay_between_calls)
                        process_call(ami, call_data)
                    except Exception as e:
                        log.error(f"Error processing call {call_data.get('id')}: {e}")
                        report_result(call_data["id"], "failed", {"error": str(e)})

        except Exception as e:
            poll_failures += 1
            log.error(f"Poll loop error: {e}")

        # Auto-hangup health check calls that have been answered
        with active_calls_lock:
            now = time.time()
            for qid, info in list(active_calls.items()):
                auto_hangup = info.get("auto_hangup_at")
                if auto_hangup and now >= auto_hangup:
                    actual_ch = info.get("actual_channel")
                    if actual_ch and ami.connected:
                        log.info(f"Auto-hanging up health check {qid} (channel: {actual_ch})")
                        try:
                            ami.send_action({"Action": "Hangup", "Channel": actual_ch})
                        except Exception as e:
                            log.warning(f"Failed to hangup health check {qid}: {e}")
                    # Remove from active calls
                    del active_calls[qid]

        # Check for stale active calls (no event received in 5 minutes)
        with active_calls_lock:
            stale_threshold = time.time() - 300
            for qid, info in list(active_calls.items()):
                if info["start_time"] < stale_threshold:
                    is_hc = info.get("is_health_check", False)
                    log.warning(f"Stale {'health check' if is_hc else 'call'} detected: queue_id={qid}")
                    if is_hc:
                        hc_cid = info.get("health_check_caller_id_id")
                        if hc_cid:
                            report_health_check_result(hc_cid, "failed", "Health check timed out")
                    report_result(qid, "failed", {"error": "Call timed out"})
                    del active_calls[qid]

        time.sleep(CONFIG["poll_interval"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("PBX Agent shutting down")
    except Exception as e:
        log.error(f"Fatal error: {e}")
        sys.exit(1)
