use super::capture::LoopbackCaptureProbe;
use dasp::Sample;
use rubato::{FftFixedIn, Resampler};
use serde::Serialize;

pub const TARGET_SAMPLE_RATE_HZ: u32 = 24_000;
pub const WORKER_CHUNK_DURATION_MS: u16 = 20;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFormatDescriptor {
    pub encoding: String,
    pub sample_rate_hz: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub valid_bits_per_sample: u16,
    pub block_align_bytes: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFormatConversionProbe {
    pub status: String,
    pub source_format: AudioFormatDescriptor,
    pub input_frames: usize,
    pub output_frames: usize,
    pub output_bytes: usize,
    pub peak_level: f32,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFormatAdapterSnapshot {
    pub capture_candidates: Vec<AudioFormatDescriptor>,
    pub target: AudioFormatDescriptor,
    pub chunk_duration_ms: u16,
    pub resampler: String,
    pub sample_converter: String,
    pub downmix_strategy: String,
    pub implementation_state: String,
    pub last_probe: Option<AudioFormatConversionProbe>,
}

pub fn bootstrap_format_adapter(
    capture_probe: Option<&LoopbackCaptureProbe>,
) -> AudioFormatAdapterSnapshot {
    let target = target_format();
    let last_probe = capture_probe.map(build_conversion_probe);
    let implementation_state = match &last_probe {
        Some(probe) if probe.status == "converted-preview" => "converted-preview".to_string(),
        Some(_) => "capture-ready-awaiting-compatible-float32-preview".to_string(),
        None => "waiting-for-capture-preview".to_string(),
    };

    AudioFormatAdapterSnapshot {
        capture_candidates: vec![
            AudioFormatDescriptor {
                encoding: "float32".to_string(),
                sample_rate_hz: 44_100,
                channels: 2,
                bits_per_sample: 32,
                valid_bits_per_sample: 32,
                block_align_bytes: 8,
            },
            AudioFormatDescriptor {
                encoding: "float32".to_string(),
                sample_rate_hz: 48_000,
                channels: 2,
                bits_per_sample: 32,
                valid_bits_per_sample: 32,
                block_align_bytes: 8,
            },
        ],
        target,
        chunk_duration_ms: WORKER_CHUNK_DURATION_MS,
        resampler: "rubato".to_string(),
        sample_converter: "dasp".to_string(),
        downmix_strategy: "average-all-channels-to-mono".to_string(),
        implementation_state,
        last_probe,
    }
}

fn build_conversion_probe(capture_probe: &LoopbackCaptureProbe) -> AudioFormatConversionProbe {
    match convert_loopback_preview(capture_probe) {
        Ok(result) => AudioFormatConversionProbe {
            status: "converted-preview".to_string(),
            source_format: capture_probe.source_format.clone(),
            input_frames: capture_probe.captured_frames,
            output_frames: result.output_frames,
            output_bytes: result.output_bytes,
            peak_level: result.peak_level,
            notes: vec![
                "Captured float32 loopback bytes were downmixed to mono, resampled, and converted to PCM16."
                    .to_string(),
            ],
        },
        Err(error) => AudioFormatConversionProbe {
            status: "conversion-skipped".to_string(),
            source_format: capture_probe.source_format.clone(),
            input_frames: capture_probe.captured_frames,
            output_frames: 0,
            output_bytes: 0,
            peak_level: 0.0,
            notes: vec![error],
        },
    }
}

fn convert_loopback_preview(
    capture_probe: &LoopbackCaptureProbe,
) -> Result<ConversionResult, String> {
    if capture_probe.source_format.encoding != "float32" {
        return Err(format!(
            "Conversion probe currently expects float32 input, but the loopback client produced `{}`.",
            capture_probe.source_format.encoding
        ));
    }

    let channels = usize::from(capture_probe.source_format.channels);
    if channels == 0 {
        return Err("Capture format reported zero channels.".to_string());
    }

    let bytes_per_frame = usize::from(capture_probe.source_format.block_align_bytes);
    if bytes_per_frame == 0 {
        return Err("Capture format reported zero block alignment.".to_string());
    }

    if capture_probe.raw_bytes.len() < bytes_per_frame {
        return Err(
            "Loopback preview did not capture enough data to build a conversion probe.".to_string(),
        );
    }

    if capture_probe.raw_bytes.len() % bytes_per_frame != 0 {
        return Err("Loopback preview byte count was not aligned to full frames.".to_string());
    }

    let mono_samples = downmix_to_mono_f32(&capture_probe.raw_bytes, channels)?;
    let peak_level = mono_samples
        .iter()
        .fold(0.0f32, |peak, sample| peak.max(sample.abs()));

    let resampled = if capture_probe.source_format.sample_rate_hz == 24_000 {
        mono_samples
    } else {
        resample_preview_mono_channel(&mono_samples, capture_probe.source_format.sample_rate_hz)?
    };

    let pcm16 = resampled
        .into_iter()
        .map(|sample| sample.clamp(-1.0, 1.0).to_sample::<i16>())
        .collect::<Vec<_>>();

    Ok(ConversionResult {
        output_frames: pcm16.len(),
        output_bytes: pcm16.len() * std::mem::size_of::<i16>(),
        peak_level,
    })
}

fn downmix_to_mono_f32(raw_bytes: &[u8], channels: usize) -> Result<Vec<f32>, String> {
    let bytes_per_frame = channels * std::mem::size_of::<f32>();
    if raw_bytes.len() % bytes_per_frame != 0 {
        return Err("Float32 preview bytes were not frame-aligned.".to_string());
    }

    let mut mono_samples = Vec::with_capacity(raw_bytes.len() / bytes_per_frame);

    for frame in raw_bytes.chunks_exact(bytes_per_frame) {
        let mut sum = 0.0f32;
        for channel_index in 0..channels {
            let start = channel_index * 4;
            let sample = f32::from_le_bytes(
                frame[start..start + 4]
                    .try_into()
                    .map_err(|_| "Could not parse float32 sample bytes.".to_string())?,
            );
            sum += sample;
        }
        mono_samples.push(sum / channels as f32);
    }

    Ok(mono_samples)
}

pub fn convert_raw_float32_chunk_to_pcm16(
    raw_bytes: &[u8],
    source_format: &AudioFormatDescriptor,
    mut resampler: Option<&mut FftFixedIn<f32>>,
) -> Result<(Vec<i16>, f32), String> {
    if source_format.encoding != "float32" {
        return Err(format!(
            "Worker conversion currently expects float32 input, but received `{}`.",
            source_format.encoding
        ));
    }

    let channels = usize::from(source_format.channels);
    if channels == 0 {
        return Err("Capture format reported zero channels.".to_string());
    }

    let bytes_per_frame = usize::from(source_format.block_align_bytes);
    if bytes_per_frame == 0 {
        return Err("Capture format reported zero block alignment.".to_string());
    }

    if raw_bytes.is_empty() {
        return Err("No raw audio bytes were provided for worker conversion.".to_string());
    }

    if raw_bytes.len() % bytes_per_frame != 0 {
        return Err("Worker chunk byte count was not aligned to full frames.".to_string());
    }

    let mono_samples = downmix_to_mono_f32(raw_bytes, channels)?;
    let peak_level = mono_samples
        .iter()
        .fold(0.0f32, |peak, sample| peak.max(sample.abs()));

    let resampled = if source_format.sample_rate_hz == TARGET_SAMPLE_RATE_HZ {
        mono_samples
    } else {
        let resampler = resampler.as_deref_mut().ok_or_else(|| {
            format!(
                "Source sample rate {} Hz requires an initialized rubato resampler.",
                source_format.sample_rate_hz
            )
        })?;
        resample_mono_channel(resampler, &mono_samples)?
    };

    let pcm16 = resampled
        .into_iter()
        .map(|sample| sample.clamp(-1.0, 1.0).to_sample::<i16>())
        .collect::<Vec<_>>();

    Ok((pcm16, peak_level))
}

pub fn fixed_chunk_frames_for_rate(input_rate_hz: u32) -> usize {
    ((u64::from(input_rate_hz) * u64::from(WORKER_CHUNK_DURATION_MS)) / 1000).max(1) as usize
}

pub fn build_mono_resampler(
    input_rate_hz: u32,
    chunk_frames: usize,
) -> Result<FftFixedIn<f32>, String> {
    if chunk_frames < 2 {
        return Err("Need at least two input frames to build the rubato resampler.".to_string());
    }

    FftFixedIn::<f32>::new(
        input_rate_hz as usize,
        TARGET_SAMPLE_RATE_HZ as usize,
        chunk_frames,
        1,
        1,
    )
    .map_err(|error| error.to_string())
}

pub fn resample_mono_channel(
    resampler: &mut FftFixedIn<f32>,
    input: &[f32],
) -> Result<Vec<f32>, String> {
    let expected_frames = resampler.input_frames_next();
    if input.len() != expected_frames {
        return Err(format!(
            "Rubato resampler expects exactly {expected_frames} frames per chunk, but received {}.",
            input.len()
        ));
    }

    let channel_data = [input];
    let mut output = resampler
        .process(&channel_data, None)
        .map_err(|error| error.to_string())?;

    output
        .pop()
        .ok_or_else(|| "Rubato returned no mono output channel.".to_string())
}

fn resample_preview_mono_channel(input: &[f32], input_rate_hz: u32) -> Result<Vec<f32>, String> {
    let chunk_frames = fixed_chunk_frames_for_rate(input_rate_hz);
    let mut resampler = build_mono_resampler(input_rate_hz, chunk_frames)?;
    let mut output = Vec::new();

    for chunk in input.chunks(chunk_frames) {
        let mut padded_chunk = vec![0.0f32; chunk_frames];
        padded_chunk[..chunk.len()].copy_from_slice(chunk);

        let mut resampled_chunk = resample_mono_channel(&mut resampler, &padded_chunk)?;
        if chunk.len() < chunk_frames {
            let keep_frames =
                ((resampled_chunk.len() * chunk.len()) + (chunk_frames - 1)) / chunk_frames;
            resampled_chunk.truncate(keep_frames.max(1));
        }
        output.extend(resampled_chunk);
    }

    Ok(output)
}

fn target_format() -> AudioFormatDescriptor {
    AudioFormatDescriptor {
        encoding: "pcm16".to_string(),
        sample_rate_hz: TARGET_SAMPLE_RATE_HZ,
        channels: 1,
        bits_per_sample: 16,
        valid_bits_per_sample: 16,
        block_align_bytes: 2,
    }
}

#[derive(Debug)]
struct ConversionResult {
    output_frames: usize,
    output_bytes: usize,
    peak_level: f32,
}

#[cfg(test)]
mod tests {
    use super::{
        build_mono_resampler, convert_loopback_preview, convert_raw_float32_chunk_to_pcm16,
        fixed_chunk_frames_for_rate, AudioFormatDescriptor,
    };
    use crate::audio::capture::LoopbackCaptureProbe;

    #[test]
    fn converts_float32_stereo_preview_to_pcm16_mono_target() {
        let mut raw_bytes = Vec::new();
        for frame_index in 0..480 {
            let t = frame_index as f32 / 480.0;
            let sample = (t * std::f32::consts::PI * 4.0).sin() * 0.5;
            raw_bytes.extend_from_slice(&sample.to_le_bytes());
            raw_bytes.extend_from_slice(&sample.to_le_bytes());
        }

        let probe = LoopbackCaptureProbe {
            source_format: AudioFormatDescriptor {
                encoding: "float32".to_string(),
                sample_rate_hz: 48_000,
                channels: 2,
                bits_per_sample: 32,
                valid_bits_per_sample: 32,
                block_align_bytes: 8,
            },
            raw_bytes,
            captured_frames: 480,
        };

        let result = convert_loopback_preview(&probe).expect("preview conversion should work");
        assert!(result.output_frames > 0);
        assert_eq!(result.output_bytes, result.output_frames * 2);
        assert!(result.peak_level > 0.0);
    }

    #[test]
    fn resampler_requires_fixed_chunk_size() {
        let chunk_frames = fixed_chunk_frames_for_rate(48_000);
        let mut resampler =
            build_mono_resampler(48_000, chunk_frames).expect("resampler should build");

        let error = super::resample_mono_channel(&mut resampler, &[0.0; 64])
            .expect_err("wrong-sized chunk should fail");
        assert!(error.contains("expects exactly"));
    }

    #[test]
    fn converts_worker_chunk_with_reused_resampler() {
        let chunk_frames = fixed_chunk_frames_for_rate(48_000);
        let mut resampler =
            build_mono_resampler(48_000, chunk_frames).expect("resampler should build");

        let mut raw_bytes = Vec::new();
        for frame_index in 0..chunk_frames {
            let t = frame_index as f32 / chunk_frames as f32;
            let sample = (t * std::f32::consts::PI * 6.0).sin() * 0.35;
            raw_bytes.extend_from_slice(&sample.to_le_bytes());
            raw_bytes.extend_from_slice(&sample.to_le_bytes());
        }

        let (pcm16, peak_level) = convert_raw_float32_chunk_to_pcm16(
            &raw_bytes,
            &AudioFormatDescriptor {
                encoding: "float32".to_string(),
                sample_rate_hz: 48_000,
                channels: 2,
                bits_per_sample: 32,
                valid_bits_per_sample: 32,
                block_align_bytes: 8,
            },
            Some(&mut resampler),
        )
        .expect("worker chunk conversion should work");

        assert!(!pcm16.is_empty());
        assert_eq!(pcm16.len(), 480);
        assert!(peak_level > 0.0);
    }
}
