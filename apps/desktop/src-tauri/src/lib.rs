mod audio;

use audio::capture::bootstrap_capture_backend;
use audio::format::bootstrap_format_adapter;
use audio::worker::{
    AudioChunkEvent, CaptureMetricsEvent, CaptureSessionEvent, CaptureWorker, CaptureWorkerConfig,
    WorkerEvent, AUDIO_CHUNK_EVENT, CAPTURE_METRICS_EVENT, CAPTURE_SESSION_EVENT,
};
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::{mpsc::Receiver, Mutex};
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBootstrapSnapshot {
    app: String,
    platform: String,
    capture: audio::capture::CaptureBackendSnapshot,
    format_adapter: audio::format::AudioFormatAdapterSnapshot,
    next_step: String,
}

#[derive(Debug)]
struct CaptureSession {
    worker: CaptureWorker,
    bridge_handle: Option<JoinHandle<()>>,
}

#[derive(Debug, Default)]
struct CaptureSessionStore(Mutex<Option<CaptureSession>>);

struct SidecarStore {
    local_ai: Mutex<Option<Child>>,
    realtime: Mutex<Option<Child>>,
    pipeline: Mutex<Option<Child>>,
}

impl Default for SidecarStore {
    fn default() -> Self {
        Self {
            local_ai: Mutex::new(None),
            realtime: Mutex::new(None),
            pipeline: Mutex::new(None),
        }
    }
}

