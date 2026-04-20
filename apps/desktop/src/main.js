const snapshotOutput = document.getElementById("snapshot-output");
const sessionOutput = document.getElementById("session-output");
const metricsOutput = document.getElementById("metrics-output");
const gatewayOutput = document.getElementById("gateway-output");
const refreshButton = document.getElementById("refresh-button");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:8787/ws";
const gatewayClientId =
  localStorage.getItem("sorisori.gatewayClientId") ?? crypto.randomUUID();
localStorage.setItem("sorisori.gatewayClientId", gatewayClientId);

let listenersRegistered = false;
let sessionEventLog = [];
let latestMetrics = null;
let latestChunk = null;
let isSessionRunning = false;
let currentSessionId = null;
let currentSessionConfig = null;
let gatewaySocket = null;
let gatewayState = "idle";
let gatewayLog = [];
let pendingGatewayMessages = [];
let gatewayHelloSent = false;
let gatewaySessionStarted = false;
let gatewayDroppedDataMessages = 0;

function setSessionButtons(running) {
  isSessionRunning = running;
  if (startButton) {
    startButton.disabled = running;
  }
  if (stopButton) {
    stopButton.disabled = !running;
  }
}

function pushSessionEvent(entry) {
  sessionEventLog = [entry, ...sessionEventLog].slice(0, 8);
  sessionOutput.textContent = JSON.stringify(sessionEventLog, null, 2);
}

function pushGatewayLog(entry) {
  gatewayLog = [entry, ...gatewayLog].slice(0, 12);
  gatewayOutput.textContent = JSON.stringify(
    {
      gatewayState,
      gatewayUrl: DEFAULT_GATEWAY_URL,
      currentSessionId,
      log: gatewayLog,
    },
    null,
    2,
  );
}

function renderMetrics() {
  metricsOutput.textContent = JSON.stringify(
    {
      latestMetrics,
      latestChunk:
        latestChunk &&
        {
          chunkIndex: latestChunk.chunkIndex,
          timestampMs: latestChunk.timestampMs,
          sampleRateHz: latestChunk.sampleRateHz,
          frames: latestChunk.frames,
          durationMs: latestChunk.durationMs,
          peakLevel: latestChunk.peakLevel,
          pcm16Base64Length: latestChunk.pcm16Base64?.length ?? 0,
        },
    },
    null,
    2,
  );
}

function buildGatewayPayload(type, payload) {
  return {
    type,
    occurredAt: new Date().toISOString(),
    ...payload,
  };
}

function sendGatewayMessage(payload, options = {}) {
  const { queueIfUnavailable = true } = options;
  const serialized = JSON.stringify(payload);
  if (gatewaySocket?.readyState === WebSocket.OPEN) {
    gatewaySocket.send(serialized);
    return true;
  }

  if (queueIfUnavailable) {
    pendingGatewayMessages.push(serialized);
    return false;
  }

  gatewayDroppedDataMessages += 1;
  if (gatewayDroppedDataMessages <= 3 || gatewayDroppedDataMessages % 25 === 0) {
    pushGatewayLog({
      type: "gateway.data.dropped",
      droppedCount: gatewayDroppedDataMessages,
      messageType: payload.type,
    });
  }
  return false;
}

function flushGatewayQueue() {
  if (gatewaySocket?.readyState !== WebSocket.OPEN) {
    return;
  }

  while (pendingGatewayMessages.length > 0) {
    const nextPayload = pendingGatewayMessages.shift();
    gatewaySocket.send(nextPayload);
  }
}

function sendGatewaySessionStartIfReady() {
  if (
    !currentSessionId ||
    !currentSessionConfig ||
    gatewaySocket?.readyState !== WebSocket.OPEN ||
    gatewaySessionStarted
  ) {
    return;
  }

  sendGatewayMessage(
    buildGatewayPayload("session.start", {
      sessionId: currentSessionId,
      sourceType: "system-output",
      sourceLabel: currentSessionConfig.deviceLabel,
      sourceFormat: {
        encoding: currentSessionConfig.sourceFormat.encoding,
        sampleRateHz: currentSessionConfig.sourceFormat.sampleRateHz,
        channels: currentSessionConfig.sourceFormat.channels,
      },
      targetFormat: {
        encoding: currentSessionConfig.targetFormat.encoding,
        sampleRateHz: currentSessionConfig.targetFormat.sampleRateHz,
        channels: currentSessionConfig.targetFormat.channels,
      },
      chunkDurationMs: currentSessionConfig.chunkDurationMs,
      targetLanguage: "ko",
    }),
  );
  gatewaySessionStarted = true;
  pushGatewayLog({
    type: "gateway.session.start.sent",
    sessionId: currentSessionId,
    chunkDurationMs: currentSessionConfig.chunkDurationMs,
  });
  flushGatewayQueue();
}

function ensureGatewayConnection() {
  if (gatewaySocket && gatewaySocket.readyState !== WebSocket.CLOSED) {
    return;
  }

  gatewayState = "connecting";
  pushGatewayLog({ type: "gateway.connecting" });
  gatewaySocket = new WebSocket(DEFAULT_GATEWAY_URL);

  gatewaySocket.addEventListener("open", () => {
    gatewayState = "open";
    gatewayHelloSent = false;
    pushGatewayLog({ type: "gateway.open" });
    if (!gatewayHelloSent) {
      sendGatewayMessage(
        buildGatewayPayload("gateway.hello", {
          clientId: gatewayClientId,
          role: "desktop-capture",
        }),
      );
      gatewayHelloSent = true;
    }
    sendGatewaySessionStartIfReady();
    flushGatewayQueue();
  });

  gatewaySocket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      pushGatewayLog(payload);
    } catch (error) {
      pushGatewayLog({
        type: "gateway.parse-error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  gatewaySocket.addEventListener("error", () => {
    gatewayState = "error";
    pushGatewayLog({
      type: "gateway.error",
      message: "Could not reach services/realtime. Local capture continues without uplink.",
    });
  });

  gatewaySocket.addEventListener("close", () => {
    gatewayState = "closed";
    pushGatewayLog({ type: "gateway.closed" });
  });
}

