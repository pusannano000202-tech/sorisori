mod audio;

use audio::capture::bootstrap_capture_backend;
use audio::format::bootstrap_format_adapter;
use audio::worker::{
    AudioChunkEvent, CaptureMetricsEvent, CaptureSessionEvent, CaptureWorker, CaptureWorkerConfig,
    WorkerEvent, AUDIO_CHUNK_EVENT, CAPTURE_METRICS_EVENT, CAPTURE_SESSION_EVENT,
};
use serde::Serialize;
use std::sync::{mpsc::Receiver, Mutex};
use std::thread::{self, JoinHandle};
use tauri::{AppHandle, Emitter, State};

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
        .invoke_handler(tauri::generate_handler![
            desktop_bootstrap_snapshot,
            start_capture_session,
            stop_capture_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sorisori desktop app");
}
