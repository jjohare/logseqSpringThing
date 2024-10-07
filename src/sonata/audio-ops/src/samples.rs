use crate::hanning_window;
use std::path::Path;

const PI: f32 = std::f32::consts::PI;
const I16MIN_F32: f32 = i16::MIN as f32;
const I16MAX_F32: f32 = i16::MAX as f32;
const MAX_WAV_VALUE_I16: f32 = 32767.0;

#[derive(Debug, Clone)]
pub struct AudioInfo {
    pub sample_rate: usize,
    pub num_channels: usize,
    pub sample_width: usize,
}

#[derive(Clone, Debug, Default)]
#[must_use]
pub struct AudioSamples(Vec<f32>);

impl AudioSamples {
    pub fn new(samples: Vec<f32>) -> Self {
        Self(samples)
    }
    pub fn as_slice(&self) -> &[f32] {
        self.0.as_slice()
    }
    pub fn as_vec(&self) -> &Vec<f32> {
        &self.0
    }
    pub fn as_mut_vec(&mut self) -> &mut Vec<f32> {
        &mut self.0
    }
    pub fn into_vec(self) -> Vec<f32> {
        self.0
    }
    pub fn take(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.0)
    }
    pub fn take_range(&mut self, mut  sample_range: std::ops::Range<usize>) -> Vec<f32> {
        sample_range.end = sample_range.end.min(self.len());
        Vec::from_iter(
            self.0.drain(sample_range)
        )
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    pub fn to_i16_vec(&self) -> Vec<i16> {
        if self.is_empty() {
            return Default::default();
        }
        let min_audio_value = self
            .0
            .iter()
            .min_by(|x, y| x.partial_cmp(y).unwrap())
            .unwrap();
        let max_audio_value = self
            .0
            .iter()
            .max_by(|x, y| x.partial_cmp(y).unwrap())
            .unwrap();
        let abs_max = max_audio_value
            .abs()
            .max(min_audio_value.abs())
            .max(f32::EPSILON);
        let audio_scale = MAX_WAV_VALUE_I16 / abs_max;
        Vec::from_iter(
            self.0
                .iter()
                .map(|f| (f * audio_scale).clamp(I16MIN_F32, I16MAX_F32) as i16),
        )
    }
    pub fn as_wave_bytes(&self) -> Vec<u8> {
        Vec::from_iter(self.to_i16_vec().into_iter().flat_map(|i| i.to_le_bytes()))
    }
    pub fn merge(&mut self, mut other: Self) {
        self.0.append(other.0.as_mut());
    }
    pub fn normalize(&mut self, max_value: f32) {
        if self.is_empty() {
            return;
        }
        let self_max = self
            .0
            .iter()
            .max_by(|x, y| x.partial_cmp(y).unwrap())
            .unwrap()
            .abs();
        let factor = self_max.max(max_value) / max_value.abs();
        self.0.iter_mut().for_each(|f| *f /= factor);
    }
    pub fn apply_hanning_window(&mut self) {
        let samples = self.0.as_mut_slice();
        let h_win = hanning_window::get_hann_window(samples.len());
        for (sample, ratio) in samples.iter_mut().zip(h_win) {
            *sample *= ratio;
        }
    }
    pub fn overlap_with(&mut self, other: &mut Self) {
        if !self.is_empty() {
            let (s1, s2) = (self.0.as_mut_slice(), other.0.as_mut_slice());
            s1.reverse();
            let num_samples = s1.len().min(s2.len());
            let attenuation_factor = 2.0 * num_samples as f32;
            (0..num_samples)
                .map(|t| (t as f32 * PI / attenuation_factor).sin())
                .zip(s1.iter_mut().zip(s2.iter_mut()))
                .for_each(|(r, (f1, f2))| {
                    *f1 *= r;
                    *f2 *= r;
                });
            s1.reverse();
        }
        self.0.append(other.0.as_mut());
    }
    pub fn fade_in(&mut self, fade_samples: usize) {
        let fade_samples = fade_samples.min(self.len());
        let attenuation_factor = fade_samples as f32;
        let fade = (0..fade_samples)
            .map(|i| i as f32 / attenuation_factor)
            // quarter of sine-wave
            .map(|f| (f * PI / 2.0).sin());
        let samples: &mut [f32] = self.0.as_mut_slice();
        for (i, f) in (0..fade_samples).zip(fade) {
            samples[i] *= f;
        }
    }
    pub fn fade_out(&mut self, fade_samples: usize) {
        let length = self.len();
        let fade_samples = fade_samples.min(length);
        let attenuation_factor = fade_samples as f32;
        let fade = (0..fade_samples)
            .map(|i| i as f32 / attenuation_factor)
            // quarter of sine-wave
            .map(|f| (f * PI / 2.0).sin());
        let samples: &mut [f32] = self.0.as_mut_slice();
        for (i, f) in (0..fade_samples).zip(fade) {
            samples[length - i - 1] *= f;
        }
    }
    pub fn crossfade(&mut self, fade_samples: usize) {
        let length = self.len();
        let fade_samples = fade_samples.min(length / 2);
        let attenuation_factor = (fade_samples - 1) as f32;
        let fade = (0..fade_samples)
            .map(|i| i as f32 / attenuation_factor)
            // quarter of sine-wave
            .map(|f| (f * PI / 2.0).sin());
        let samples: &mut Vec<f32> = self.0.as_mut();
        for (i, f) in (0..fade_samples).zip(fade) {
            samples[i] *= f;
            samples[length - i - 1] *= f;
        }
    }
    pub fn lowpass_filter(&mut self, sample_range: std::ops::Range<usize>, fc: f32) {
        let samples: &mut Vec<f32> = self.0.as_mut();
        for i in sample_range {
            let x = samples[i];
            samples[i] = if x < fc { x } else { 0.0 };
        }
    }
    pub fn highpass_filter(&mut self, sample_range: std::ops::Range<usize>, fc: f32) {
        let samples: &mut Vec<f32> = self.0.as_mut();
        for i in sample_range {
            let x = samples[i];
            samples[i] = if x > fc { x } else { 0.0 };
        }
    }
    pub fn strip_silence(&mut self, sample_range: std::ops::Range<usize>) {
        let samples: &mut Vec<f32> = self.0.as_mut();
        let nonsilence = Vec::from_iter(
            samples[sample_range.clone()]
                .iter()
                .filter(|f| **f > 0.0)
                .copied(),
        );
        self.0.splice(sample_range, nonsilence).count();
    }
    pub fn to_decibel(&self) -> Vec<f32> {
        Vec::from_iter(self.0.iter().map(|x| 20.0 * x.abs().log10()))
    }
}

