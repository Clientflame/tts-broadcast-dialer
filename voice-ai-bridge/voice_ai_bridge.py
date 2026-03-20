#!/usr/bin/env python3
"""
Voice AI Bridge v2.2 - Connects Asterisk ARI to OpenAI Realtime API
Full bidirectional audio streaming via ExternalMedia + RTP.

Architecture:
  PSTN Call -> Asterisk -> Stasis(voice-ai-bridge)
    -> Mixing Bridge (caller + ExternalMedia)
    -> ExternalMedia channel <-> RTP (G.722/16kHz) <-> UDP socket
    -> This Bridge (resample 16kHz<->24kHz) <-> OpenAI Realtime API (WebSocket, pcm16/24kHz)

The bridge:
1. Listens for Stasis events from Asterisk via ARI HTTP long-poll
2. On StasisStart: creates mixing bridge, ExternalMedia channel, gets RTP ports
3. Opens OpenAI Realtime session with the prompt config
4. Streams caller audio (RTP from Asterisk) -> OpenAI input_audio_buffer.append
5. Streams AI audio (OpenAI response.audio.delta) -> RTP back to Asterisk
6. Handles function calls, transcripts, and reports to dashboard
"""

import asyncio
import base64
import json
import logging
import os
import signal
import socket
import struct
import sys
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Optional, Any
from uuid import uuid4

# ─── Configuration ──────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
DASHBOARD_API_URL = os.environ.get("DASHBOARD_API_URL", "")
DASHBOARD_API_KEY = os.environ.get("DASHBOARD_API_KEY", "")
ARI_URL = os.environ.get("ARI_URL", "http://localhost:8088")
ARI_USER = os.environ.get("ARI_USER", "voice-ai")
ARI_PASSWORD = os.environ.get("ARI_PASSWORD", "voice-ai-secret")
ARI_APP = os.environ.get("ARI_APP", "voice-ai-bridge")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "8090"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

# OpenAI Realtime API config
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-realtime-preview")

# RTP config
UDP_BASE_PORT = 42000  # Base port for RTP UDP sockets
RTP_VERSION = 2
PT_ULAW = 0  # G.711 mu-law payload type (8kHz, standard PSTN)

# Valid voices for OpenAI Realtime API (as of 2025+)
VALID_REALTIME_VOICES = {"alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"}

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("voice-ai-bridge")

# ─── RTP Helpers ────────────────────────────────────────────────────────────
@dataclass
class RtpState:
    seq: int = 1
    ts: int = 0
    ssrc: int = 0x12345678


def build_rtp(payload: bytes, st: RtpState) -> bytes:
    """Build RTP packet with 12-byte header + payload."""
    vpxcc = (RTP_VERSION << 6)
    mpt = PT_ULAW  # no marker bit for continuous audio
    header = struct.pack("!BBHII", vpxcc, mpt, st.seq & 0xFFFF, st.ts & 0xFFFFFFFF, st.ssrc)
    st.seq = (st.seq + 1) & 0xFFFF
    st.ts = (st.ts + 160) & 0xFFFFFFFF  # 8000 Hz * 0.02s = 160 samples per 20ms frame
    return header + payload


# ─── ulaw codec + resampling ────────────────────────────────────────────────────────
import array
import audioop

# Volume gain for output audio (applied after resampling)
OUTPUT_GAIN = 2.5  # 2.5x = ~8dB boost


def resample_8k_to_24k(pcm8k: bytes) -> bytes:
    """Upsample PCM16 from 8kHz to 24kHz using linear interpolation (3x expansion).
    Deterministic: always produces exactly 3x the input samples."""
    samples_in = array.array('h')
    samples_in.frombytes(pcm8k)
    n = len(samples_in)
    if n == 0:
        return b''
    out = array.array('h', [0]) * (n * 3)
    for i in range(n - 1):
        s0 = samples_in[i]
        s1 = samples_in[i + 1]
        out[i * 3] = s0
        out[i * 3 + 1] = int(s0 + (s1 - s0) / 3)
        out[i * 3 + 2] = int(s0 + 2 * (s1 - s0) / 3)
    # Last sample: repeat
    out[(n - 1) * 3] = samples_in[-1]
    out[(n - 1) * 3 + 1] = samples_in[-1]
    out[(n - 1) * 3 + 2] = samples_in[-1]
    return out.tobytes()


