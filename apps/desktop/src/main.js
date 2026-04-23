// ─── DOM refs ──────────────────────────────────────────────────────────────
const statusDot        = document.getElementById("status-dot");
const statusText       = document.getElementById("status-text");
const subtitleList     = document.getElementById("subtitle-list");
const subtitlePh       = document.getElementById("subtitle-placeholder");
const subtitleScroll   = document.getElementById("subtitle-scroll");
const liveIndicator    = document.getElementById("live-indicator");
const liveText         = document.getElementById("live-text");
const sessionIdInput   = document.getElementById("session-id-input");
const resetSessionBtn  = document.getElementById("reset-session-id-button");
const startButton      = document.getElementById("start-button");
const stopButton       = document.getElementById("stop-button");

// debug panes
const snapshotOutput   = document.getElementById("snapshot-output");
const sessionOutput    = document.getElementById("session-output");
const metricsOutput    = document.getElementById("metrics-output");
const gatewayOutput    = document.getElementById("gateway-output");

// ─── Constants ──────────────────────────────────────────────────────────────
const DEFAULT_GATEWAY_URL  = "ws://127.0.0.1:8787/ws";
const DEFAULT_SESSION_ID   = "mvp-session-001";
const SESSION_ID_KEY       = "sorisori.sessionId";
const CLIENT_ID_KEY        = "sorisori.gatewayClientId";

const gatewayClientId =
  localStorage.getItem(CLIENT_ID_KEY) ?? crypto.randomUUID();
localStorage.setItem(CLIENT_ID_KEY, gatewayClientId);

// ─── State ──────────────────────────────────────────────────────────────────
let listenersRegistered    = false;
let isSessionRunning       = false;
let currentSessionId       = null;
let currentSessionConfig   = null;

let gatewaySocket          = null;
let gatewayState           = "idle";
let gatewayHelloSent       = false;
let gatewaySessionStarted  = false;
let pendingGatewayMessages = [];
let gatewayDropped         = 0;

let sessionEventLog  = [];
let latestMetrics    = null;
let latestChunk      = null;
let gatewayLog       = [];

// subtitle state
let subtitles        = [];           // { ko, src, timeLabel }
let liveItemId       = null;
let liveDeltaMap     = {};           // itemId → accumulated delta text

// ─── Status helpers ─────────────────────────────────────────────────────────
function setStatus(state, text) {
  statusDot.className = "status-dot " + state;
  statusText.textContent = text;
}

// ─── Session ID helpers ──────────────────────────────────────────────────────
function normalizeSessionId(v) {
  const t = v?.trim();
  return t && t.length > 0 ? t : DEFAULT_SESSION_ID;
}

function getSessionId() {
  return normalizeSessionId(sessionIdInput?.value);
}

function initSessionId() {
  const saved = normalizeSessionId(localStorage.getItem(SESSION_ID_KEY));
  localStorage.setItem(SESSION_ID_KEY, saved);
  if (sessionIdInput) sessionIdInput.value = saved;
}

function saveSessionId() {
  const id = getSessionId();
  localStorage.setItem(SESSION_ID_KEY, id);
  if (sessionIdInput) sessionIdInput.value = id;
  return id;
}

// ─── Buttons ─────────────────────────────────────────────────────────────────
function setButtons(running) {
  isSessionRunning = running;
  startButton.disabled = running;
  stopButton.disabled  = !running;
  if (sessionIdInput)  sessionIdInput.disabled  = running;
  if (resetSessionBtn) resetSessionBtn.disabled  = running;
}

