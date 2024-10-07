//  Copyright 2022 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* Speedy library
   Copyright 2017
   Google

   This file is licensed under the Apache 2.0 license.

   TODO(malcolmslaney): Need to write tests for higher-level functions
   TODO(malcolmslaney): Make sure I get the same response no matter the input
     sample rate.
   TODO(malcolmslaney): check to see if hysteresis is better if center point
     is part of forward and backward average (so we don't get a big impulse at
     the center.)
   TODO(malcolmslaney): Make sure all the spectrogram history allocs gets checked.
*/

#include "speedy.h"
#include <assert.h>
#include <complex.h>   // IWYU pragma: keep
#include <math.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef  KISS_FFT
#include "kiss_fft.h"
#else
#include "fftw3.h"
#endif  /* KISS_FFT */

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* A simple structure to implement a digital first order filter. */
struct FirstOrderFilterStruct{
  float state;  // Double for extra precision for long time constants
  float alpha;
};

FirstOrderFilter CreateFirstOrderFilter(float time_constant_in_samples) {
  FirstOrderFilter fof = (FirstOrderFilter)malloc(sizeof(struct FirstOrderFilterStruct));
  if (fof) {
    DesignFirstOrderLowpassFilter(fof, time_constant_in_samples);
  }
  return fof;
}

void DesignFirstOrderLowpassFilter(FirstOrderFilter fof,
                                   float time_constant_in_samples) {
  fof->state = 0.0;
  if (time_constant_in_samples > 0) {
    fof->alpha = exp(-1.0/time_constant_in_samples);
  } else {
    fof->alpha = 0.0;
  }
}

float IterateFirstOrderFilter(FirstOrderFilter fof, float input) {
  fof->state = (1-fof->alpha)*input + fof->alpha*fof->state;
  return fof->state;
}

void ResetFirstOrderFilter(FirstOrderFilter fof) {
  fof->state = 0;
}

void SetFirstOrderFilterState(FirstOrderFilter fof, float new_state) {
  fof->state = new_state;
}

void DeleteFirstOrderFilter(FirstOrderFilter fof) {
  free(fof);
}

#define  kFrameRateHz  100.0    /* in Hz */

/* Make this buffer bigger than necessary to facilitate testing. */
#define  kTemporalHysteresisBufferSize  2*(kTemporalHysteresisFuture+kTemporalHysteresisPast+1)

#define  kSpectrogramBufferSize  (kTemporalHysteresisFuture+kTemporalHysteresisPast+1)

/* These symbols are defined here with the preprocessor so we can keep their
 * values in the stream structure. This is needed to allow the test code to
 * query the internal state of the calculations, on a frame-by-frame basis.
 * These defines make their purpose clear, and makes the equations look like the
 * original matlab code (for easier checking.)
 */
/* These first state variables are computed at AddData time */
#define s_energy_lp                          (stream->features[1])
#define s_energy_local                       (stream->features[2])
#define s_energy_compressed                  (stream->features[3])
#define s_time_energy                        (stream->features[12])

/* These next variables are calculated at ComputeTension time */
#define s_energy_hysteresis                  (stream->features[4])
#define s_spectrogram_energy                 (stream->features[0])
#define s_low_energy_threshold               (stream->features[14])
#define s_low_energy_frame                   (stream->features[5])
#define s_local_spectral_difference          (stream->features[6])
#define s_emphasis_weighted_local_difference (stream->features[7])
#define s_emphasis_weighted_lpf              (stream->features[8])
#define s_relative_spectral_difference       (stream->features[9])
#define s_speech_changes                     (stream->features[10])
#define s_time_spectral                      (stream->features[13])

#define s_audio_tension                      (stream->features[11])
#define kFeatureValueCount                   15


/*****************************************************************************
 * speedyStreamStruct - Contains all the state for the stream.
 *****************************************************************************/