def resample_24k_to_8k(pcm24k: bytes) -> bytes:
    """Downsample PCM16 from 24kHz to 8kHz by averaging groups of 3 samples, then apply gain.
    Deterministic: always produces exactly 1/3 the input samples."""
    samples_in = array.array('h')
    samples_in.frombytes(pcm24k)
    n = len(samples_in)
    out_len = n // 3
    if out_len == 0:
        return b''
    out = array.array('h', [0]) * out_len
    for i in range(out_len):
        j = i * 3
        avg = (samples_in[j] + samples_in[j + 1] + samples_in[j + 2]) // 3
        # Apply gain and clamp to int16 range
        val = int(avg * OUTPUT_GAIN)
        if val > 32767:
            val = 32767
        elif val < -32768:
            val = -32768
        out[i] = val
    return out.tobytes()


def parse_rtp(packet: bytes) -> bytes:
    """Extract payload from RTP packet (strip 12-byte header)."""
    if len(packet) < 12:
        return b""
    return packet[12:]


# ─── ARI REST Client ───────────────────────────────────────────────────────
class AriClient:
    """Minimal ARI REST client for bridge/channel operations."""

    def __init__(self, base_url: str, user: str, password: str, app: str):
        self.base = base_url.rstrip("/")
        self.user = user
        self.password = password
        self.app = app

    async def _request(self, method: str, path: str, **params):
        import aiohttp
        auth = aiohttp.BasicAuth(self.user, self.password)
        url = f"{self.base}/ari{path}"
        async with aiohttp.ClientSession(auth=auth) as sess:
            async with sess.request(method, url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                text = await resp.text()
                if resp.status >= 300:
                    raise RuntimeError(f"ARI {method} {path} failed ({resp.status}): {text}")
                if text:
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError:
                        return text
                return None

    async def create_bridge(self, bridge_id: str):
        """Create a mixing bridge."""
        return await self._request("POST", "/bridges", type="mixing,proxy_media", bridgeId=bridge_id)

    async def add_to_bridge(self, bridge_id: str, channel_id: str):
        """Add a channel to a bridge."""
        return await self._request("POST", f"/bridges/{bridge_id}/addChannel", channel=channel_id)

    async def create_external_media(self, channel_id: str, host: str, fmt="slin16", direction="both"):
        """Create an ExternalMedia channel."""
        return await self._request(
            "POST", "/channels/externalMedia",
            app=self.app,
            channelId=channel_id,
            external_host=host,
            format=fmt,
            direction=direction,
        )

    async def get_channel_var(self, channel_id: str, variable: str) -> str:
        """Get a channel variable value."""
        result = await self._request("GET", f"/channels/{channel_id}/variable", variable=variable)
        if isinstance(result, dict):
            return result.get("value", "")
        return ""

    async def delete_bridge(self, bridge_id: str):
        """Delete a bridge."""
        try:
            await self._request("DELETE", f"/bridges/{bridge_id}")
        except Exception as e:
            logger.debug(f"Bridge delete error (may already be gone): {e}")

    async def hangup_channel(self, channel_id: str):
        """Hang up a channel."""
        try:
            await self._request("DELETE", f"/channels/{channel_id}")
        except Exception as e:
            logger.debug(f"Channel hangup error (may already be gone): {e}")

    async def events_stream(self, handler):
        """Listen to ARI events via WebSocket connection."""
        import websockets
        from urllib.parse import urlencode
        # Build WebSocket URL: ws://host:port/ari/events?app=voice-ai-bridge&api_key=user:password
        ws_base = self.base.replace("http://", "ws://").replace("https://", "wss://")
        params = urlencode({"app": self.app, "api_key": f"{self.user}:{self.password}"})
        ws_url = f"{ws_base}/ari/events?{params}"
        logger.info(f"Opening ARI WebSocket: {ws_base}/ari/events?app={self.app}")
        async with websockets.connect(ws_url, ping_interval=30, ping_timeout=10) as ws:
            logger.info("ARI WebSocket connected — listening for Stasis events")
            async for message in ws:
                try:
                    evt = json.loads(message)
                    await handler(evt)
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    logger.error(f"Event handler error: {e}\n{traceback.format_exc()}")


# ─── Active Call Sessions ───────────────────────────────────────────────────
active_sessions: Dict[str, "CallSession"] = {}
bridge_stats = {
    "started_at": datetime.utcnow().isoformat(),
    "total_calls": 0,
    "active_calls": 0,
    "completed_calls": 0,
    "failed_calls": 0,
}

# Port allocator
_next_udp_port = UDP_BASE_PORT


def allocate_udp_port() -> int:
    global _next_udp_port
    port = _next_udp_port
    _next_udp_port += 2  # RTP uses even ports
    if _next_udp_port > UDP_BASE_PORT + 500:
        _next_udp_port = UDP_BASE_PORT
    return port


class CallSession:
    """Manages a single AI-powered phone call with RTP audio bridge."""

    def __init__(self, channel_id: str, prompt_id: str, contact_name: str,
                 contact_phone: str, campaign_name: str):
        self.channel_id = channel_id
        self.prompt_id = prompt_id
        self.contact_name = contact_name
        self.contact_phone = contact_phone
        self.campaign_name = campaign_name
        self.started_at = time.time()
        self.transcript: list = []
        self.ai_disposition: Optional[str] = None
        self.sentiment: str = "neutral"
        self.openai_ws = None
        self.ended = False
        self.end_reason: Optional[str] = None
        self.stop_event = asyncio.Event()

        # RTP state
        self.udp_port: int = 0
        self.udp_socket: Optional[socket.socket] = None
        self.asterisk_rtp_host: str = ""
        self.asterisk_rtp_port: int = 0
        self.rtp_state = RtpState()

        # Audio residual buffer for frame alignment (carries partial frames across OpenAI chunks)
        self.ulaw_residual: bytes = b''
        # Residual for input (RTP->OpenAI) PCM24k alignment
        self.pcm24k_residual: bytes = b''

        # ARI resources
        self.bridge_id: str = ""
        self.ext_media_channel_id: str = ""

    @property
    def duration_seconds(self) -> int:
        return int(time.time() - self.started_at)

    def to_dict(self) -> dict:
        return {
            "channelId": self.channel_id,
            "promptId": self.prompt_id,
            "contactName": self.contact_name,
            "contactPhone": self.contact_phone,
            "campaignName": self.campaign_name,
            "startedAt": datetime.fromtimestamp(self.started_at).isoformat(),
            "duration": self.duration_seconds,
            "sentiment": self.sentiment,
            "disposition": self.ai_disposition,
            "transcriptLength": len(self.transcript),
        }

    def cleanup(self):
        """Close UDP socket."""
        if self.udp_socket:
            try:
                self.udp_socket.close()
            except Exception:
                pass
            self.udp_socket = None


# ─── Tool Definitions ───────────────────────────────────────────────────────
# Map tool name strings to OpenAI function tool definitions
PREDEFINED_TOOLS = {
    "account_lookup": {
        "type": "function",
        "name": "account_lookup",
        "description": "Look up account information for the person on the call",
        "parameters": {
            "type": "object",
            "properties": {
                "account_number": {"type": "string", "description": "Account number or phone number"},
            },
            "required": [],
        },
    },
    "schedule_callback": {
        "type": "function",
        "name": "schedule_callback",
        "description": "Schedule a callback for the person at a specific date and time",
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Callback date (YYYY-MM-DD)"},
                "time": {"type": "string", "description": "Callback time (HH:MM)"},
                "reason": {"type": "string", "description": "Reason for callback"},
            },
            "required": ["date", "time"],
        },
    },
    "process_payment": {
        "type": "function",
        "name": "process_payment",
        "description": "Process a payment from the person on the call",
        "parameters": {
            "type": "object",
            "properties": {
                "amount": {"type": "string", "description": "Payment amount"},
                "method": {"type": "string", "description": "Payment method (card, bank, etc.)"},
            },
            "required": ["amount"],
        },
    },
    "transfer_to_agent": {
        "type": "function",
        "name": "transfer_to_agent",
        "description": "Transfer the call to a live human agent",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Reason for transfer"},
            },
            "required": [],
        },
    },
    "end_call": {
        "type": "function",
        "name": "end_call",
        "description": "End the phone call politely",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Reason for ending the call"},
                "disposition": {"type": "string", "description": "Call disposition/outcome"},
            },
            "required": [],
        },
    },
}


