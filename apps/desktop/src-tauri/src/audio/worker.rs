use super::format::{
    build_mono_resampler, convert_raw_float32_chunk_to_pcm16, fixed_chunk_frames_for_rate,
    AudioFormatDescriptor, TARGET_SAMPLE_RATE_HZ, WORKER_CHUNK_DURATION_MS,
};
use serde::Serialize;
use std::sync::mpsc::{self, Receiver, Sender, SyncSender};
use std::thread::{self, JoinHandle};

#[cfg(windows)]
use std::collections::VecDeque;
#[cfg(windows)]
use std::sync::mpsc::TryRecvError;
#[cfg(windows)]
use std::sync::OnceLock;
#[cfg(windows)]
use std::time::Instant;

#[cfg(windows)]
use base64::Engine;
#[cfg(windows)]
use rubato::FftFixedIn;
#[cfg(windows)]
use wasapi::{
    initialize_mta, DeviceEnumerator, Direction, Handle, SampleType, StreamMode, WasapiError,
    WaveFormat,
};

pub const AUDIO_CHUNK_EVENT: &str = "audio-chunk";
pub const CAPTURE_METRICS_EVENT: &str = "capture-metrics";
pub const CAPTURE_SESSION_EVENT: &str = "capture-session";

const COMMAND_CHANNEL_CAPACITY: usize = 1;
#[cfg(windows)]
const WORKER_EVENT_WAIT_SLICE_MS: u32 = 75;
#[cfg(windows)]
const SILENCE_PEAK_THRESHOLD: f32 = 0.0005;