struct speedyStreamStruct {
  int sample_rate;                        /* samples per second, Hz */
  int window_size;                        /* Number of samples in analysis */
  int fft_size;                           /* Should be > window_size */
  float* window;                          /* Cache the window for later use */
  float* input;
  /* Last frame number received for processing via speedyAddData() */
  int64_t current_time;
  float* spectrogram;                     /* Output of FFT routine, temporary */
  float* last_spectrogram;
  float* spectrogram_history[kSpectrogramBufferSize];
  float* normalized_spectrogram;
  float* normalized_last_spectrogram;
#ifdef  KISS_FFT
  kiss_fft_cpx* input_buffer;
  kiss_fft_cpx* fft_buffer;
  kiss_fft_cfg spectrogram_plan;
#else
  fftw_complex* input_buffer;
  fftw_complex* fft_buffer;
  fftw_plan spectrogram_plan;
#endif  /* KISS_FFT */
  float *hysteresis_buffer;
  int64_t hysteresis_index;    /* So it never wraps, even with long input */
  float preemph_state;
  /* The following four variables are means over a long utterance and are used
   * to normalize the calculations below.
   */
  float mean_spectrogram_energy;
  float mean_emphasis_weighted_local_difference;
  float mean_emphasis_weighted_lpf;
  float mean_relative_spectral_difference;
  float max_energy_hysteresis;
  /* Skip the next skip_frame_count frames because of low energy. */
  int skip_frame_count;

  struct FirstOrderFilterStruct energy_filter;
  struct FirstOrderFilterStruct difference_filter;

  /* Internal state for speed feedback loop. */
  float current_duration;        /* How much time have we consumed so far? */
  float desired_duration;        /* How much time should we consume so far? */

  /* Internal state for debugging and testing purposes. */
  int skipped_frames;
  float features[kFeatureValueCount];
};

/* Just used for debugging */
/*
void speedyMSG(char* format, ...)
{
    char buffer[4096];
    va_list ap;
    FILE* file;

    va_start(ap, format);
    vsprintf((char* )buffer, (char*)format, ap);
    va_end(ap);
    file=fopen("/tmp/speedy.log", "a");
    fprintf(file, "%s", buffer);
    fclose(file);
}
*/

/* From: http://stackoverflow.com/questions/11720656/modulo-operation-with-negative-numbers
 * Do this because we need to get positive and negative inputs right.
 */
int modulo(int x, int N){
    return (x % N + N) % N;
}


/* Create a speedy stream.  Return NULL only if we are out of memory and cannot
   allocate the stream. Design the windows and filters, initialize the FFT
   package, and allocate all the storage. */