def build_tool_definitions(enabled_tool_names: list) -> list:
    """Convert a list of tool name strings to OpenAI function tool definitions."""
    definitions = []
    for name in enabled_tool_names:
        if name in PREDEFINED_TOOLS:
            definitions.append(PREDEFINED_TOOLS[name])
        else:
            logger.warning(f"Unknown tool name: {name}")
    return definitions


# ─── Dashboard API Helpers ──────────────────────────────────────────────────
async def fetch_prompt(prompt_id: str) -> Optional[dict]:
    """Fetch the AI prompt configuration from the dashboard API."""
    try:
        import aiohttp
        if not prompt_id or prompt_id.strip() == "":
            logger.warning("No prompt ID provided, skipping fetch")
            return None
        url = f"{DASHBOARD_API_URL}/prompt/{prompt_id}"
        headers = {"Authorization": f"Bearer {DASHBOARD_API_KEY}"}
        logger.info(f"Fetching prompt config from: {url}")
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if resp.status == 200 and "json" in content_type:
                    return await resp.json()
                elif resp.status == 200:
                    # Got HTML instead of JSON — likely a routing issue
                    body_preview = (await resp.text())[:200]
                    logger.warning(f"Prompt fetch returned non-JSON ({content_type}): {body_preview}")
                    return None
                logger.warning(f"Failed to fetch prompt {prompt_id}: HTTP {resp.status}")
                return None
    except Exception as e:
        logger.error(f"Error fetching prompt: {e}")
        return None


