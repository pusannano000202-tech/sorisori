use super::format::AudioFormatDescriptor;
use serde::Serialize;

#[cfg(windows)]
use std::collections::VecDeque;
#[cfg(windows)]
use std::sync::OnceLock;
#[cfg(windows)]
use std::time::{Duration, Instant};

#[cfg(windows)]
use wasapi::{
    initialize_mta, BufferInfo, DeviceEnumerator, DeviceState, Direction, SampleType, StreamMode,
    WasapiError, WaveFormat,
};

const PREVIEW_DURATION_MS: u32 = 120;

#[cfg(windows)]
const PROBE_TIMEOUT_MS: u32 = 450;
#[cfg(windows)]
const EVENT_WAIT_SLICE_MS: u32 = 75;

#[cfg(windows)]
static MTA_INIT: OnceLock<Result<(), String>> = OnceLock::new();

#[derive(Debug, Clone)]
pub struct LoopbackCaptureProbe {
    pub source_format: AudioFormatDescriptor,
    pub raw_bytes: Vec<u8>,
    pub captured_frames: usize,
}

#[derive(Debug)]
pub struct CaptureBootstrap {
    pub snapshot: CaptureBackendSnapshot,
    pub probe: Option<LoopbackCaptureProbe>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureBackendSnapshot {
    pub backend: String,
    pub operating_mode: String,
    pub is_platform_ready: bool,
    pub implementation_state: String,
    pub device: Option<CaptureDeviceSnapshot>,
    pub probe: Option<CaptureProbeSnapshot>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDeviceSnapshot {
    pub friendly_name: String,
    pub state: String,
    pub mix_format: AudioFormatDescriptor,
    pub capture_format: AudioFormatDescriptor,
    pub default_period_hns: i64,
    pub min_period_hns: i64,
    pub buffer_frame_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureProbeSnapshot {
    pub status: String,
    pub observed_packets: usize,
    pub observed_frames: usize,
    pub captured_bytes: usize,
    pub event_timeouts: usize,
    pub preview_duration_ms: u32,
    pub last_packet_frames: Option<u32>,
    pub last_buffer: Option<CaptureBufferSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureBufferSnapshot {
    pub data_discontinuity: bool,
    pub silent: bool,
    pub timestamp_error: bool,
    pub device_position: u64,
    pub qpc_position: u64,
}

pub fn bootstrap_capture_backend() -> CaptureBootstrap {
    #[cfg(windows)]
    {
        return probe_windows_loopback_backend().unwrap_or_else(|error| CaptureBootstrap {
            snapshot: CaptureBackendSnapshot {
                backend: "wasapi-loopback".to_string(),
                operating_mode: "shared-loopback".to_string(),
                is_platform_ready: true,
                implementation_state: "probe-error".to_string(),
                device: None,
                probe: None,
                notes: vec![
                    "WASAPI loopback backend is available, but the runtime probe failed."
                        .to_string(),
                    error,
                ],
            },
            probe: None,
        });
    }

    #[cfg(not(windows))]
    {
        CaptureBootstrap {
            snapshot: CaptureBackendSnapshot {
                backend: "unsupported-platform".to_string(),
                operating_mode: "none".to_string(),
                is_platform_ready: false,
                implementation_state: "blocked".to_string(),
                device: None,
                probe: None,
                notes: vec!["Desktop MVP capture path is Windows-only for now.".to_string()],
            },
            probe: None,
        }
    }
}

#[cfg(windows)]
fn probe_windows_loopback_backend() -> Result<CaptureBootstrap, String> {
    ensure_mta()?;

    let enumerator = DeviceEnumerator::new().map_err(|error| error.to_string())?;
    let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|error| error.to_string())?;

    let friendly_name = device
        .get_friendlyname()
        .map_err(|error| error.to_string())?;
    let device_state = device_state_label(device.get_state().map_err(|error| error.to_string())?);

    let mut audio_client = device
        .get_iaudioclient()
        .map_err(|error| error.to_string())?;
    let mix_format = audio_client
        .get_mixformat()
        .map_err(|error| error.to_string())?;
    let preferred_format = preferred_capture_format(&mix_format);

    let (default_period_hns, min_period_hns) = audio_client
        .get_device_period()
        .map_err(|error| error.to_string())?;

    let (capture_format, init_note) = match initialize_loopback_client(
        &mut audio_client,
        &preferred_format,
        min_period_hns,
    ) {
        Ok(()) => (
            wave_format_to_descriptor(&preferred_format),
            "Loopback probe initialized with preferred float32 format.".to_string(),
        ),
        Err(primary_error) => {
            initialize_loopback_client(&mut audio_client, &mix_format, min_period_hns).map_err(
                |fallback_error| {
                    format!(
                        "Failed to initialize preferred float32 loopback format ({primary_error}) \
and fallback mix format ({fallback_error})."
                    )
                },
            )?;
            (
                wave_format_to_descriptor(&mix_format),
                format!(
                    "Preferred float32 format was rejected, so the probe fell back to the device mix format: {primary_error}."
                ),
            )
        }
    };

    let event_handle = audio_client
        .set_get_eventhandle()
        .map_err(|error| error.to_string())?;
    let buffer_frame_count = audio_client
        .get_buffer_size()
        .map_err(|error| error.to_string())?;
    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|error| error.to_string())?;

    let blockalign = usize::from(capture_format.block_align_bytes);
    let target_frames =
        ((u64::from(capture_format.sample_rate_hz) * u64::from(PREVIEW_DURATION_MS)) / 1000).max(1)
            as usize;
    let target_bytes = target_frames.saturating_mul(blockalign);

    audio_client
        .start_stream()
        .map_err(|error| error.to_string())?;

    let mut captured_bytes = VecDeque::with_capacity(target_bytes.max(blockalign));
    let mut observed_packets = 0usize;
    let mut observed_frames = 0usize;
    let mut event_timeouts = 0usize;
    let mut last_packet_frames = None;
    let mut last_buffer = None;

    let deadline = Instant::now() + Duration::from_millis(u64::from(PROBE_TIMEOUT_MS));
    while captured_bytes.len() < target_bytes && Instant::now() < deadline {
        match event_handle.wait_for_event(EVENT_WAIT_SLICE_MS) {
            Ok(()) => {
                observed_packets += drain_capture_packets(
                    &capture_client,
                    blockalign,
                    &mut captured_bytes,
                    &mut observed_frames,
                    &mut last_packet_frames,
                    &mut last_buffer,
                )?;
            }
            Err(WasapiError::EventTimeout) => {
                event_timeouts += 1;
            }
            Err(error) => {
                let _ = audio_client.stop_stream();
                return Err(error.to_string());
            }
        }
    }

    let _ = audio_client.stop_stream();

    let raw_bytes: Vec<u8> = captured_bytes.into_iter().collect();
    let preview_duration_ms = if capture_format.sample_rate_hz > 0 {
        ((observed_frames as u64) * 1000 / u64::from(capture_format.sample_rate_hz)) as u32
    } else {
        0
    };

    let implementation_state = if observed_frames > 0 {
        "preview-captured"
    } else {
        "initialized-waiting-for-audio"
    };
    let probe_status = if observed_frames > 0 {
        "captured-preview"
    } else {
        "initialized-no-active-audio"
    };

    let snapshot = CaptureBackendSnapshot {
        backend: "wasapi-loopback".to_string(),
        operating_mode: "shared-loopback".to_string(),
        is_platform_ready: true,
        implementation_state: implementation_state.to_string(),
        device: Some(CaptureDeviceSnapshot {
            friendly_name,
            state: device_state,
            mix_format: wave_format_to_descriptor(&mix_format),
            capture_format: capture_format.clone(),
            default_period_hns,
            min_period_hns,
            buffer_frame_count,
        }),
        probe: Some(CaptureProbeSnapshot {
            status: probe_status.to_string(),
            observed_packets,
            observed_frames,
            captured_bytes: raw_bytes.len(),
            event_timeouts,
            preview_duration_ms,
            last_packet_frames,
            last_buffer,
        }),
        notes: vec![
            init_note,
            "The runtime probe opens the default render endpoint in loopback mode and captures a short preview."
                .to_string(),
            "If no packet arrives, the backend is still considered ready; it usually means nothing was actively playing during the probe."
                .to_string(),
            "Virtual audio cable is intentionally not required for MVP.".to_string(),
        ],
    };

    let probe = (!raw_bytes.is_empty()).then_some(LoopbackCaptureProbe {
        source_format: capture_format,
        raw_bytes,
        captured_frames: observed_frames,
    });

    Ok(CaptureBootstrap { snapshot, probe })
}

#[cfg(windows)]
fn drain_capture_packets(
    capture_client: &wasapi::AudioCaptureClient,
    blockalign: usize,
    captured_bytes: &mut VecDeque<u8>,
    observed_frames: &mut usize,
    last_packet_frames: &mut Option<u32>,
    last_buffer: &mut Option<CaptureBufferSnapshot>,
) -> Result<usize, String> {
    let mut packets = 0usize;

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

        let before = captured_bytes.len();
        let buffer_info = capture_client
            .read_from_device_to_deque(captured_bytes)
            .map_err(|error| error.to_string())?;
        let new_bytes = captured_bytes.len().saturating_sub(before);
        if new_bytes == 0 {
            break;
        }

        packets += 1;
        *observed_frames += new_bytes / blockalign;
        *last_packet_frames = Some(packet_frames);
        *last_buffer = Some(buffer_snapshot(&buffer_info));
    }

    Ok(packets)
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
fn device_state_label(state: DeviceState) -> String {
    format!("{state:?}")
}

#[cfg(windows)]
fn buffer_snapshot(buffer_info: &BufferInfo) -> CaptureBufferSnapshot {
    CaptureBufferSnapshot {
        data_discontinuity: buffer_info.flags.data_discontinuity,
        silent: buffer_info.flags.silent,
        timestamp_error: buffer_info.flags.timestamp_error,
        device_position: buffer_info.index,
        qpc_position: buffer_info.timestamp,
    }
}

#[cfg(windows)]
fn ensure_mta() -> Result<(), String> {
    MTA_INIT
        .get_or_init(|| initialize_mta().ok().map_err(|error| error.to_string()))
        .clone()
}