speedyStream speedyCreateStream(int sample_rate) {
  speedyStream stream = (speedyStream)calloc(1,
                                             sizeof(struct speedyStreamStruct));

  if (stream == NULL) {
    return NULL;
  }
  stream->window_size = (int)(1.5*sample_rate/(float)kFrameRateHz);
  stream->fft_size = 2*stream->window_size;
  stream->sample_rate = sample_rate;
  stream->current_time = 0;
  stream->preemph_state = 0.0;
  stream->hysteresis_index = 0;
  stream->input = (float *) malloc(sizeof(float) * stream->window_size);
  stream->hysteresis_buffer = (float *) malloc(sizeof(float) *
                                               kTemporalHysteresisBufferSize);
#ifdef  KISS_FFT
  stream->fft_buffer = (kiss_fft_cpx *) malloc(sizeof(kiss_fft_cpx) *
                                               stream->fft_size);
  stream->input_buffer = (kiss_fft_cpx *) malloc(sizeof(kiss_fft_cpx) *
                                                 stream->fft_size);
#else
  stream->fft_buffer = (fftw_complex *) fftw_malloc(sizeof(fftw_complex) *
                                                    stream->fft_size);
  stream->input_buffer = (fftw_complex *) fftw_malloc(sizeof(fftw_complex) *
                                                      stream->fft_size);
#endif  /* KISS_FFT */
  stream->normalized_spectrogram = (float *) malloc(sizeof(float) *
                                                    stream->fft_size);
  stream->normalized_last_spectrogram = (float *) malloc(sizeof(float) *
                                                         stream->fft_size);
  stream->spectrogram = (float *) malloc(sizeof(float) * stream->fft_size);
  stream->spectrogram_plan = 0;    /* Will allocate later. */
  stream->window = (float *) malloc(sizeof(float)*stream->window_size);

  int i, j;
  for (i=0; i < kSpectrogramBufferSize; i++) {
    stream->spectrogram_history[i] = (float *) malloc(sizeof(float)*
                                                       stream->fft_size);
    for (j=0; j < stream->fft_size; j++) {
     stream->spectrogram_history[i][j] = 0.0;
    }
  }
  if (!stream->input || !stream->input_buffer || !stream->spectrogram ||
      !stream->hysteresis_buffer || !stream->fft_buffer ||
      !stream->normalized_spectrogram || !stream->normalized_last_spectrogram) {
    speedyDestroyStream(stream);
    return NULL;
  }
  /* Design the Hamming window used when computing the spectrogram. */
  for (i=0; i < stream->window_size; i++) {
    stream->window[i] = 0.54 - 0.46*cos(2*M_PI*i / (stream->window_size-1.0));
  }
  /* The following constants were calculated from the Matlab implementation
   * by running the feature calculation over the BillForShortExerpt and
   * calculating the mean for each feature.
   */
  stream->mean_spectrogram_energy = 2.14204;
  stream->mean_emphasis_weighted_local_difference = 123.837;
  stream->mean_emphasis_weighted_lpf = 123.979;
  stream->mean_relative_spectral_difference = 0.971975;
  stream->max_energy_hysteresis = 1.41421;
#ifdef  KISS_FFT
  stream->spectrogram_plan = kiss_fft_alloc(stream->fft_size, 0, NULL, NULL);
#else
  /* Initialize the FFT software.  Use complex->complex because that is what is
   * done internally by FFTW.
   */
  stream->spectrogram_plan = fftw_plan_dft_1d(stream->fft_size,
                                              stream->input_buffer,
                                              stream->fft_buffer,
                                              FFTW_FORWARD, FFTW_ESTIMATE);
#endif  /* KISS_FFT */
  if (!stream->spectrogram_plan) {
    speedyDestroyStream(stream);
    return NULL;
  }

  for (i=0; i < kTemporalHysteresisBufferSize; i++){
    stream->hysteresis_buffer[i] = 0.0;
  }
  DesignFirstOrderLowpassFilter(&stream->energy_filter, kFrameRateHz);
  SetFirstOrderFilterState(&stream->energy_filter,
                           stream->mean_spectrogram_energy);
  DesignFirstOrderLowpassFilter(&stream->difference_filter, kFrameRateHz);
  SetFirstOrderFilterState(&stream->difference_filter,
                           stream->mean_emphasis_weighted_local_difference);
  stream->skip_frame_count = 1;          /* Skip the first frame */

  stream->current_duration = 0.0;
  stream->desired_duration = 0.0;

  return stream;
}

/* Destroy the speedy stream by first freeing all the allocated storage. */
void speedyDestroyStream(speedyStream stream) {
  if (stream->input) free(stream->input);
  if (stream->hysteresis_buffer) free(stream->hysteresis_buffer);
#ifdef  KISS_FFT
  if (stream->fft_buffer) free(stream->fft_buffer);
  if (stream->input_buffer) free(stream->input_buffer);
  if (stream->spectrogram_plan) free(stream->spectrogram_plan);
  kiss_fft_cleanup();
#else
  if (stream->fft_buffer) fftw_free(stream->fft_buffer);
  if (stream->input_buffer) fftw_free(stream->input_buffer);
  if (stream->spectrogram_plan) fftw_destroy_plan(stream->spectrogram_plan);
#endif  /* KISS_FFT */
  if (stream->normalized_spectrogram) free(stream->normalized_spectrogram);
  if (stream->normalized_last_spectrogram) {
      free(stream->normalized_last_spectrogram);
  }
  if (stream->spectrogram) free(stream->spectrogram);
  if (stream->window) free(stream->window);
  int i;
  for (i=0; i < kSpectrogramBufferSize; i++) {
    if (stream->spectrogram_history[i]) {
      free(stream->spectrogram_history[i]);
    }
  }
  free(stream);
}

int speedyInputFrameSize(speedyStream stream) {
  assert(stream);
  return stream->window_size;
}

int speedyInputFrameStep(speedyStream stream) {
  assert(stream);
  return stream->sample_rate / kFrameRateHz;
}

int speedyFFTSize(speedyStream stream) {
  assert(stream);
  return stream->fft_size;
}

float speedyBinToFreq(speedyStream stream, int bin_number) {
  assert(stream);
  return bin_number * (stream->sample_rate/(float)stream->fft_size);
}

int speedyFreqToBin(speedyStream stream, float freq) {
  assert(stream);
  return round(freq*stream->fft_size/stream->sample_rate);
}