async def report_conversation(session: CallSession):
    """Report conversation results back to the dashboard."""
    try:
        import aiohttp
        url = f"{DASHBOARD_API_URL}/conversation"
        headers = {
            "Authorization": f"Bearer {DASHBOARD_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "channelId": session.channel_id,
            "promptId": session.prompt_id,
            "contactPhone": session.contact_phone,
            "contactName": session.contact_name,
            "campaignName": session.campaign_name,
            "duration": session.duration_seconds,
            "transcript": session.transcript,
            "sentiment": session.sentiment,
            "disposition": session.ai_disposition,
            "endReason": session.end_reason or "completed",
        }
        async with aiohttp.ClientSession() as http:
            async with http.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    logger.info(f"Reported conversation for {session.channel_id}")
                else:
                    logger.warning(f"Failed to report conversation: HTTP {resp.status}")
    except Exception as e:
        logger.error(f"Error reporting conversation: {e}")


# ─── Audio Bridge (RTP <-> OpenAI Realtime) ─────────────────────────────────
async def run_audio_bridge(session: CallSession, prompt_config: dict):
    """
    The core audio bridge:
    1. Open UDP socket to receive RTP from Asterisk ExternalMedia
    2. Connect to OpenAI Realtime API
    3. Pump caller audio (UDP->OpenAI) and AI audio (OpenAI->UDP) bidirectionally
    """
    try:
        import websockets

        system_prompt = prompt_config.get("systemPrompt", "You are a helpful assistant on a phone call.")
        opening_message = prompt_config.get("openingMessage", "")
        voice = prompt_config.get("voice", "alloy")
        # Validate voice — old prompts may have unsupported voices like "onyx", "fable", "nova"
        if voice not in VALID_REALTIME_VOICES:
            logger.warning(f"Voice '{voice}' is not supported by Realtime API, falling back to 'coral'")
            voice = "coral"
        temperature = float(prompt_config.get("temperature", "0.7"))
        enabled_tools = prompt_config.get("enabledTools", [])
        max_duration = int(prompt_config.get("maxConversationDuration", 300))
        silence_timeout = int(prompt_config.get("silenceTimeout", 10))

        # Connect to OpenAI Realtime
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "OpenAI-Beta": "realtime=v1",
        }
        url = f"{OPENAI_REALTIME_URL}?model={OPENAI_MODEL}"

        logger.info(f"Connecting to OpenAI Realtime for {session.channel_id}...")

        # websockets v16+ renamed extra_headers to additional_headers
        ws_version = tuple(int(x) for x in websockets.__version__.split(".")[:2])
        if ws_version >= (14, 0):
            ws_conn = websockets.connect(url, additional_headers=headers, max_size=10 * 1024 * 1024)
        else:
            ws_conn = websockets.connect(url, extra_headers=headers, max_size=10 * 1024 * 1024)
        async with ws_conn as ws:
            session.openai_ws = ws
            logger.info(f"OpenAI Realtime connected for {session.channel_id}")

            # Configure session: server-VAD + voice + PCM16 @ 24kHz
            # OpenAI Realtime API only supports 24kHz for PCM audio.
            # We resample 16kHz (G.722) <-> 24kHz (OpenAI) in the bridge.
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": system_prompt,
                    "voice": voice,
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500,
                    },
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "input_audio_transcription": {"model": "whisper-1"},
                    "temperature": temperature,
                },
            }

            # Add function tools if configured (enabledTools is a list of tool name strings)
            # Map tool names to predefined tool definitions
            if enabled_tools:
                tool_definitions = build_tool_definitions(enabled_tools)
                if tool_definitions:
                    session_config["session"]["tools"] = tool_definitions

            await ws.send(json.dumps(session_config))

            # Push a touch of silence so VAD doesn't stumble on first packets
            silence = bytes(24000)  # ~0.5s @ 24kHz x 2 bytes
            await ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(silence).decode(),
            }))

            # If there's an opening message, have the AI speak it first
            if opening_message:
                await ws.send(json.dumps({
                    "type": "conversation.item.create",
                    "item": {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": f"[System: The call has just connected. Greet the caller with this opening message: {opening_message}]"}],
                    },
                }))
                await ws.send(json.dumps({"type": "response.create"}))
                logger.info(f"Sent opening message prompt for {session.channel_id}")

            # Run bidirectional pumps
            recv_task = asyncio.create_task(pump_openai_to_rtp(session, ws))
            send_task = asyncio.create_task(pump_rtp_to_openai(session, ws))
            await asyncio.wait([recv_task, send_task], return_when=asyncio.FIRST_COMPLETED)

            # Cancel remaining task
            for task in [recv_task, send_task]:
                if not task.done():
                    task.cancel()

    except Exception as e:
        logger.error(f"Audio bridge error for {session.channel_id}: {e}\n{traceback.format_exc()}")
        session.end_reason = "bridge_error"
    finally:
        session.openai_ws = None
        logger.info(f"Audio bridge ended for {session.channel_id}")