function closeGatewayConnection(reason) {
  if (currentSessionId && gatewaySessionStarted) {
    sendGatewayMessage(
      buildGatewayPayload("session.stop", {
        sessionId: currentSessionId,
        reason,
      }),
    );
  }

  pendingGatewayMessages = [];
  gatewaySessionStarted = false;
  gatewayHelloSent = false;
  gatewayDroppedDataMessages = 0;

  if (gatewaySocket && gatewaySocket.readyState === WebSocket.OPEN) {
    gatewaySocket.close();
  }
  gatewaySocket = null;
  gatewayState = "idle";
  pushGatewayLog({ type: "gateway.idle", reason });
}

async function ensureEventListeners() {
  if (listenersRegistered || !window.__TAURI__?.event?.listen) {
    return;
  }

  listenersRegistered = true;
  const { listen } = window.__TAURI__.event;

  await listen("capture-session", (event) => {
    const payload = event.payload;
    pushSessionEvent(payload);
    if (payload?.status === "running") {
      setSessionButtons(true);
    } else if (payload?.status === "stopped" || payload?.status === "failed") {
      setSessionButtons(false);
      closeGatewayConnection(payload.status);
    }
  });

  await listen("capture-metrics", (event) => {
    latestMetrics = event.payload;
    if (currentSessionId && gatewaySessionStarted) {
      sendGatewayMessage(
        buildGatewayPayload("capture.metrics", {
          sessionId: currentSessionId,
          chunkIndex: event.payload.chunkIndex,
          inputFrames: event.payload.inputFrames,
          outputFrames: event.payload.outputFrames,
          peakLevel: event.payload.peakLevel,
          silent: event.payload.silentFlag,
          dataDiscontinuity: event.payload.discontinuityFlag,
          sourceSampleRateHz: currentSessionConfig?.sourceFormat?.sampleRateHz ?? 0,
          chunkTimestampMs: event.payload.timestampMs,
        }),
        { queueIfUnavailable: false },
      );
    }
    renderMetrics();
  });

  await listen("audio-chunk", (event) => {
    latestChunk = event.payload;
    if (currentSessionId && gatewaySessionStarted) {
      sendGatewayMessage(
        buildGatewayPayload("audio.chunk.append", {
          sessionId: currentSessionId,
          chunkIndex: event.payload.chunkIndex,
          pcm16Base64: event.payload.pcm16Base64,
          frameCount: event.payload.frames,
          sampleRateHz: event.payload.sampleRateHz,
          durationMs: event.payload.durationMs,
          peakLevel: event.payload.peakLevel,
          timestampMs: event.payload.timestampMs,
        }),
        { queueIfUnavailable: false },
      );
    }
    renderMetrics();
  });
}

async function loadSnapshot() {
  if (!window.__TAURI__?.core?.invoke) {
    snapshotOutput.textContent =
      "Tauri runtime not detected. Run this screen with `npm run dev -w @sorisori/desktop`.";
    return;
  }

  snapshotOutput.textContent = "loading runtime loopback diagnostics...";

  try {
    await ensureEventListeners();
    const payload = await window.__TAURI__.core.invoke("desktop_bootstrap_snapshot");
    snapshotOutput.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    snapshotOutput.textContent =
      error instanceof Error ? error.message : String(error);
  }
}

async function startCaptureSession() {
  if (!window.__TAURI__?.core?.invoke) {
    return;
  }

  try {
    await ensureEventListeners();
    currentSessionId = crypto.randomUUID();
    currentSessionConfig = null;
    gatewayDroppedDataMessages = 0;
    ensureGatewayConnection();
    const payload = await window.__TAURI__.core.invoke("start_capture_session");
    currentSessionConfig = payload.config ?? null;
    pushSessionEvent(payload);
    sendGatewaySessionStartIfReady();
    setSessionButtons(true);
  } catch (error) {
    currentSessionId = null;
    currentSessionConfig = null;
    closeGatewayConnection("start-failed");
    pushSessionEvent({
      status: "command-error",
      message: error instanceof Error ? error.message : String(error),
    });
    setSessionButtons(false);
  }
}

async function stopCaptureSession() {
  if (!window.__TAURI__?.core?.invoke) {
    return;
  }

  try {
    const payload = await window.__TAURI__.core.invoke("stop_capture_session");
    pushSessionEvent(payload);
    closeGatewayConnection("manual-stop");
    currentSessionId = null;
    currentSessionConfig = null;
    setSessionButtons(false);
  } catch (error) {
    pushSessionEvent({
      status: "command-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

refreshButton?.addEventListener("click", () => {
  void loadSnapshot();
});

startButton?.addEventListener("click", () => {
  void startCaptureSession();
});

stopButton?.addEventListener("click", () => {
  void stopCaptureSession();
});

setSessionButtons(false);
renderMetrics();
pushGatewayLog({ type: "gateway.idle", reason: "app-boot" });
void loadSnapshot();