float *speedyGetSpectrogram(speedyStream stream) {
  assert(stream);
  return stream->spectrogram;
}

float *speedyGetNormalizedSpectrogram(speedyStream stream) {
  assert(stream);
  return stream->normalized_spectrogram;
}

/* Get a copy of the internal Speedy state so we can inspect and plot it.
 * When dumped into a matlab array and plotted, the following legend can be used
 * to label each line of data.  Note: Must agree with the defines above.

 legend(...
  'spectrogram\_energy', ...
  'energy\_lp', ...
  'energy\_local', ...
  'energy\_compressed', ...
  'energy\_hysteresis', ...
  'low\_energy\_frame', ...
  'local\_spectral\_difference', ...
  'emphasis\_weighted\_local\_difference', ...
  'emphasis\_weighted\_lpf', ...
  'relative\_spectral\_difference', ...
  'speech\_changes', ...
  'audio\_tension', ...
  'time\_energy', ...
  'time\_spectral', ...
  'low\_energy\_threshold');

*/

float* speedyGetInternalState(speedyStream stream) {
  assert(stream);
  return stream->features;
}

float* speedyGetInternalSpectrogram(speedyStream stream) {
  assert(stream);
  return stream->spectrogram;
}

float* speedyGetInternalNormalizedSpectrogram(speedyStream stream) {
  assert(stream);
  return stream->normalized_spectrogram;
}

/*****************************************************************************
 * Functions run at AddData time.  When the user sends data to Speedy, only
 * the computations that don't depend on future time are done at this time.
 * These state variables are computed at this time:
 *       s_energy_lp, s_energy_local, s_energy_compressed
 * and the compressed energy is sent to the hysteresis buffer for use later.
 * (The rest of the computations are done when the tension is computed.)
 *****************************************************************************/

/* Implement the standard preemphasis filter used in speech analysis systems.
 * Do the filtering in place, returning the count samples in the input array.
 * In Matlab this is written: filter([1 -.97], 1, input).
 */
void speedyPreemphasisFilter(speedyStream stream, float* input, int length) {
  int i;
  assert(stream);
  assert(input);
  for (i=0; i < length; i++) {
    float last_sample = input[i];
    input[i] = 1.0*input[i] - 0.97*stream->preemph_state;
    stream->preemph_state = last_sample;
  }
}


/* Compute the spectrogram of an input signal (usually after preemphasis.)
 * This is done at AddData time.  It is used in the energy calculation at this
 * point, and also saved in a ring buffer for use when calculating the spectral
 * difference, at ComputeTension time.
 */
#ifdef  KISS_FFT
float kiss_abs(kiss_fft_cpx c) {
  return sqrt(c.r*c.r + c.i*c.i);
}

float* speedySpectrogram(speedyStream stream, float input[]) {
  assert(stream);
  int i;
  for (i=0; i < stream->window_size; i++) {
    stream->input_buffer[i].r = input[i] * stream->window[i];
    stream->input_buffer[i].i = 0.0;
  }
  for (i=stream->window_size; i < stream->fft_size; i++) {
    stream->input_buffer[i].r = 0.0;
    stream->input_buffer[i].i = 0.0;
  }
  kiss_fft(stream->spectrogram_plan, stream->input_buffer, stream->fft_buffer);
  for (i=0; i < stream->fft_size; i++) {
    stream->spectrogram[i] = kiss_abs(stream->fft_buffer[i]);
  }
  return stream->spectrogram;
}

#else

float* speedySpectrogram(speedyStream stream, float input[]) {
  assert(stream);
  int i;
  for (i=0; i < stream->window_size; i++) {
    stream->input_buffer[i] = CMPLX(input[i] * stream->window[i], 0);
  }
  for (i=stream->window_size; i < stream->fft_size; i++) {
    stream->input_buffer[i] = CMPLX(0, 0);
  }
  fftw_execute(stream->spectrogram_plan); /* repeat as needed */
  for (i=0; i < stream->fft_size; i++) {
    complex double b = stream->fft_buffer[i];
    stream->spectrogram[i] = cabs(b);
  }
  return stream->spectrogram;
}
#endif  /* KISS_FFT */

void speedySaveSpectrogramData(speedyStream stream, float spectrogram[],
                              int64_t at_time) {
  int i;
  for (i=0; i < stream->fft_size; i++) {
    stream->spectrogram_history[modulo(at_time, kSpectrogramBufferSize)][i] =
        spectrogram[i];
  }
}