async def pump_rtp_to_openai(session: CallSession, ws):
    """Receive RTP from Asterisk via UDP, strip header, send PCM to OpenAI."""
    loop = asyncio.get_running_loop()
    logger.info(f"RTP->OpenAI pump started on UDP port {session.udp_port} for {session.channel_id}")

    while not session.stop_event.is_set():
        try:
            data = await asyncio.wait_for(
                loop.sock_recv(session.udp_socket, 4096),
                timeout=1.0,
            )
        except asyncio.TimeoutError:
            continue
        except (asyncio.CancelledError, OSError):
            break

        ulaw_payload = parse_rtp(data)
        if not ulaw_payload:
            continue

        # Decode ulaw -> PCM16 (8kHz), then resample 8kHz -> 24kHz for OpenAI
        pcm_8k = audioop.ulaw2lin(ulaw_payload, 2)
        pcm_24k = resample_8k_to_24k(pcm_8k)

        # Send to OpenAI as base64 PCM
        msg = json.dumps({
            "type": "input_audio_buffer.append",
            "audio": base64.b64encode(pcm_24k).decode(),
        })
        try:
            await ws.send(msg)
        except Exception as e:
            logger.error(f"Error sending audio to OpenAI: {e}")
            break


async def _rtp_pacer(session: CallSession, rtp_queue: asyncio.Queue):
    """Send RTP packets from queue at real-time pace (one every 20ms)."""
    pkt_count = 0
    next_send = None
    while not session.stop_event.is_set():
        try:
            pkt, dest = await asyncio.wait_for(rtp_queue.get(), timeout=1.0)
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            break

        now = asyncio.get_event_loop().time()
        if next_send is None:
            next_send = now

        # Wait until it's time to send this packet
        delay = next_send - now
        if delay > 0:
            await asyncio.sleep(delay)

        try:
            session.udp_socket.sendto(pkt, dest)
            pkt_count += 1
            if pkt_count <= 3 or pkt_count % 200 == 0:
                logger.info(f"RTP_PACED #{pkt_count}: {len(pkt)} bytes -> {dest[0]}:{dest[1]} for {session.channel_id}")
        except Exception as e:
            logger.error(f"RTP send error: {e}")

        next_send += 0.020  # Schedule next packet 20ms later

        # If we've fallen behind (queue backed up), catch up but don't skip
        now2 = asyncio.get_event_loop().time()
        if next_send < now2 - 0.5:
            next_send = now2  # Reset if more than 500ms behind

    logger.info(f"RTP pacer ended for {session.channel_id}, sent {pkt_count} packets")