impl From<AudioSamples> for Vec<f32> {
    fn from(other: AudioSamples) -> Self {
        other.into_vec()
    }
}

impl From<Vec<f32>> for AudioSamples {
    fn from(other: Vec<f32>) -> Self {
        Self::new(other)
    }
}

impl IntoIterator for AudioSamples {
    type Item = f32;
    type IntoIter = std::vec::IntoIter<Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[derive(Debug, Clone)]
#[must_use]
pub struct Audio {
    pub samples: AudioSamples,
    pub info: AudioInfo,
    pub inference_ms: Option<f32>,
    pub sentence_boundary: Option<(usize, usize)>,
}

impl Audio {
    pub fn new(samples: AudioSamples, sample_rate: usize, inference_ms: Option<f32>) -> Self {
        Self {
            samples,
            inference_ms,
            info: AudioInfo {
                sample_rate,
                num_channels: 1,
                sample_width: 2,
            },
            sentence_boundary: None
        }
    }

    pub fn into_vec(self) -> Vec<f32> {
        self.samples.into_vec()
    }

    pub fn as_wave_bytes(&self) -> Vec<u8> {
        self.samples.as_wave_bytes()
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    pub fn duration_ms(&self) -> f32 {
        (self.len() as f32 / self.info.sample_rate as f32) * 1000.0f32
    }

    pub fn inference_ms(&self) -> Option<f32> {
        self.inference_ms
    }

    pub fn real_time_factor(&self) -> Option<f32> {
        let infer_ms = self.inference_ms?;
        let audio_duration = self.duration_ms();
        if audio_duration == 0.0 {
            return Some(0.0f32);
        }
        Some(infer_ms / audio_duration)
    }

    pub fn save_to_file(&self, filename: &Path) -> Result<(), crate::WaveWriterError> {
        crate::write_wave_samples_to_file(
            filename,
            self.samples.to_i16_vec().iter(),
            self.info.sample_rate as u32,
            self.info.num_channels as u32,
            self.info.sample_width as u32,
        )
    }
}

impl IntoIterator for Audio {
    type Item = f32;
    type IntoIter = std::vec::IntoIter<Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.samples.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fade_in() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let mut s1 = AudioSamples::from(data.clone());
        s1.fade_in(4);
        assert_eq!(s1.0[0], 0.0);
    }

    #[test]
    fn test_fade_out() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let mut s1 = AudioSamples::from(data.clone());
        s1.fade_out(4);
        assert_eq!(s1.0[7], 0.0);
    }

    #[test]
    fn test_overlap() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        let mut s1 = AudioSamples::from(data.clone());
        let mut s2 = AudioSamples::from(data.clone());
        s1.overlap_with(&mut s2);
        assert_eq!(s1.len(), data.len() * 2);
        let rs = s1.as_vec();
        assert_eq!(rs[7], 0.0);
        assert_eq!(rs[8], 0.0);
    }

    #[test]
    fn test_lowpass_filter() {
        let data = vec![0.0, 0.1, 2.2, 0.0, 0.5, 0.0, 0.7, 0.0];
        let mut s1 = AudioSamples::from(data.clone());
        s1.lowpass_filter(0..5, 0.5);
        assert_eq!(s1.into_iter().filter(|f| *f == 0.0).count(), 6);
    }

    #[test]
    fn test_highpass_filter() {
        let data = vec![0.0, 0.1, 2.2, 0.0, 0.5, 0.0, 0.7, 0.0];
        let mut s1 = AudioSamples::from(data.clone());
        s1.highpass_filter(0..s1.len(), 0.5);
        assert_eq!(s1.into_iter().filter(|f| *f != 0.0).count(), 2);
    }

    #[test]
    fn test_normalize() {
        let data = vec![0.0, 0.1, 2.2, 0.0, 0.5, 0.0, 0.7, 0.0];
        let mut s1 = AudioSamples::from(data.clone());
        s1.normalize(1.0);
        assert_eq!(
            s1.0.into_iter()
                .max_by(|x, y| x.partial_cmp(y).unwrap())
                .unwrap(),
            1.0
        );
    }

    #[test]
    fn test_strip_silence() {
        let data = vec![0.0, 0.1, 2.2, 0.0, 0.5, 0.0, 0.7, 0.0];
        let mut s1 = AudioSamples::from(data.clone());
        s1.strip_silence(0..s1.len());
        assert_eq!(s1.len(), 4);
    }
}