float *speedyGetSpectrogramAtTime(speedyStream stream, int64_t at_time) {
    return stream->spectrogram_history[modulo(at_time, kSpectrogramBufferSize)];
}

/* To estimate local emphasis, we first calculate the local energy. We
 * simply use the frame energies from the spectrogram that is used in the
 * speaking-rate estimation (see Section 2.2).
 *
 * We use a single-pole low-pass filter to estimate the average energy
 * (tau = 1 sec). We then divide the local energy by the low-passed local
 * energy. Start this LPF with mean energy so we don't get a massive startup
 * glitch.
 *
 * Our compressive function is hard limiting (to below 2) followed by a
 * square-root function.
 *
 * This functions computes:
 *   my_spectrogram_energy: Energy of this spectrogram slice
 *   s_energy_lp: Low pass version over time of my_spectrogram_energy
 *   s_energy_local: Spectrogram energy relative to low-pass energy
 *   s_energy_compressed: Sqrt compressed local energy (limited to sqrt(2))
 *   s_time_energy: current time for the above state variables
 * And then add the s_energy_compressed energy to the hystersis buffer.
 */

void speedyComputeLocalEnergy(speedyStream stream, float *spectrogram,
                              int64_t at_time) {
  int i;
  float my_spectrogram_energy = 0.0;
  for (i=1; i < stream->fft_size/2; i++) {
    my_spectrogram_energy += stream->spectrogram[i]*stream->spectrogram[i];
  }
  s_energy_lp = IterateFirstOrderFilter(&stream->energy_filter,
                                      my_spectrogram_energy);
  s_energy_local = my_spectrogram_energy / s_energy_lp;
  s_energy_compressed = sqrt(s_energy_local>2 ? 2.0 : s_energy_local);
  speedyAddToHysteresisBuffer(stream, s_energy_compressed, at_time);
  s_time_energy = at_time;
}

float speedyGetEnergyCompressed(speedyStream stream) {
  return s_energy_compressed;
}

/* speedyAddData() - Add data to our stream, and compute the current energy.
 * This is called to add some data to the speedy calculation and does the
 * following steps:
 *   Copy the data into our own buffer and apply the preemphasis filter
 *   Compute the spectrogram
 *   Compute the local energy
 *   and update the system's time stamp.
 * The rest of the calculations are done when speedyComputeTension() is called.
 * Input is assumed to be +/-1 for floating point data, and short data is
 * divided by 2^15 to put short data in the same range.
 */
void speedyAddData(speedyStream stream, const float input[], int64_t at_time) {
  int i;
  /* Need to make a copy since preemphasis filter is done in place. */
  for (i=0; i < stream->window_size; i++) {
    stream->input[i] = input[i];
  }
  speedyPreemphasisFilter(stream, stream->input, stream->window_size);
  float* spectrogram = speedySpectrogram(stream, stream->input);
  speedySaveSpectrogramData(stream, spectrogram, at_time);
  speedyComputeLocalEnergy(stream, spectrogram, at_time);
  stream->current_time = at_time;
}

void speedyAddDataShort(speedyStream stream, const int16_t input[],
                        int64_t at_time) {
  int i;
  /* Need to make a copy since preemphasis filter is done in place. */
  for (i=0; i < stream->window_size; i++) {
    stream->input[i] = input[i]/32768.0;
  }
  speedyPreemphasisFilter(stream, stream->input, stream->window_size);
  float* spectrogram = speedySpectrogram(stream, stream->input);
  speedySaveSpectrogramData(stream, spectrogram, at_time);
  speedyComputeLocalEnergy(stream, spectrogram, at_time);
  stream->current_time = at_time;
}

/*****************************************************************************
 * Functions run at ComputeTension time. These functions need data in the future
 * so they must be run when the tension is actually calculated, when we've saved
 * enough frames so we can look "forward" in time.
 *****************************************************************************/
/*
 * We apply a tapered, temporal hysteresis to the frame emphasis to give
 * our final local-emphasis estimates. Our hysteresis extends the influence
 * of each frame-emphasis value by 80 msec into the past and 120 msec into
 * the future. To minimize discontinuities in the local emphasis, we taper
 * the hysteresis, using a triangle function to extend each frame-emphasis
 * value into the past and future. We then find the maximum tapered future
 * (or current) frame-emphasis value and the maximum tapered past (or
 * current) frame-emphasis value. The local-emphasis value is the average
 * of these two tapered maxima.                     Section 2.1.4
 */