async def pump_openai_to_rtp(session: CallSession, ws):
    """Receive audio/events from OpenAI, send PCM back to Asterisk as RTP."""
    logger.info(f"OpenAI->RTP pump started for {session.channel_id} -> {session.asterisk_rtp_host}:{session.asterisk_rtp_port}")

    # Create a queue for RTP packets and a pacer task to send them at 20ms intervals
    rtp_queue: asyncio.Queue = asyncio.Queue(maxsize=2000)
    pacer_task = asyncio.create_task(_rtp_pacer(session, rtp_queue))

    try:
        while not session.stop_event.is_set():
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except (asyncio.CancelledError, Exception):
                break

            if not isinstance(raw, (str, bytes)):
                continue

            try:
                evt = json.loads(raw if isinstance(raw, str) else raw.decode())
            except Exception:
                continue

            event_type = evt.get("type", "")

            if event_type == "response.audio.delta":
                # AI audio (24kHz from OpenAI) -> resample to 8kHz -> RTP -> Asterisk
                audio_b64 = evt.get("delta", "")
                if audio_b64 and session.udp_socket and session.asterisk_rtp_port:
                    pcm_24k = base64.b64decode(audio_b64)
                    # Ensure even byte count for PCM16 (2 bytes per sample)
                    if len(pcm_24k) % 2 != 0:
                        pcm_24k = pcm_24k[:-1]
                    # Ensure sample count is divisible by 3 for clean 24k->8k downsampling
                    samples_24k = len(pcm_24k) // 2
                    trim = samples_24k % 3
                    if trim:
                        pcm_24k = pcm_24k[:-(trim * 2)]
                    if not pcm_24k:
                        continue
                    # Resample 24kHz (OpenAI) -> 8kHz PCM -> ulaw encode
                    pcm_8k = resample_24k_to_8k(pcm_24k)
                    ulaw_data = audioop.lin2ulaw(pcm_8k, 2)
                    # Prepend any residual from previous chunk
                    ulaw_data = session.ulaw_residual + ulaw_data
                    # Packetize into 20ms frames (160 bytes ulaw = 8000 samples/s * 0.02s * 1 byte)
                    dest = (session.asterisk_rtp_host, session.asterisk_rtp_port)
                    full_frames = len(ulaw_data) // 160
                    for i in range(full_frames):
                        chunk = ulaw_data[i * 160:(i + 1) * 160]
                        pkt = build_rtp(chunk, session.rtp_state)
                        try:
                            rtp_queue.put_nowait((pkt, dest))
                        except asyncio.QueueFull:
                            logger.warning(f"RTP queue full, dropping packet for {session.channel_id}")
                    # Save leftover bytes for next chunk (no silence padding!)
                    session.ulaw_residual = ulaw_data[full_frames * 160:]

            elif event_type == "response.audio_transcript.done":
                text = evt.get("transcript", "")
                if text:
                    session.transcript.append({
                        "role": "assistant",
                        "text": text,
                        "timestamp": time.time(),
                    })
                    logger.debug(f"AI said: {text[:80]}...")

            elif event_type == "conversation.item.input_audio_transcription.completed":
                text = evt.get("transcript", "")
                if text:
                    session.transcript.append({
                        "role": "user",
                        "text": text,
                        "timestamp": time.time(),
                    })
                    logger.debug(f"Caller said: {text[:80]}...")

            elif event_type == "input_audio_buffer.speech_started":
                logger.debug(f"Caller started speaking on {session.channel_id}")

            elif event_type == "response.function_call_arguments.done":
                await handle_function_call(session, evt)

            elif event_type == "error":
                error = evt.get("error", {})
                logger.error(f"OpenAI error: {error}")
                if error.get("code") == "session_expired":
                    session.end_reason = "session_expired"
                    break

            elif event_type == "session.created":
                logger.info(f"OpenAI session created for {session.channel_id}")

            elif event_type == "session.updated":
                logger.info(f"OpenAI session configured for {session.channel_id}")
    finally:
        pacer_task.cancel()
        try:
            await pacer_task
        except asyncio.CancelledError:
            pass


async def handle_function_call(session: CallSession, data: dict):
    """Handle function calls from the AI (transfer, callback, payment, etc.)."""
    call_id = data.get("call_id", "")
    fn_name = data.get("name", "")
    arguments = json.loads(data.get("arguments", "{}"))

    logger.info(f"Function call: {fn_name}({arguments}) on {session.channel_id}")

    result = {"success": False, "message": "Unknown function"}

    if fn_name == "transfer_to_agent":
        result = {"success": True, "message": "Transferring to live agent..."}
        session.ai_disposition = "transferred"
    elif fn_name == "schedule_callback":
        result = {"success": True, "message": f"Callback scheduled for {arguments.get('date', 'tomorrow')}"}
        session.ai_disposition = "callback_scheduled"
    elif fn_name == "process_payment":
        result = {"success": True, "message": "Payment link sent via SMS"}
        session.ai_disposition = "payment_initiated"
    elif fn_name == "opt_out":
        result = {"success": True, "message": "Contact opted out. Ending call."}
        session.ai_disposition = "opted_out"
        session.ended = True
        session.stop_event.set()
    elif fn_name == "verify_identity":
        result = {"success": True, "message": "Identity verification initiated"}
    elif fn_name == "send_sms":
        result = {"success": True, "message": f"SMS sent to {session.contact_phone}"}
    elif fn_name == "end_call":
        result = {"success": True, "message": "Ending call"}
        session.ai_disposition = arguments.get("disposition", "completed")
        session.ended = True
        session.stop_event.set()

    # Send function result back to OpenAI
    if session.openai_ws:
        response = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps(result),
            },
        }
        await session.openai_ws.send(json.dumps(response))
        await session.openai_ws.send(json.dumps({"type": "response.create"}))


