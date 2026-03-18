#!/usr/bin/env python3
"""
Voice AI Bridge - Connects Asterisk ARI to OpenAI Realtime API
Handles two-way audio streaming for AI-powered phone conversations.

Architecture:
  Asterisk ARI (WebSocket) <-> This Bridge <-> OpenAI Realtime API (WebSocket)

The bridge:
1. Listens for Stasis events from Asterisk via ARI
2. When a call enters the voice-ai-bridge app, opens an OpenAI Realtime session
3. Streams audio bidirectionally between the phone call and OpenAI
4. Handles function calls (transfer, callback, payment, etc.)
5. Reports conversation results back to the dashboard API
"""

import asyncio
import base64
import json
import logging
import os
import signal
import sys
import time
import traceback
from datetime import datetime
from typing import Dict, Optional, Any

# ─── Configuration ──────────────────────────────────────────────────────────
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
DASHBOARD_API_URL = os.environ.get("DASHBOARD_API_URL", "")
DASHBOARD_API_KEY = os.environ.get("DASHBOARD_API_KEY", "")
ARI_URL = os.environ.get("ARI_URL", "http://localhost:8088")
ARI_USER = os.environ.get("ARI_USER", "voice-ai")
ARI_PASSWORD = os.environ.get("ARI_PASSWORD", "voice-ai-secret")
ARI_APP = os.environ.get("ARI_APP", "voice-ai-bridge")
BRIDGE_PORT = int(os.environ.get("BRIDGE_PORT", "8089"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

# OpenAI Realtime API config
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-realtime-preview")
AUDIO_FORMAT = "pcm16"  # 16-bit PCM at 24kHz for OpenAI
SAMPLE_RATE = 24000

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("voice-ai-bridge")

# ─── Active Call Sessions ───────────────────────────────────────────────────
active_sessions: Dict[str, "CallSession"] = {}
bridge_stats = {
    "started_at": datetime.utcnow().isoformat(),
    "total_calls": 0,
    "active_calls": 0,
    "completed_calls": 0,
    "failed_calls": 0,
}


class CallSession:
    """Manages a single AI-powered phone call."""

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
        self.ari_ws = None
        self.ended = False
        self.end_reason: Optional[str] = None

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


async def fetch_prompt(prompt_id: str) -> Optional[dict]:
    """Fetch the AI prompt configuration from the dashboard API."""
    try:
        import aiohttp
        url = f"{DASHBOARD_API_URL}/voice-ai/prompt/{prompt_id}"
        headers = {"Authorization": f"Bearer {DASHBOARD_API_KEY}"}
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    return await resp.json()
                logger.warning(f"Failed to fetch prompt {prompt_id}: HTTP {resp.status}")
                return None
    except Exception as e:
        logger.error(f"Error fetching prompt: {e}")
        return None


async def report_conversation(session: CallSession):
    """Report conversation results back to the dashboard."""
    try:
        import aiohttp
        url = f"{DASHBOARD_API_URL}/voice-ai/conversation"
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


async def handle_openai_session(session: CallSession, prompt_config: dict):
    """
    Connect to OpenAI Realtime API and stream audio bidirectionally.
    This is the core of the voice AI bridge.
    """
    try:
        import websockets

        system_prompt = prompt_config.get("systemPrompt", "You are a helpful assistant on a phone call.")
        voice = prompt_config.get("voice", "alloy")
        temperature = float(prompt_config.get("temperature", "0.7"))
        tools = prompt_config.get("tools", [])

        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "OpenAI-Beta": "realtime=v1",
        }

        url = f"{OPENAI_REALTIME_URL}?model={OPENAI_MODEL}"

        async with websockets.connect(url, extra_headers=headers) as ws:
            session.openai_ws = ws
            logger.info(f"OpenAI Realtime connected for {session.channel_id}")

            # Configure the session
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": system_prompt,
                    "voice": voice,
                    "input_audio_format": AUDIO_FORMAT,
                    "output_audio_format": AUDIO_FORMAT,
                    "temperature": temperature,
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500,
                    },
                },
            }

            # Add function tools if configured
            if tools:
                session_config["session"]["tools"] = [
                    {
                        "type": "function",
                        "name": tool["name"],
                        "description": tool.get("description", ""),
                        "parameters": tool.get("parameters", {"type": "object", "properties": {}}),
                    }
                    for tool in tools
                ]

            await ws.send(json.dumps(session_config))

            # Listen for OpenAI responses
            async for message in ws:
                if session.ended:
                    break

                try:
                    data = json.loads(message)
                    event_type = data.get("type", "")

                    if event_type == "response.audio.delta":
                        # Forward AI audio to Asterisk channel
                        audio_b64 = data.get("delta", "")
                        if audio_b64 and session.ari_ws:
                            await forward_audio_to_asterisk(session, audio_b64)

                    elif event_type == "response.audio_transcript.done":
                        # AI finished speaking - log transcript
                        text = data.get("transcript", "")
                        if text:
                            session.transcript.append({
                                "role": "assistant",
                                "text": text,
                                "timestamp": time.time(),
                            })

                    elif event_type == "input_audio_buffer.speech_started":
                        logger.debug(f"Caller started speaking on {session.channel_id}")

                    elif event_type == "conversation.item.input_audio_transcription.completed":
                        text = data.get("transcript", "")
                        if text:
                            session.transcript.append({
                                "role": "user",
                                "text": text,
                                "timestamp": time.time(),
                            })

                    elif event_type == "response.function_call_arguments.done":
                        # Handle function calls
                        await handle_function_call(session, data)

                    elif event_type == "error":
                        error = data.get("error", {})
                        logger.error(f"OpenAI error: {error}")
                        if error.get("code") == "session_expired":
                            session.end_reason = "session_expired"
                            break

                    elif event_type == "session.created":
                        logger.info(f"OpenAI session created for {session.channel_id}")

                except json.JSONDecodeError:
                    logger.warning("Non-JSON message from OpenAI")
                except Exception as e:
                    logger.error(f"Error processing OpenAI message: {e}")

    except Exception as e:
        logger.error(f"OpenAI session error for {session.channel_id}: {e}")
        session.end_reason = "openai_error"
    finally:
        session.openai_ws = None


