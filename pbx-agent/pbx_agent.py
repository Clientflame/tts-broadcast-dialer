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
active_calls = {}  # channel -> { queue_id, start_time, phone_number }
active_calls_lock = threading.Lock()


# ─── HTTP Helpers ────────────────────────────────────────────────────────────
def api_request(endpoint, method="GET", data=None):
    """Make an authenticated request to the web app API."""
    url = f"{CONFIG['api_url']}/{endpoint}"
    headers = {
        "Authorization": f"Bearer {CONFIG['api_key']}",
        "Content-Type": "application/json",
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
    """Simple AMI client for local Asterisk connection."""

    def __init__(self):
        self.sock = None
        self.connected = False
        self.lock = threading.Lock()
        self._recv_buffer = ""

    def connect(self):
        """Connect and authenticate to AMI."""
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(10)
            self.sock.connect((CONFIG["ami_host"], CONFIG["ami_port"]))

            # Read banner
            banner = self._read_response()
            if not banner:
                raise Exception("No AMI banner received")
            log.info(f"AMI banner: {banner.get('_raw', '').strip()}")

            # Login
            result = self.send_action({
                "Action": "Login",
                "Username": CONFIG["ami_user"],
                "Secret": CONFIG["ami_secret"],
            })

            if result and result.get("Response") == "Success":
                self.connected = True
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

    def send_action(self, action):
        """Send an AMI action and read the response."""
        with self.lock:
            if not self.sock:
                return None
            try:
                # Build the AMI message
                lines = []
                for key, value in action.items():
                    if key == "Variable" and isinstance(value, dict):
                        # Send each variable on its own line
                        for vk, vv in value.items():
                            lines.append(f"Variable: {vk}={vv}")
                    else:
                        lines.append(f"{key}: {value}")
                msg = "\r\n".join(lines) + "\r\n\r\n"
                self.sock.sendall(msg.encode("utf-8"))
                return self._read_response()
            except Exception as e:
                log.error(f"AMI send error: {e}")
                self.connected = False
                return None

    def _read_response(self):
        """Read a single AMI response (up to blank line)."""
        try:
            data = {}
            raw_lines = []
            while True:
                chunk = self.sock.recv(4096).decode("utf-8")
                if not chunk:
                    return None
                self._recv_buffer += chunk
                while "\r\n" in self._recv_buffer:
                    line, self._recv_buffer = self._recv_buffer.split("\r\n", 1)
                    raw_lines.append(line)
                    if line == "":
                        # End of response
                        data["_raw"] = "\r\n".join(raw_lines)
                        return data
                    if ": " in line:
                        key, value = line.split(": ", 1)
                        data[key] = value
        except socket.timeout:
            return None
        except Exception as e:
            log.error(f"AMI read error: {e}")
            return None

    def originate(self, channel, context, exten, priority, variables=None,
                  caller_id=None, timeout=30000, async_mode=True):
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
        req = Request(audio_url)
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

    # Originate the call
    result = ami.originate(
        channel=channel,
        context=context,
        exten="s",
        priority=1,
        variables=variables,
        caller_id=caller_id,
        timeout=30000,
        async_mode=True,
    )

    if result and result.get("Response") != "Error":
        log.info(f"Call {queue_id} originated to {phone_number}")
        with active_calls_lock:
            active_calls[channel] = {
                "queue_id": queue_id,
                "start_time": time.time(),
                "phone_number": phone_number,
                "campaign_id": call_data.get("campaignId"),
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
    """Background thread to monitor AMI events for call status updates."""
    log.info("AMI event monitor started")

    while ami.connected:
        try:
            response = ami._read_response()
            if not response:
                time.sleep(0.1)
                continue

            event = response.get("Event", "")

            if event == "OriginateResponse":
                channel = response.get("Channel", "")
                reason = response.get("Reason", "")
                response_val = response.get("Response", "")

                # Find the matching active call
                base_channel = channel.split(";")[0] if ";" in channel else channel
                with active_calls_lock:
                    call_info = None
                    for ch, info in list(active_calls.items()):
                        if ch in channel or channel.startswith(ch.split("@")[0]):
                            call_info = info
                            break

                if call_info:
                    queue_id = call_info["queue_id"]
                    duration = time.time() - call_info["start_time"]

                    if response_val == "Success":
                        log.info(f"Call {queue_id} answered (reason: {reason})")
                        report_result(queue_id, "answered", {
                            "duration": int(duration),
                            "answeredAt": int(time.time() * 1000),
                            "asteriskChannel": channel,
                        })
                    else:
                        # Map reason codes
                        reason_map = {
                            "1": "no-answer",
                            "3": "no-answer",
                            "5": "busy",
                            "8": "congestion",
                        }
                        status = reason_map.get(reason, "failed")
                        log.info(f"Call {queue_id} {status} (reason: {reason})")
                        report_result(queue_id, status, {
                            "duration": int(duration),
                            "reason": reason,
                        })

                    # Remove from active calls
                    with active_calls_lock:
                        for ch in list(active_calls.keys()):
                            if active_calls[ch]["queue_id"] == queue_id:
                                del active_calls[ch]
                                break

            elif event == "Hangup":
                channel = response.get("Channel", "")
                cause = response.get("Cause", "")
                cause_txt = response.get("Cause-txt", "")

                with active_calls_lock:
                    call_info = None
                    matched_ch = None
                    for ch, info in active_calls.items():
                        if ch in channel or channel.startswith(ch.split("@")[0]):
                            call_info = info
                            matched_ch = ch
                            break

                if call_info and matched_ch:
                    queue_id = call_info["queue_id"]
                    duration = time.time() - call_info["start_time"]

                    log.info(f"Call {queue_id} hung up (cause: {cause} - {cause_txt})")
                    report_result(queue_id, "completed", {
                        "duration": int(duration),
                        "hangupCause": cause,
                        "hangupCauseText": cause_txt,
                    })

                    with active_calls_lock:
                        if matched_ch in active_calls:
                            del active_calls[matched_ch]

        except socket.timeout:
            continue
        except Exception as e:
            if ami.connected:
                log.error(f"Event monitor error: {e}")
            time.sleep(1)

    log.info("AMI event monitor stopped")


# ─── Main Loop ───────────────────────────────────────────────────────────────
def main():
    log.info("=" * 60)
    log.info("PBX Agent starting")
    log.info(f"API URL: {CONFIG['api_url']}")
    log.info(f"AMI: {CONFIG['ami_host']}:{CONFIG['ami_port']}")
    log.info(f"Max concurrent: {CONFIG['max_concurrent']}")
    log.info("=" * 60)

    if not CONFIG["api_url"] or not CONFIG["api_key"]:
        log.error("PBX_AGENT_API_URL and PBX_AGENT_API_KEY must be set")
        sys.exit(1)

    # Ensure audio directory exists
    os.makedirs(CONFIG["audio_dir"], exist_ok=True)

    ami = AMIConnection()

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

            if response and response.get("calls"):
                calls = response["calls"]
                log.info(f"Received {len(calls)} call(s) from queue")

                for call_data in calls:
                    try:
                        process_call(ami, call_data)
                    except Exception as e:
                        log.error(f"Error processing call {call_data.get('id')}: {e}")
                        report_result(call_data["id"], "failed", {"error": str(e)})

            # Send heartbeat
            api_request("heartbeat", method="POST", data={
                "activeCalls": current_active,
            })

        except Exception as e:
            log.error(f"Poll loop error: {e}")

        # Check for stale active calls (no event received in 5 minutes)
        with active_calls_lock:
            stale_threshold = time.time() - 300
            for ch, info in list(active_calls.items()):
                if info["start_time"] < stale_threshold:
                    log.warning(f"Stale call detected: {ch} (queue_id: {info['queue_id']})")
                    report_result(info["queue_id"], "failed", {"error": "Call timed out"})
                    del active_calls[ch]

        time.sleep(CONFIG["poll_interval"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("PBX Agent shutting down")
    except Exception as e:
        log.error(f"Fatal error: {e}")
        sys.exit(1)