/* This definition is used as syntatic sugar for just the next two functions.
 * The same "function" name can then be used for reading and writing the array.
 */
#define HysteresisBuffer(time) \
  (stream->hysteresis_buffer[modulo((time), kTemporalHysteresisBufferSize)])

float speedyEvaluateHysteresis(speedyStream stream, int64_t at_time) {
  assert(stream);
  assert(at_time >= 0);
  int i;
  float past_max = 0.0, future_max = 0.0;
  for (i=0; i <= kTemporalHysteresisFuture; i++) {
    float value = HysteresisBuffer(at_time+i);
    value *= (kTemporalHysteresisFuture-i)/(float)kTemporalHysteresisFuture;
    if (value > future_max) {
      future_max = value;
    }
  }
  for (i=0; i <= kTemporalHysteresisPast; i++) {
    float value = HysteresisBuffer(at_time-i);
    value *= (kTemporalHysteresisPast-i)/(float)kTemporalHysteresisPast;
    if (value > past_max) {
      past_max = value;
    }
  }
  return (past_max + future_max)/2.0;
}

/* Store the compressed energy (computed at AddData time) to the hysteresis
 * ring buffer
 */
void speedyAddToHysteresisBuffer(speedyStream stream, float value,
                                 int64_t at_time) {
  assert(stream);
  HysteresisBuffer(at_time) = value;
}


/* Normalize a spectogram slice by it's maximum. Return the overall (sum of the)
 * energy in the frame.  Set bins that are less than 100x less than the max to
 * -1 to indicate they should NOT be included in the processing to follow.
 * The resulting normalized spectrogram slice is put into the normalized array.
 * BUG FIX: remove the 100x threshold check, since we do it later.
 */
float speedyNormalizeByEnergy(const float *spectrogram, float *normalized,
                               int length) {
  assert(spectrogram);
  assert(normalized);
  int i;
  float signal_energy = 0.0;           /* Overall frame energy */
  float max_value = 0;                 /* Maximum of this frame. */
  for (i=1; i < length; i++) {           /* Skip the DC term */
    signal_energy += spectrogram[i] * spectrogram[i];
    if (spectrogram[i] > max_value) {
      max_value = spectrogram[i];
    }
  }
  const float eps = 2.2204e-16;        /* Smallest increment around 1.0 */
  float inverse_norm = 1.0/(sqrt(signal_energy)+eps);
  for (i=0; i < length; i++) {
    normalized[i] = spectrogram[i]*inverse_norm;
  }
  return signal_energy;
}

/*
 * This functions computes:
 *  s_energy_hysteresis: Energy estimate taking into account the hysteresis
 *  s_spectrogram_energy: spectrogram energy normalized across the frame
 *  s_low_energy_threshold: Threshold based on hysteresis to judge a frame too
 *                          low
 *  s_low_energy_frame: A frame we've judged to be low enery and will be
 *                      ignored.
 *  s_local_spectral_difference: frame to frame change of normalized
 *                               specdtrograms
 *  s_emphasis_weighted_local_difference: above weighted by s_energy_hysteresis
 *  s_emphasis_weighted_lpf: Low pass smoothing of
 *                           emphasis_weighted_local_difference.
 *  s_relative_spectral_difference: local_difference divided by lpf version.
 */