# ─── Health Check HTTP Server ───────────────────────────────────────────────
async def health_handler(request):
    """HTTP health check endpoint for the dashboard to poll."""
    from aiohttp import web
    return web.json_response({
        "status": "running",
        "version": "2.0.0",
        "uptime": int(time.time() - time.mktime(datetime.fromisoformat(bridge_stats["started_at"]).timetuple())),
        "stats": bridge_stats,
        "activeSessions": {cid: s.to_dict() for cid, s in active_sessions.items()},
    })


async def start_health_server():
    """Start a simple HTTP server for health checks."""
    try:
        from aiohttp import web
        app = web.Application()
        app.router.add_get("/health", health_handler)
        app.router.add_get("/", health_handler)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", BRIDGE_PORT)
        await site.start()
        logger.info(f"Health check server listening on port {BRIDGE_PORT}")
    except Exception as e:
        logger.error(f"Failed to start health server: {e}")


# ─── ARI Event Handler ─────────────────────────────────────────────────────
ari_client: Optional[AriClient] = None


async def handle_ari_event(evt: dict):
    """Route ARI events to the appropriate handler."""
    event_type = evt.get("type", "")

    if event_type == "StasisStart":
        await handle_stasis_start(evt)
    elif event_type == "StasisEnd":
        await handle_stasis_end(evt)
    elif event_type == "ChannelDtmfReceived":
        await handle_dtmf(evt)
    elif event_type == "ChannelStateChange":
        pass  # Ignore
    else:
        logger.debug(f"ARI event: {event_type}")


async def handle_stasis_start(event: dict):
    """Handle a new call entering the voice-ai-bridge Stasis app."""
    global ari_client

    channel = event.get("channel", {})
    channel_id = channel.get("id", "")
    channel_name = channel.get("name", "")
    args = event.get("args", [])

    # CRITICAL: Ignore StasisStart events from ExternalMedia channels we created.
    # ExternalMedia channels also fire StasisStart when added to the app,
    # which would cause an infinite cascade of bridges if not filtered.
    if channel_id.startswith("ext-") or "UnicastRTP" in channel_name or "ExternalMedia" in channel_name:
        logger.debug(f"Ignoring StasisStart for ExternalMedia channel: {channel_id} ({channel_name})")
        return

    # Also skip if we already have a session for this channel
    if channel_id in active_sessions:
        logger.debug(f"Ignoring duplicate StasisStart for {channel_id}")
        return

    # Parse arguments from dialplan: prompt_id, contact_name, contact_phone, campaign_name
    prompt_id = args[0] if len(args) > 0 else ""
    contact_name = args[1] if len(args) > 1 else "Unknown"
    contact_phone = args[2] if len(args) > 2 else ""
    campaign_name = args[3] if len(args) > 3 else ""

    logger.info(f"StasisStart: {channel_id} | Prompt: {prompt_id} | Contact: {contact_name} ({contact_phone})")

    # Create session
    session = CallSession(channel_id, prompt_id, contact_name, contact_phone, campaign_name)
    active_sessions[channel_id] = session
    bridge_stats["total_calls"] += 1
    bridge_stats["active_calls"] = len(active_sessions)

    try:
        # 1. Allocate UDP port for RTP
        session.udp_port = allocate_udp_port()

        # 2. Create UDP socket
        session.udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        session.udp_socket.bind(("0.0.0.0", session.udp_port))
        session.udp_socket.setblocking(False)
        logger.info(f"UDP socket bound on port {session.udp_port}")

        # 3. Create a mixing bridge
        session.bridge_id = f"b-{channel_id[:20]}-{uuid4().hex[:8]}"
        await ari_client.create_bridge(session.bridge_id)
        logger.info(f"Created bridge {session.bridge_id}")

        # 4. Add caller channel to bridge
        await ari_client.add_to_bridge(session.bridge_id, channel_id)
        logger.info(f"Added caller {channel_id} to bridge")

        # 5. Create ExternalMedia channel pointing at our UDP socket
        session.ext_media_channel_id = f"ext-{uuid4().hex[:12]}"
        em = await ari_client.create_external_media(
            session.ext_media_channel_id,
            host=f"127.0.0.1:{session.udp_port}",
            fmt="ulaw",
            direction="both",
        )
        em_actual_id = em.get("id", session.ext_media_channel_id) if isinstance(em, dict) else session.ext_media_channel_id
        logger.info(f"Created ExternalMedia channel {em_actual_id}")

        # 6. Add ExternalMedia to bridge
        await ari_client.add_to_bridge(session.bridge_id, em_actual_id)
        logger.info(f"Added ExternalMedia to bridge")

        # 7. Get Asterisk's RTP address/port (where to send audio back)
        rtp_port_str = await ari_client.get_channel_var(em_actual_id, "UNICASTRTP_LOCAL_PORT")
        rtp_addr_str = await ari_client.get_channel_var(em_actual_id, "UNICASTRTP_LOCAL_ADDRESS")

        session.asterisk_rtp_host = rtp_addr_str or "127.0.0.1"
        session.asterisk_rtp_port = int(rtp_port_str) if rtp_port_str else 0

        logger.info(f"Asterisk RTP endpoint: {session.asterisk_rtp_host}:{session.asterisk_rtp_port}")

        if not session.asterisk_rtp_port:
            logger.error(f"Could not get UNICASTRTP_LOCAL_PORT for {channel_id}")
            session.end_reason = "rtp_setup_failed"
            return

        # 8. Fetch prompt config from dashboard
        prompt_config = await fetch_prompt(prompt_id)
        if not prompt_config:
            logger.warning(f"Using default prompt for {channel_id}")
            prompt_config = {
                "systemPrompt": "You are a professional assistant on a phone call. Be helpful and concise.",
                "openingMessage": "",
                "voice": "coral",
                "temperature": "0.7",
                "enabledTools": [],
                "maxConversationDuration": 300,
                "silenceTimeout": 10,
            }

        # 9. Start the audio bridge (RTP <-> OpenAI Realtime)
        asyncio.create_task(run_audio_bridge_with_cleanup(session, prompt_config))

    except Exception as e:
        logger.error(f"StasisStart setup failed for {channel_id}: {e}\n{traceback.format_exc()}")
        session.end_reason = "setup_failed"
        bridge_stats["failed_calls"] += 1
        session.cleanup()


