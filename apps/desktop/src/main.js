const snapshotOutput = document.getElementById("snapshot-output");
const sessionOutput = document.getElementById("session-output");
const metricsOutput = document.getElementById("metrics-output");
const refreshButton = document.getElementById("refresh-button");
const startButton = document.getElementById("start-button");
const stopButton = document.getElementById("stop-button");

let listenersRegistered = false;
let sessionEventLog = [];
let latestMetrics = null;
let latestChunk = null;
let isSessionRunning = false;

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
          sampleCount: latestChunk.samples?.length ?? 0,
        },
    },
    null,
    2,
  );
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
    }
  });

  await listen("capture-metrics", (event) => {
    latestMetrics = event.payload;
    renderMetrics();
  });

  await listen("audio-chunk", (event) => {
    latestChunk = event.payload;
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
    const payload = await window.__TAURI__.core.invoke("start_capture_session");
    pushSessionEvent(payload);
    setSessionButtons(true);
  } catch (error) {
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
void loadSnapshot();