impl SidecarStore {
    fn kill_all(&self) {
        for guard in [&self.local_ai, &self.realtime, &self.pipeline] {
            if let Ok(mut lock) = guard.lock() {
                if let Some(mut child) = lock.take() {
                    let _ = child.kill();
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarLogEvent {
    sidecar: String,
    line: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureSessionCommandResponse {
    status: String,
    message: String,
    config: Option<CaptureWorkerConfig>,
}

#[tauri::command]
fn desktop_bootstrap_snapshot() -> DesktopBootstrapSnapshot {
    let capture_bootstrap = bootstrap_capture_backend();

    DesktopBootstrapSnapshot {
        app: "sorisori-desktop".to_string(),
        platform: std::env::consts::OS.to_string(),
        capture: capture_bootstrap.snapshot,
        format_adapter: bootstrap_format_adapter(capture_bootstrap.probe.as_ref()),
        next_step:
            "Use start_capture_session to run the persistent loopback worker, validate capture-metrics/audio-chunk events, then wire the normalized stream into the realtime gateway."
                .to_string(),
    }
}

#[tauri::command]
fn start_capture_session(
    app: AppHandle,
    session_store: State<'_, CaptureSessionStore>,
) -> Result<CaptureSessionCommandResponse, String> {
    let mut guard = session_store
        .0
        .lock()
        .map_err(|_| "Capture session state lock was poisoned.".to_string())?;

    if guard.is_some() {
        return Err("Capture session is already running.".to_string());
    }

    let (worker, event_rx) = CaptureWorker::start()?;
    let config = worker.config.clone();

    let bridge_handle = match spawn_capture_bridge(app, event_rx) {
        Ok(handle) => handle,
        Err(error) => {
            worker.stop()?;
            return Err(error);
        }
    };

    *guard = Some(CaptureSession {
        worker,
        bridge_handle: Some(bridge_handle),
    });

    Ok(CaptureSessionCommandResponse {
        status: "started".to_string(),
        message: format!(
            "Capture session started on `{}` with {} input frames per chunk.",
            config.device_label, config.input_chunk_frames
        ),
        config: Some(config),
    })
}

#[tauri::command]
fn stop_capture_session(
    session_store: State<'_, CaptureSessionStore>,
) -> Result<CaptureSessionCommandResponse, String> {
    let session = {
        let mut guard = session_store
            .0
            .lock()
            .map_err(|_| "Capture session state lock was poisoned.".to_string())?;

        guard
            .take()
            .ok_or_else(|| "No capture session is currently running.".to_string())?
    };

    let config = session.worker.config.clone();
    session.stop()?;

    Ok(CaptureSessionCommandResponse {
        status: "stopped".to_string(),
        message: "Capture session stopped.".to_string(),
        config: Some(config),
    })
}

impl CaptureSession {
    fn stop(mut self) -> Result<(), String> {
        self.worker.stop()?;

        if let Some(bridge_handle) = self.bridge_handle.take() {
            bridge_handle
                .join()
                .map_err(|_| "Capture bridge thread panicked while stopping.".to_string())?;
        }

        Ok(())
    }
}

fn spawn_capture_bridge(
    app: AppHandle,
    event_rx: Receiver<WorkerEvent>,
) -> Result<JoinHandle<()>, String> {
    thread::Builder::new()
        .name("capture-event-bridge".to_string())
        .spawn(move || {
            while let Ok(event) = event_rx.recv() {
                match event {
                    WorkerEvent::Session(payload) => emit_capture_session_event(&app, payload),
                    WorkerEvent::Metrics(payload) => emit_capture_metrics_event(&app, payload),
                    WorkerEvent::AudioChunk(payload) => emit_audio_chunk_event(&app, payload),
                }
            }
        })
        .map_err(|error| error.to_string())
}

fn emit_capture_session_event(app: &AppHandle, payload: CaptureSessionEvent) {
    let _ = app.emit(CAPTURE_SESSION_EVENT, payload);
}

fn emit_capture_metrics_event(app: &AppHandle, payload: CaptureMetricsEvent) {
    let _ = app.emit(CAPTURE_METRICS_EVENT, payload);
}

fn emit_audio_chunk_event(app: &AppHandle, payload: AudioChunkEvent) {
    let _ = app.emit(AUDIO_CHUNK_EVENT, payload);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CaptureSessionStore::default())
        .manage(SidecarStore::default())
        .setup(|app| {
            if let Err(e) = start_sidecars(app.handle()) {
                eprintln!("[sorisori] sidecar startup warning: {e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let sidecars = window.app_handle().state::<SidecarStore>();
                sidecars.kill_all();
            }
        })
        .invoke_handler(tauri::generate_handler![
            desktop_bootstrap_snapshot,
            start_capture_session,
            stop_capture_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sorisori desktop app");
}

fn spawn_stderr_reader(app: AppHandle, sidecar: &'static str, stderr: std::process::ChildStderr) {
    thread::Builder::new()
        .name(format!("sidecar-log-{sidecar}"))
        .spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(l) => {
                        let _ = app.emit(
                            "sidecar-log",
                            SidecarLogEvent { sidecar: sidecar.to_string(), line: l },
                        );
                    }
                    Err(_) => break,
                }
            }
        })
        .ok();
}

fn start_sidecars(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let sidecars = app.state::<SidecarStore>();
    let resource_dir = app.path().resource_dir()?;

    let triple = "x86_64-pc-windows-msvc";

    let local_ai_exe = resource_dir
        .join("sidecar-bin")
        .join(format!("sorisori-local-ai-{triple}.exe"));

    let realtime_exe = resource_dir
        .join("sidecar-bin")
        .join(format!("sorisori-realtime-{triple}.exe"));

    let pipeline_exe = resource_dir
        .join("sidecar-bin")
        .join(format!("sorisori-pipeline-{triple}.exe"));

    // local-ai (Python/faster-whisper)
    {
        let mut child = std::process::Command::new(&local_ai_exe)
            .env("LOCAL_AI_HOST", "127.0.0.1")
            .env("LOCAL_AI_PORT", "8789")
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start local-ai: {e} (path: {local_ai_exe:?})"))?;
        if let Some(stderr) = child.stderr.take() {
            spawn_stderr_reader(app.clone(), "local-ai", stderr);
        }
        *sidecars.local_ai.lock().unwrap() = Some(child);
    }

    // realtime gateway
    {
        let mut child = std::process::Command::new(&realtime_exe)
            .env("REALTIME_HOST", "127.0.0.1")
            .env("REALTIME_PORT", "8787")
            .env("LOCAL_AI_URL", "http://127.0.0.1:8789")
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start realtime: {e} (path: {realtime_exe:?})"))?;
        if let Some(stderr) = child.stderr.take() {
            spawn_stderr_reader(app.clone(), "realtime", stderr);
        }
        *sidecars.realtime.lock().unwrap() = Some(child);
    }

    // pipeline
    {
        let mut child = std::process::Command::new(&pipeline_exe)
            .env("PIPELINE_HOST", "127.0.0.1")
            .env("PIPELINE_PORT", "8788")
            .env("REALTIME_GATEWAY_WS_URL", "ws://127.0.0.1:8787/ws")
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start pipeline: {e} (path: {pipeline_exe:?})"))?;
        if let Some(stderr) = child.stderr.take() {
            spawn_stderr_reader(app.clone(), "pipeline", stderr);
        }
        *sidecars.pipeline.lock().unwrap() = Some(child);
    }

    Ok(())
}