async def run_audio_bridge_with_cleanup(session: CallSession, prompt_config: dict):
    """Run the audio bridge and clean up when done."""
    try:
        await run_audio_bridge(session, prompt_config)
    finally:
        session.cleanup()
        # Clean up ARI resources
        if ari_client and session.bridge_id:
            await ari_client.delete_bridge(session.bridge_id)


async def handle_stasis_end(event: dict):
    """Handle a call leaving the Stasis app (hangup)."""
    channel = event.get("channel", {})
    channel_id = channel.get("id", "")

    session = active_sessions.pop(channel_id, None)
    if session:
        session.ended = True
        session.stop_event.set()
        session.end_reason = session.end_reason or "caller_hangup"
        bridge_stats["active_calls"] = len(active_sessions)
        bridge_stats["completed_calls"] += 1
        logger.info(f"Call ended: {channel_id} | Duration: {session.duration_seconds}s | Disposition: {session.ai_disposition}")

        # Report conversation to dashboard
        await report_conversation(session)


async def handle_dtmf(event: dict):
    """Handle DTMF input during a Voice AI call."""
    channel = event.get("channel", {})
    channel_id = channel.get("id", "")
    digit = event.get("digit", "")

    session = active_sessions.get(channel_id)
    if session and session.openai_ws:
        dtmf_message = {
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": f"[Caller pressed {digit} on keypad]"}],
            },
        }
        await session.openai_ws.send(json.dumps(dtmf_message))
        await session.openai_ws.send(json.dumps({"type": "response.create"}))


# ─── ARI Event Loop ────────────────────────────────────────────────────────
async def ari_event_loop():
    """Connect to Asterisk ARI and listen for events."""
    global ari_client

    while True:
        try:
            logger.info(f"Connecting to ARI: {ARI_URL} (app: {ARI_APP})")
            await ari_client.events_stream(handle_ari_event)
        except Exception as e:
            logger.error(f"ARI connection error: {e}")
            await asyncio.sleep(5)
            logger.info("Reconnecting to ARI...")


# ─── Main ───────────────────────────────────────────────────────────────────
async def main():
    """Start the Voice AI Bridge."""
    global ari_client

    logger.info("=" * 60)
    logger.info("  Voice AI Bridge v2.1.0")
    logger.info(f"  ARI: {ARI_URL} (app: {ARI_APP})")
    logger.info(f"  OpenAI Model: {OPENAI_MODEL}")
    logger.info(f"  Health Port: {BRIDGE_PORT}")
    logger.info(f"  RTP UDP Base: {UDP_BASE_PORT}")
    logger.info("=" * 60)

    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY not set!")
        sys.exit(1)

    # Initialize ARI client
    ari_client = AriClient(ARI_URL, ARI_USER, ARI_PASSWORD, ARI_APP)

    # Start health check server
    await start_health_server()

    # Start ARI event loop
    await ari_event_loop()


def signal_handler(sig, frame):
    logger.info("Shutting down Voice AI Bridge...")
    for session in active_sessions.values():
        session.ended = True
        session.stop_event.set()
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    asyncio.run(main())