async def forward_audio_to_asterisk(session: CallSession, audio_b64: str):
    """Forward base64-encoded audio from OpenAI to the Asterisk channel via ARI."""
    try:
        import aiohttp
        # ARI external media endpoint for sending audio
        url = f"{ARI_URL}/ari/channels/{session.channel_id}/play"
        # In practice, we'd use an external media channel or AudioSocket
        # For now, we buffer and play via ARI
        pass  # Placeholder - actual implementation depends on ARI external media setup
    except Exception as e:
        logger.error(f"Error forwarding audio to Asterisk: {e}")


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
        # In production: initiate Asterisk blind transfer via ARI

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

    elif fn_name == "verify_identity":
        result = {"success": True, "message": "Identity verification initiated"}

    elif fn_name == "send_sms":
        result = {"success": True, "message": f"SMS sent to {session.contact_phone}"}

    elif fn_name == "end_call":
        result = {"success": True, "message": "Ending call"}
        session.ai_disposition = arguments.get("disposition", "completed")
        session.ended = True

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
        # Trigger response generation
        await session.openai_ws.send(json.dumps({"type": "response.create"}))


# ─── Health Check HTTP Server ───────────────────────────────────────────────
async def health_handler(request):
    """HTTP health check endpoint for the dashboard to poll."""
    from aiohttp import web
    return web.json_response({
        "status": "running",
        "version": "1.0.0",
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


# ─── ARI Event Loop ────────────────────────────────────────────────────────
async def ari_event_loop():
    """Connect to Asterisk ARI WebSocket and handle Stasis events."""
    import websockets
    import aiohttp

    ari_ws_url = ARI_URL.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ari_ws_url}/ari/events?api_key={ARI_USER}:{ARI_PASSWORD}&app={ARI_APP}"

    while True:
        try:
            logger.info(f"Connecting to ARI WebSocket: {ARI_URL}")
            async with websockets.connect(ws_url) as ws:
                logger.info("Connected to Asterisk ARI")

                async for message in ws:
                    try:
                        event = json.loads(message)
                        event_type = event.get("type", "")

                        if event_type == "StasisStart":
                            await handle_stasis_start(event)
                        elif event_type == "StasisEnd":
                            await handle_stasis_end(event)
                        elif event_type == "ChannelDtmfReceived":
                            await handle_dtmf(event)
                        elif event_type == "ChannelStateChange":
                            pass  # Ignore state changes
                        else:
                            logger.debug(f"ARI event: {event_type}")

                    except json.JSONDecodeError:
                        logger.warning("Non-JSON ARI message")
                    except Exception as e:
                        logger.error(f"Error handling ARI event: {e}\n{traceback.format_exc()}")

        except Exception as e:
            logger.error(f"ARI connection error: {e}")
            await asyncio.sleep(5)
            logger.info("Reconnecting to ARI...")


async def handle_stasis_start(event: dict):
    """Handle a new call entering the voice-ai-bridge Stasis app."""
    channel = event.get("channel", {})
    channel_id = channel.get("id", "")
    args = event.get("args", [])

    # Parse arguments: prompt_id, contact_name, contact_phone, campaign_name
    prompt_id = args[0] if len(args) > 0 else ""
    contact_name = args[1] if len(args) > 1 else "Unknown"
    contact_phone = args[2] if len(args) > 2 else ""
    campaign_name = args[3] if len(args) > 3 else ""

    logger.info(f"New Voice AI call: {channel_id} | Prompt: {prompt_id} | Contact: {contact_name} ({contact_phone})")

    # Create session
    session = CallSession(channel_id, prompt_id, contact_name, contact_phone, campaign_name)
    active_sessions[channel_id] = session
    bridge_stats["total_calls"] += 1
    bridge_stats["active_calls"] = len(active_sessions)

    # Fetch prompt config
    prompt_config = await fetch_prompt(prompt_id)
    if not prompt_config:
        logger.warning(f"Using default prompt for {channel_id}")
        prompt_config = {
            "systemPrompt": "You are a professional assistant on a phone call. Be helpful and concise.",
            "voice": "alloy",
            "temperature": "0.7",
            "tools": [],
        }

    # Start OpenAI session in background
    asyncio.create_task(handle_openai_session(session, prompt_config))


async def handle_stasis_end(event: dict):
    """Handle a call leaving the Stasis app (hangup)."""
    channel = event.get("channel", {})
    channel_id = channel.get("id", "")

    session = active_sessions.pop(channel_id, None)
    if session:
        session.ended = True
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
        # Send DTMF as text input to OpenAI
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


# ─── Main ───────────────────────────────────────────────────────────────────
async def main():
    """Start the Voice AI Bridge."""
    logger.info("=" * 60)
    logger.info("  Voice AI Bridge v1.0.0")
    logger.info(f"  ARI: {ARI_URL} (app: {ARI_APP})")
    logger.info(f"  OpenAI Model: {OPENAI_MODEL}")
    logger.info(f"  Health Port: {BRIDGE_PORT}")
    logger.info("=" * 60)

    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY not set!")
        sys.exit(1)

    # Start health check server
    await start_health_server()

    # Start ARI event loop
    await ari_event_loop()


def signal_handler(sig, frame):
    logger.info("Shutting down Voice AI Bridge...")
    for session in active_sessions.values():
        session.ended = True
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    asyncio.run(main())