void speedyComputeSpectralDifference(speedyStream stream,
                                     const float *spectrogram,
                                     const float *last_spectrogram,
                                     int64_t at_time) {
  assert(stream);
  assert(spectrogram);
  assert(last_spectrogram);
  int i;
  s_energy_hysteresis = speedyEvaluateHysteresis(stream, at_time);
  s_spectrogram_energy = speedyNormalizeByEnergy(spectrogram,
                                                 stream->normalized_spectrogram,
                                                 stream->fft_size/2);
  speedyNormalizeByEnergy(last_spectrogram,
                          stream->normalized_last_spectrogram,
                          stream->fft_size/2);
  /* Bug: This probably should be based on energy_local, not hysteresis.  Bug
   * in the Matlab code too.
   */
  s_low_energy_threshold = 0.04*stream->max_energy_hysteresis;
  s_low_energy_frame = s_spectrogram_energy <= s_low_energy_threshold;
  s_time_spectral = at_time;
  if (s_low_energy_frame) {
    /* No longer need to do this since we keep track of the bad bins before
     * computing relative difference.
     */
    stream->skip_frame_count = 1;
  }
  if (stream->skip_frame_count-- > 0) {
    s_low_energy_frame = 1;
    s_local_spectral_difference = 0;
    s_emphasis_weighted_local_difference = 0;
    s_relative_spectral_difference = 0;
    s_speech_changes = 0;
    /* Be sure to update the state of the emphasis_weighted filter. */
    s_emphasis_weighted_lpf =
        IterateFirstOrderFilter(&stream->difference_filter, 0.0);
    return;
  } else {
    stream->skip_frame_count = 0;
  }

  float bin_threshold = 0;
  for (i=1; i < stream->fft_size/2; i++) {
    bin_threshold = fmax(bin_threshold, spectrogram[i]);
  }
  bin_threshold /= 100.0;                         /* 40dB below the peak. */

  s_local_spectral_difference = 0.0;
  const float eps = 2.2204e-16;        /* Smallest increment around 1.0 */
  for (i=1; i < stream->fft_size/2; i++) {
    if (spectrogram[i] > bin_threshold && last_spectrogram[i] > bin_threshold) {
      s_local_spectral_difference +=
          fabs(log((stream->normalized_spectrogram[i] + eps) /
                   (stream->normalized_last_spectrogram[i] + eps)));
    }
  }
  s_emphasis_weighted_local_difference = s_local_spectral_difference *
                                         s_energy_hysteresis;
  s_emphasis_weighted_lpf =
      IterateFirstOrderFilter(&stream->difference_filter,
                              s_emphasis_weighted_local_difference);
  s_relative_spectral_difference = s_emphasis_weighted_local_difference /
      (s_emphasis_weighted_lpf + 0.01*stream->mean_emphasis_weighted_lpf);
  s_speech_changes = fmin(s_relative_spectral_difference,
                          4*stream->mean_relative_spectral_difference);
}

/*****************************************************************************
 * Actually compute the tension in the speech now.  Use the
 *  speedyComputeSpectralDifference
 * function to do most of the work.
 *****************************************************************************/

float speedyGetSpeechChanges(speedyStream stream) {
  return s_speech_changes;
}

int64_t speedyGetCurrentTime(speedyStream stream) {
  assert(stream);
  return stream->current_time;
}


/* We don't want the normal value of E here, as we want to reuse this variable
 * name. (So we can match the Mach1 paper's signal names.)
 */
#undef  M_E

int speedyComputeTension(speedyStream stream, int64_t at_time, float* tension) {
  assert(tension);
  float a = 1/2.0, b=1/4.0, M_E = 0.7, M_S = 1.0;
  if (at_time + kTemporalHysteresisFuture <= stream->current_time) {
    float *current_spectrogram = speedyGetSpectrogramAtTime(stream, at_time);
    float *previous_spectrogram = speedyGetSpectrogramAtTime(stream, at_time-1);
    s_energy_hysteresis = speedyEvaluateHysteresis(stream, at_time);
    speedyComputeSpectralDifference(stream, current_spectrogram,
                                    previous_spectrogram, at_time);
    s_audio_tension = a*(s_energy_hysteresis-M_E) + b*(s_speech_changes-M_S);
    *tension = s_audio_tension;
    return 1;
  }
  return 0;
}

float speedyComputeSpeedFromTension(float tension, float R_g,
                                    float duration_feedback_strength,
                                    speedyStream stream) {
  float requested_speed;

  if (R_g > 1.0) {
    requested_speed = fmax(1, R_g + (1-R_g)*tension);
  } else {
    requested_speed = fmin(1, R_g - (1-R_g)*tension);
  }
  if (duration_feedback_strength > 0){
    float excess_duration = stream->current_duration - stream->desired_duration;
    requested_speed += duration_feedback_strength * excess_duration;
  }
  float frame_duration = 1.0/kFrameRateHz;
  stream->current_duration += frame_duration/requested_speed;
  stream->desired_duration += frame_duration/R_g;

  return requested_speed;
}