// ─── Subtitle display ────────────────────────────────────────────────────────
function formatTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderSubtitles() {
  if (subtitles.length === 0) {
    subtitlePh.hidden = false;
    return;
  }
  subtitlePh.hidden = true;
  subtitleList.innerHTML = subtitles
    .map(
      (s) => `<div class="subtitle-item">
  <div class="subtitle-ko">${escHtml(s.ko)}</div>
  ${s.src ? `<div class="subtitle-src">${escHtml(s.src)}</div>` : ""}
  <div class="subtitle-time">${s.timeLabel}</div>
</div>`
    )
    .join("");

  // 최신 항목이 보이도록 스크롤
  requestAnimationFrame(() => {
    subtitleScroll.scrollTop = subtitleScroll.scrollHeight;
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pushSegment(ko, src) {
  if (!ko && !src) return;
  subtitles.push({
    ko: ko || "(번역 없음)",
    src: src || "",
    timeLabel: formatTime(Date.now()),
  });
  if (subtitles.length > 200) subtitles.shift();
  renderSubtitles();
}

function setLiveDelta(text) {
  if (!text) {
    liveIndicator.hidden = true;
    liveText.textContent = "";
    return;
  }
  liveIndicator.hidden = false;
  liveText.textContent = text;
}

// ─── Gateway ─────────────────────────────────────────────────────────────────
function buildMsg(type, payload) {
  return { type, occurredAt: new Date().toISOString(), ...payload };
}

function sendGateway(payload, { queueIfUnavailable = true } = {}) {
  const s = JSON.stringify(payload);
  if (gatewaySocket?.readyState === WebSocket.OPEN) {
    gatewaySocket.send(s);
    return true;
  }
  if (queueIfUnavailable) {
    pendingGatewayMessages.push(s);
    return false;
  }
  gatewayDropped++;
  return false;
}

function flushQueue() {
  while (
    pendingGatewayMessages.length > 0 &&
    gatewaySocket?.readyState === WebSocket.OPEN
  ) {
    gatewaySocket.send(pendingGatewayMessages.shift());
  }
}

function sendSessionStartIfReady() {
  if (
    !currentSessionId ||
    !currentSessionConfig ||
    gatewaySocket?.readyState !== WebSocket.OPEN ||
    gatewaySessionStarted
  ) return;

  sendGateway(
    buildMsg("session.start", {
      sessionId: currentSessionId,
      sourceType: "system-output",
      sourceLabel: currentSessionConfig.deviceLabel,
      sourceFormat: currentSessionConfig.sourceFormat,
      targetFormat: currentSessionConfig.targetFormat,
      chunkDurationMs: currentSessionConfig.chunkDurationMs,
      targetLanguage: "ko",
    })
  );
  gatewaySessionStarted = true;
  flushQueue();
}

function onGatewayMessage(payload) {
  switch (payload.type) {

    case "provider.state":
      if (payload.status === "ready") {
        setStatus("active", "전사 준비됨 — " + (payload.provider === "local-ai-transcription" ? "로컬 AI" : "OpenAI"));
      } else if (payload.status === "error") {
        setStatus("error", "AI 연결 오류: " + payload.message);
      }
      break;

    case "transcription.delta":
      liveDeltaMap[payload.itemId] = (liveDeltaMap[payload.itemId] ?? "") + payload.delta;
      liveItemId = payload.itemId;
      setLiveDelta(liveDeltaMap[payload.itemId]);
      break;

    case "transcription.completed":
      if (payload.itemId === liveItemId) {
        setLiveDelta(null);
        liveItemId = null;
      }
      delete liveDeltaMap[payload.itemId];
      break;

    case "transcription.failed":
      if (payload.itemId === liveItemId) {
        setLiveDelta(null);
        liveItemId = null;
      }
      delete liveDeltaMap[payload.itemId];
      break;

    case "segment.upserted": {
      const seg = payload.segment;
      // seg는 { sourceText, translatedText, ... } 형태
      const ko = seg?.translatedText ?? seg?.translated_text ?? "";
      const src = seg?.sourceText ?? seg?.source_text ?? seg?.transcript ?? "";
      setLiveDelta(null);
      pushSegment(ko, src);
      if (isSessionRunning) setStatus("active", "캡처 중 ●");
      break;
    }

    case "gateway.error":
      setStatus("error", "게이트웨이 오류: " + payload.message);
      break;

    default:
      break;
  }

  // debug pane
  gatewayLog = [payload, ...gatewayLog].slice(0, 20);
  gatewayOutput.textContent = JSON.stringify(
    { state: gatewayState, log: gatewayLog },
    null,
    2
  );
}

function ensureGateway() {
  if (gatewaySocket && gatewaySocket.readyState !== WebSocket.CLOSED) return;

  gatewayState = "connecting";
  setStatus("idle", "게이트웨이 연결 중...");
  gatewaySocket = new WebSocket(DEFAULT_GATEWAY_URL);

  gatewaySocket.addEventListener("open", () => {
    gatewayState = "open";
    gatewayHelloSent = false;
    if (!gatewayHelloSent) {
      sendGateway(
        buildMsg("gateway.hello", { clientId: gatewayClientId, role: "desktop-capture" })
      );
      gatewayHelloSent = true;
    }
    sendSessionStartIfReady();
    flushQueue();
    setStatus("ready", "연결됨");
  });

  gatewaySocket.addEventListener("message", (ev) => {
    try {
      onGatewayMessage(JSON.parse(ev.data));
    } catch (_) {}
  });

  gatewaySocket.addEventListener("error", () => {
    gatewayState = "error";
    setStatus("error", "게이트웨이 연결 실패 — 캡처는 계속됩니다");
  });

  gatewaySocket.addEventListener("close", () => {
    gatewayState = "closed";
    if (isSessionRunning) setStatus("error", "연결 끊김");
  });
}

function closeGateway(reason) {
  if (currentSessionId && gatewaySessionStarted) {
    sendGateway(buildMsg("session.stop", { sessionId: currentSessionId, reason }), { queueIfUnavailable: false });
  }
  pendingGatewayMessages = [];
  gatewaySessionStarted  = false;
  gatewayHelloSent       = false;
  gatewayDropped         = 0;
  setLiveDelta(null);
  liveDeltaMap           = {};

  if (gatewaySocket && gatewaySocket.readyState === WebSocket.OPEN) {
    gatewaySocket.close();
  }
  gatewaySocket = null;
  gatewayState  = "idle";
}

// ─── Tauri event listeners ────────────────────────────────────────────────────
async function ensureListeners() {
  if (listenersRegistered || !window.__TAURI__?.event?.listen) return;
  listenersRegistered = true;
  const { listen } = window.__TAURI__.event;

  await listen("capture-session", (ev) => {
    const p = ev.payload;
    sessionEventLog = [p, ...sessionEventLog].slice(0, 8);
    sessionOutput.textContent = JSON.stringify(sessionEventLog, null, 2);

    if (p?.status === "running") {
      setButtons(true);
      setStatus("active", "캡처 중 ●");
    } else if (p?.status === "stopped" || p?.status === "failed") {
      setButtons(false);
      setStatus("idle", "대기 중");
      closeGateway(p.status);
    }
  });

  await listen("capture-metrics", (ev) => {
    latestMetrics = ev.payload;
    if (currentSessionId && gatewaySessionStarted) {
      sendGateway(
        buildMsg("capture.metrics", {
          sessionId: currentSessionId,
          chunkIndex: ev.payload.chunkIndex,
          inputFrames: ev.payload.inputFrames,
          outputFrames: ev.payload.outputFrames,
          peakLevel: ev.payload.peakLevel,
          silent: ev.payload.silentFlag,
          dataDiscontinuity: ev.payload.discontinuityFlag,
          sourceSampleRateHz: currentSessionConfig?.sourceFormat?.sampleRateHz ?? 0,
          chunkTimestampMs: ev.payload.timestampMs,
        }),
        { queueIfUnavailable: false }
      );
    }
    metricsOutput.textContent = JSON.stringify(
      { latestMetrics, chunk: latestChunk ? { idx: latestChunk.chunkIndex, ms: latestChunk.durationMs } : null },
      null, 2
    );
  });

  await listen("audio-chunk", (ev) => {
    latestChunk = ev.payload;
    if (currentSessionId && gatewaySessionStarted) {
      sendGateway(
        buildMsg("audio.chunk.append", {
          sessionId: currentSessionId,
          chunkIndex: ev.payload.chunkIndex,
          pcm16Base64: ev.payload.pcm16Base64,
          frameCount: ev.payload.frames,
          sampleRateHz: ev.payload.sampleRateHz,
          durationMs: ev.payload.durationMs,
          peakLevel: ev.payload.peakLevel,
          timestampMs: ev.payload.timestampMs,
        }),
        { queueIfUnavailable: false }
      );
    }
  });
}

// ─── Snapshot (debug) ────────────────────────────────────────────────────────
async function loadSnapshot() {
  if (!window.__TAURI__?.core?.invoke) {
    snapshotOutput.textContent = "Tauri 런타임 없음 — dev 모드로 실행해야 표시됩니다.";
    return;
  }
  snapshotOutput.textContent = "진단 읽는 중...";
  try {
    await ensureListeners();
    const data = await window.__TAURI__.core.invoke("desktop_bootstrap_snapshot");
    snapshotOutput.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    snapshotOutput.textContent = String(e);
  }
}

// ─── Start / Stop ────────────────────────────────────────────────────────────
async function startCapture() {
  if (!window.__TAURI__?.core?.invoke) return;
  try {
    await ensureListeners();
    currentSessionId     = saveSessionId();
    currentSessionConfig = null;
    gatewayDropped       = 0;
    ensureGateway();
    const res = await window.__TAURI__.core.invoke("start_capture_session");
    currentSessionConfig = res.config ?? null;
    sessionEventLog = [res, ...sessionEventLog].slice(0, 8);
    sessionOutput.textContent = JSON.stringify(sessionEventLog, null, 2);
    sendSessionStartIfReady();
    setButtons(true);
    setStatus("active", "캡처 중 ●");
  } catch (e) {
    currentSessionId = null;
    currentSessionConfig = null;
    closeGateway("start-failed");
    setStatus("error", "캡처 시작 실패: " + (e?.message ?? String(e)));
    setButtons(false);
  }
}

async function stopCapture() {
  if (!window.__TAURI__?.core?.invoke) return;
  try {
    const res = await window.__TAURI__.core.invoke("stop_capture_session");
    sessionEventLog = [res, ...sessionEventLog].slice(0, 8);
    sessionOutput.textContent = JSON.stringify(sessionEventLog, null, 2);
    closeGateway("manual-stop");
    currentSessionId     = null;
    currentSessionConfig = null;
    setButtons(false);
    setStatus("idle", "대기 중");
  } catch (e) {
    setStatus("error", "중지 오류: " + (e?.message ?? String(e)));
  }
}

// ─── Event bindings ──────────────────────────────────────────────────────────
startButton?.addEventListener("click", () => void startCapture());
stopButton?.addEventListener("click",  () => void stopCapture());

resetSessionBtn?.addEventListener("click", () => {
  if (sessionIdInput) sessionIdInput.value = DEFAULT_SESSION_ID;
  saveSessionId();
});

// ─── Init ────────────────────────────────────────────────────────────────────
initSessionId();
setButtons(false);
setStatus("idle", "초기화 중...");
void loadSnapshot();