#[cfg(windows)]
static MTA_INIT: OnceLock<Result<(), String>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureWorkerConfig {
    pub device_label: String,
    pub source_format: AudioFormatDescriptor,
    pub target_format: AudioFormatDescriptor,
    pub input_chunk_frames: usize,
    pub expected_output_frames: usize,
    pub chunk_duration_ms: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSessionEvent {
    pub status: String,
    pub message: String,
    pub device_label: Option<String>,
    pub source_format: Option<AudioFormatDescriptor>,
    pub target_format: AudioFormatDescriptor,
    pub input_chunk_frames: Option<usize>,
    pub expected_output_frames: Option<usize>,
    pub chunk_duration_ms: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureMetricsEvent {
    pub chunk_index: u64,
    pub timestamp_ms: u64,
    pub input_frames: usize,
    pub output_frames: usize,
    pub peak_level: f32,
    pub silent_flag: bool,
    pub discontinuity_flag: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioChunkEvent {
    pub chunk_index: u64,
    pub timestamp_ms: u64,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub frames: usize,
    pub duration_ms: u16,
    pub peak_level: f32,
    pub pcm16_base64: String,
}

#[derive(Debug)]
pub enum WorkerCommand {
    Stop,
}

#[derive(Debug, Clone)]
pub enum WorkerEvent {
    Session(CaptureSessionEvent),
    Metrics(CaptureMetricsEvent),
    AudioChunk(AudioChunkEvent),
}

#[derive(Debug)]
pub struct CaptureWorker {
    pub config: CaptureWorkerConfig,
    command_tx: SyncSender<WorkerCommand>,
    thread_handle: Option<JoinHandle<()>>,
}

impl CaptureWorker {
    pub fn start() -> Result<(Self, Receiver<WorkerEvent>), String> {
        #[cfg(not(windows))]
        {
            return Err(
                "Persistent loopback capture is currently only available on Windows.".to_string(),
            );
        }

        #[cfg(windows)]
        {
            let (command_tx, command_rx) = mpsc::sync_channel(COMMAND_CHANNEL_CAPACITY);
            let (event_tx, event_rx) = mpsc::channel();
            let (startup_tx, startup_rx) = mpsc::sync_channel(1);

            let thread_handle = thread::Builder::new()
                .name("loopback-capture-worker".to_string())
                .spawn(move || run_capture_thread(command_rx, event_tx, startup_tx))
                .map_err(|error| error.to_string())?;

            let config = match startup_rx.recv() {
                Ok(Ok(config)) => config,
                Ok(Err(error)) => {
                    let _ = thread_handle.join();
                    return Err(error);
                }
                Err(_) => {
                    let _ = thread_handle.join();
                    return Err("Capture worker exited before startup finished.".to_string());
                }
            };

            Ok((
                Self {
                    config,
                    command_tx,
                    thread_handle: Some(thread_handle),
                },
                event_rx,
            ))
        }
    }

    pub fn stop(mut self) -> Result<(), String> {
        let _ = self.command_tx.send(WorkerCommand::Stop);

        if let Some(thread_handle) = self.thread_handle.take() {
            thread_handle
                .join()
                .map_err(|_| "Capture worker thread panicked while stopping.".to_string())?;
        }

        Ok(())
    }
}

impl CaptureSessionEvent {
    fn running(config: &CaptureWorkerConfig) -> Self {
        Self {
            status: "running".to_string(),
            message: format!(
                "Persistent loopback capture is running on `{}`.",
                config.device_label
            ),
            device_label: Some(config.device_label.clone()),
            source_format: Some(config.source_format.clone()),
            target_format: config.target_format.clone(),
            input_chunk_frames: Some(config.input_chunk_frames),
            expected_output_frames: Some(config.expected_output_frames),
            chunk_duration_ms: config.chunk_duration_ms,
        }
    }

    fn stopped(config: &CaptureWorkerConfig, message: &str) -> Self {
        Self {
            status: "stopped".to_string(),
            message: message.to_string(),
            device_label: Some(config.device_label.clone()),
            source_format: Some(config.source_format.clone()),
            target_format: config.target_format.clone(),
            input_chunk_frames: Some(config.input_chunk_frames),
            expected_output_frames: Some(config.expected_output_frames),
            chunk_duration_ms: config.chunk_duration_ms,
        }
    }

    fn failed(message: String) -> Self {
        Self {
            status: "failed".to_string(),
            message,
            device_label: None,
            source_format: None,
            target_format: worker_target_format(),
            input_chunk_frames: None,
            expected_output_frames: Some(expected_output_frames()),
            chunk_duration_ms: WORKER_CHUNK_DURATION_MS,
        }
    }
}

fn worker_target_format() -> AudioFormatDescriptor {
    AudioFormatDescriptor {
        encoding: "pcm16".to_string(),
        sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
        channels: 1,
        bits_per_sample: 16,
        valid_bits_per_sample: 16,
        block_align_bytes: 2,
    }
}

fn expected_output_frames() -> usize {
    fixed_chunk_frames_for_rate(TARGET_SAMPLE_RATE_HZ)
}

#[cfg(windows)]
struct CaptureRuntime {
    config: CaptureWorkerConfig,
    audio_client: wasapi::AudioClient,
    capture_client: wasapi::AudioCaptureClient,
    event_handle: Handle,
    raw_chunk_bytes: usize,
    sample_queue: VecDeque<u8>,
    resampler: Option<FftFixedIn<f32>>,
}

#[cfg(windows)]
fn run_capture_thread(
    command_rx: Receiver<WorkerCommand>,
    event_tx: Sender<WorkerEvent>,
    startup_tx: SyncSender<Result<CaptureWorkerConfig, String>>,
) {
    let mut runtime = match setup_capture_runtime() {
        Ok(runtime) => runtime,
        Err(error) => {
            let _ = startup_tx.send(Err(error.clone()));
            let _ = event_tx.send(WorkerEvent::Session(CaptureSessionEvent::failed(error)));
            return;
        }
    };

    if let Err(error) = runtime.audio_client.start_stream() {
        let error = error.to_string();
        let _ = startup_tx.send(Err(error.clone()));
        let _ = event_tx.send(WorkerEvent::Session(CaptureSessionEvent::failed(error)));
        return;
    }

    let config = runtime.config.clone();
    let _ = startup_tx.send(Ok(config.clone()));
    let _ = event_tx.send(WorkerEvent::Session(CaptureSessionEvent::running(&config)));

    let started_at = Instant::now();
    let mut chunk_index = 0u64;
    let mut pending_silent = false;
    let mut pending_discontinuity = false;

    loop {
        match command_rx.try_recv() {
            Ok(WorkerCommand::Stop) | Err(TryRecvError::Disconnected) => {
                let _ = runtime.audio_client.stop_stream();
                let _ = event_tx.send(WorkerEvent::Session(CaptureSessionEvent::stopped(
                    &config,
                    "Capture session stopped.",
                )));
                break;
            }
            Err(TryRecvError::Empty) => {}
        }

        match runtime
            .event_handle
            .wait_for_event(WORKER_EVENT_WAIT_SLICE_MS)
        {
            Ok(()) => {
                if let Err(error) = drain_capture_packets(
                    &runtime.capture_client,
                    &mut runtime.sample_queue,
                    &mut pending_silent,
                    &mut pending_discontinuity,
                ) {
                    let _ = runtime.audio_client.stop_stream();
                    let _ = event_tx.send(WorkerEvent::Session(CaptureSessionEvent::failed(error)));
                    break;
                }

                while runtime.sample_queue.len() >= runtime.raw_chunk_bytes {
                    let raw_chunk =
                        pop_chunk_bytes(&mut runtime.sample_queue, runtime.raw_chunk_bytes);

                    let (samples, peak_level) = match convert_raw_float32_chunk_to_pcm16(
                        &raw_chunk,
                        &config.source_format,
                        runtime.resampler.as_mut(),
                    ) {
                        Ok(result) => result,
                        Err(error) => {
                            let _ = runtime.audio_client.stop_stream();
                            let _ = event_tx
                                .send(WorkerEvent::Session(CaptureSessionEvent::failed(error)));
                            return;
                        }
                    };

                    let timestamp_ms = started_at.elapsed().as_millis() as u64;
                    let output_frames = samples.len();
                    let silent_flag = pending_silent || peak_level <= SILENCE_PEAK_THRESHOLD;
                    let pcm16_bytes = samples
                        .iter()
                        .flat_map(|sample| sample.to_le_bytes())
                        .collect::<Vec<_>>();
                    let pcm16_base64 =
                        base64::engine::general_purpose::STANDARD.encode(pcm16_bytes);

                    let _ = event_tx.send(WorkerEvent::Metrics(CaptureMetricsEvent {
                        chunk_index,
                        timestamp_ms,
                        input_frames: config.input_chunk_frames,
                        output_frames,
                        peak_level,
                        silent_flag,
                        discontinuity_flag: pending_discontinuity,
                    }));

                    let _ = event_tx.send(WorkerEvent::AudioChunk(AudioChunkEvent {
                        chunk_index,
                        timestamp_ms,
                        sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
                        channels: 1,
                        frames: output_frames,
                        duration_ms: WORKER_CHUNK_DURATION_MS,
                        peak_level,
                        pcm16_base64,
                    }));

                    chunk_index += 1;
                    pending_silent = false;
                    pending_discontinuity = false;
                }
            }
            Err(WasapiError::EventTimeout) => {}
            Err(error) => {
                let _ = runtime.audio_client.stop_stream();
                let _ = event_tx.send(WorkerEvent::Session(CaptureSessionEvent::failed(
                    error.to_string(),
                )));
                break;
            }
        }
    }
}

#[cfg(windows)]
fn setup_capture_runtime() -> Result<CaptureRuntime, String> {
    ensure_mta()?;

    let enumerator = DeviceEnumerator::new().map_err(|error| error.to_string())?;
    let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|error| error.to_string())?;
    let device_label = device
        .get_friendlyname()
        .map_err(|error| error.to_string())?;

    let mut audio_client = device
        .get_iaudioclient()
        .map_err(|error| error.to_string())?;
    let mix_format = audio_client
        .get_mixformat()
        .map_err(|error| error.to_string())?;
    let preferred_format = preferred_capture_format(&mix_format);
    let (_, min_period_hns) = audio_client
        .get_device_period()
        .map_err(|error| error.to_string())?;

    let source_format =
        match initialize_loopback_client(&mut audio_client, &preferred_format, min_period_hns) {
            Ok(()) => wave_format_to_descriptor(&preferred_format),
            Err(primary_error) => {
                initialize_loopback_client(&mut audio_client, &mix_format, min_period_hns)
                    .map_err(|fallback_error| {
                        format!(
                        "Failed to initialize preferred float32 loopback format ({primary_error}) \
and fallback mix format ({fallback_error})."
                    )
                    })?;
                wave_format_to_descriptor(&mix_format)
            }
        };

    if source_format.encoding != "float32" {
        return Err(format!(
            "Persistent worker currently requires float32 loopback input, but initialized `{}`.",
            source_format.encoding
        ));
    }

    let event_handle = audio_client
        .set_get_eventhandle()
        .map_err(|error| error.to_string())?;
    let buffer_frame_count = audio_client
        .get_buffer_size()
        .map_err(|error| error.to_string())? as usize;
    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|error| error.to_string())?;

    let input_chunk_frames = fixed_chunk_frames_for_rate(source_format.sample_rate_hz);
    let raw_chunk_bytes = input_chunk_frames * usize::from(source_format.block_align_bytes);
    let resampler = if source_format.sample_rate_hz == TARGET_SAMPLE_RATE_HZ {
        None
    } else {
        Some(build_mono_resampler(
            source_format.sample_rate_hz,
            input_chunk_frames,
        )?)
    };

    let sample_queue = VecDeque::with_capacity(
        raw_chunk_bytes
            .saturating_mul(buffer_frame_count.max(2))
            .max(raw_chunk_bytes),
    );

    Ok(CaptureRuntime {
        config: CaptureWorkerConfig {
            device_label,
            source_format,
            target_format: worker_target_format(),
            input_chunk_frames,
            expected_output_frames: expected_output_frames(),
            chunk_duration_ms: WORKER_CHUNK_DURATION_MS,
        },
        audio_client,
        capture_client,
        event_handle,
        raw_chunk_bytes,
        sample_queue,
        resampler,
    })
}

#[cfg(windows)]
fn drain_capture_packets(
    capture_client: &wasapi::AudioCaptureClient,
    sample_queue: &mut VecDeque<u8>,
    pending_silent: &mut bool,
    pending_discontinuity: &mut bool,
) -> Result<(), String> {
    loop {
        let Some(packet_frames) = capture_client
            .get_next_packet_size()
            .map_err(|error| error.to_string())?
        else {
            break;
        };

        if packet_frames == 0 {
            break;
        }

        let buffer_info = capture_client
            .read_from_device_to_deque(sample_queue)
            .map_err(|error| error.to_string())?;
        *pending_silent |= buffer_info.flags.silent;
        *pending_discontinuity |= buffer_info.flags.data_discontinuity;
    }

    Ok(())
}

#[cfg(windows)]
fn pop_chunk_bytes(sample_queue: &mut VecDeque<u8>, chunk_len: usize) -> Vec<u8> {
    let mut chunk = Vec::with_capacity(chunk_len);
    for _ in 0..chunk_len {
        if let Some(byte) = sample_queue.pop_front() {
            chunk.push(byte);
        }
    }
    chunk
}

#[cfg(windows)]
fn initialize_loopback_client(
    audio_client: &mut wasapi::AudioClient,
    wave_format: &WaveFormat,
    buffer_duration_hns: i64,
) -> Result<(), String> {
    let stream_mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns,
    };
    audio_client
        .initialize_client(wave_format, &Direction::Capture, &stream_mode)
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn preferred_capture_format(mix_format: &WaveFormat) -> WaveFormat {
    let preferred_channels = usize::from(mix_format.get_nchannels().clamp(1, 2));
    WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        mix_format.get_samplespersec() as usize,
        preferred_channels,
        None,
    )
}

#[cfg(windows)]
fn wave_format_to_descriptor(wave_format: &WaveFormat) -> AudioFormatDescriptor {
    let bits_per_sample = wave_format.get_bitspersample();
    let valid_bits_per_sample = wave_format.get_validbitspersample();
    let encoding = match wave_format.get_subformat() {
        Ok(SampleType::Float) if bits_per_sample == 32 => "float32".to_string(),
        Ok(SampleType::Float) => format!("float{bits_per_sample}"),
        Ok(SampleType::Int) if bits_per_sample == 16 => "pcm16".to_string(),
        Ok(SampleType::Int) => format!("pcm{bits_per_sample}"),
        Err(_) => "unknown".to_string(),
    };

    AudioFormatDescriptor {
        encoding,
        sample_rate_hz: wave_format.get_samplespersec(),
        channels: wave_format.get_nchannels(),
        bits_per_sample,
        valid_bits_per_sample,
        block_align_bytes: wave_format.get_blockalign() as u16,
    }
}

#[cfg(windows)]
fn ensure_mta() -> Result<(), String> {
    MTA_INIT
        .get_or_init(|| initialize_mta().ok().map_err(|error| error.to_string()))
        .clone()
}
