"""
End-to-end test for Step 18.
Connects to realtime gateway WS, sends session.start, sends audio chunks,
and verifies local STT + translation events come back.
"""
import asyncio
import base64
import io
import json
import math
import struct
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REALTIME_WS = "ws://127.0.0.1:8787/ws"
SESSION_ID = "e2e-test-001"
SAMPLE_RATE = 24_000
CHUNK_SAMPLES = 2_400   # 100ms per chunk
SILENCE_THRESHOLD = 500  # RMS below this = silence
SILENCE_CHUNKS = 5       # chunks needed to trigger flush


def make_pcm16_base64(amplitude: int, n_samples: int = CHUNK_SAMPLES) -> str:
    """Generate n_samples of 1 kHz sine wave PCM16 at given amplitude."""
    samples = [
        int(amplitude * math.sin(2 * math.pi * 1_000 * i / SAMPLE_RATE))
        for i in range(n_samples)
    ]
    raw = struct.pack(f"<{n_samples}h", *samples)
    return base64.b64encode(raw).decode()


def make_silence_base64(n_samples: int = CHUNK_SAMPLES) -> str:
    raw = b"\x00" * (n_samples * 2)
    return base64.b64encode(raw).decode()


async def run():
    try:
        import websockets  # type: ignore[import-untyped]
    except ImportError:
        print("ERROR: websockets not installed. Run: pip install websockets")
        sys.exit(1)

    print(f"[e2e] Connecting to {REALTIME_WS} ...")
    events_received = []

    async with websockets.connect(REALTIME_WS) as ws:
        # --- 1. Receive welcome ---
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        welcome = json.loads(raw)
        assert welcome["type"] == "gateway.welcome", f"Expected welcome, got {welcome}"
        print(f"[e2e] ✓ gateway.welcome (connectionId={welcome['connectionId']})")

        # --- 2. Send hello as desktop-capture ---
        await ws.send(json.dumps({"type": "gateway.hello", "role": "desktop-capture"}))

        # --- 3. Send session.start ---
        await ws.send(json.dumps({
            "type": "session.start",
            "sessionId": SESSION_ID,
            "sourceType": "loopback",
            "sourceLabel": "e2e-test",
            "targetLanguage": "ko",
            "sourceFormat": {"sampleRate": SAMPLE_RATE, "channels": 1, "encoding": "pcm16"},
            "targetFormat": {"sampleRate": SAMPLE_RATE, "channels": 1, "encoding": "pcm16"},
            "chunkDurationMs": 100,
        }))
        print(f"[e2e] ✓ session.start sent (sessionId={SESSION_ID})")

        # --- 4. Wait for provider.state: ready ---
        provider_ready = False
        deadline = asyncio.get_event_loop().time() + 10
        while asyncio.get_event_loop().time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2)
            except asyncio.TimeoutError:
                continue
            event = json.loads(raw)
            events_received.append(event)
            etype = event.get("type")
            print(f"[e2e]   <- {etype}", end="")
            if etype == "provider.state":
                print(f" [{event.get('status')}] {event.get('provider')} — {event.get('message','')}")
                if event.get("status") == "ready":
                    provider_ready = True
                    break
            elif etype == "gateway.error":
                print(f" ERROR: {event.get('message')}")
                break
            else:
                print()

        if not provider_ready:
            print("[e2e] ✗ provider.state:ready not received within 10s")
            return False

        print("[e2e] ✓ provider.state:ready — LocalTranscriptionBridge connected to local-ai")

        # --- 5. Send 5 non-silent speech chunks (amplitude 8000, RMS ≈ 5657) ---
        print("[e2e] Sending 5 non-silent audio chunks (simulated speech) ...")
        speech_b64 = make_pcm16_base64(amplitude=8_000)
        for i in range(5):
            await ws.send(json.dumps({
                "type": "audio.chunk.append",
                "sessionId": SESSION_ID,
                "chunkIndex": i,
                "pcm16Base64": speech_b64,
                "frameCount": CHUNK_SAMPLES,
            }))
            # drain acks
            try:
                ack_raw = await asyncio.wait_for(ws.recv(), timeout=0.5)
                ack = json.loads(ack_raw)
                if ack.get("type") == "audio.chunk.ack":
                    print(f"[e2e]   ack chunk {ack['chunkIndex']}")
            except asyncio.TimeoutError:
                pass

        # --- 6. Send silence to trigger VAD flush ---
        print(f"[e2e] Sending {SILENCE_CHUNKS} silence chunks to trigger flush ...")
        silence_b64 = make_silence_base64()
        for i in range(5, 5 + SILENCE_CHUNKS):
            await ws.send(json.dumps({
                "type": "audio.chunk.append",
                "sessionId": SESSION_ID,
                "chunkIndex": i,
                "pcm16Base64": silence_b64,
                "frameCount": CHUNK_SAMPLES,
            }))

        # --- 7. Wait for transcription events ---
        print("[e2e] Waiting for transcription events (up to 30s) ...")
        got_completed = False
        deadline = asyncio.get_event_loop().time() + 30
        while asyncio.get_event_loop().time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2)
            except asyncio.TimeoutError:
                continue
            event = json.loads(raw)
            etype = event.get("type")
            if etype == "transcription.delta":
                print(f"[e2e]   <- transcription.delta itemId={event.get('itemId')}")
            elif etype == "transcription.completed":
                transcript = event.get("transcript", "")
                print(f"[e2e]   <- transcription.completed: '{transcript}'")
                got_completed = True
            elif etype == "segment.upserted":
                seg = event.get("segment", {})
                src = seg.get("sourceText", "")
                tgt = seg.get("translatedText", "")
                print(f"[e2e]   <- segment.upserted")
                print(f"[e2e]      sourceText:     '{src}'")
                print(f"[e2e]      translatedText: '{tgt}'")
                if got_completed:
                    break
            elif etype == "audio.chunk.ack":
                pass
            else:
                print(f"[e2e]   <- {etype}")

        # --- 8. Stop session ---
        await ws.send(json.dumps({"type": "session.stop", "sessionId": SESSION_ID}))
        print("[e2e] ✓ session.stop sent")

        if got_completed:
            print("[e2e] ✓ End-to-end transcription flow verified!")
            return True
        else:
            print("[e2e] ✗ transcription.completed not received within 30s")
            return False


if __name__ == "__main__":
    ok = asyncio.run(run())
    sys.exit(0 if ok else 1)
