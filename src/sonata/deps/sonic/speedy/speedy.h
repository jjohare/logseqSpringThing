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
   Copyright 2017-2022
   Google

   This file is licensed under the Apache 2.0 license.
*/

#ifndef SPEEDY_SPEEDY_SPEEDH_H_
#define SPEEDY_SPEEDY_SPEEDH_H_

/*
 * This library implements the Mach1 algorithm, aka Speedy described in this
 * paper: https://engineering.purdue.edu/~malcolm/interval/1997-061/writeup.html
 *
 * The typical calling sequence is something like:
 *   int output_time = 0;
 *   for (int input_time = 0; input_time < frame_count; input_time++) {
 *     int input_start = input_time * kStepSize;
 *     speedyAddData(stream_, &input[input_start], input_time);
 *     if (speedyComputeTension(stream_, output_time, &tension[output_time])) {
 *        Call SOLA to process some audio starting at output time..
 *       output_time++;
 *     }
 *   }
 *
 * Internally, this routine takes a buffer of data at a kFrameRate (100) Hz
 * rate (buffer is 150% of frame step size).  When adding data, the spectrogram
 * is computed and stored.  Then when the tension is requested the rest of the
 * analysis is done.
 *
 */

#ifdef __cplusplus
extern "C" {
#include <cstdint>
#else
#include <stdint.h>
#endif


struct speedyStreamStruct;  /* Defined internally in speedy.c */
typedef struct speedyStreamStruct* speedyStream;

/* Create a speedy stream.  Return NULL only if we are out of memory and cannot
 * allocate the stream.
 */
speedyStream speedyCreateStream(int sample_rate);
void speedyDestroyStream(speedyStream stream);

/* Data sent to Speedy must have this number of samples, and the output tension
 * is returned with the given frame step.
 */
int speedyInputFrameSize(speedyStream stream);      /* in samples */
int speedyInputFrameStep(speedyStream stream);      /* in samples */

/* Send some audio data (PCM) to the Speedy Calculator.  The size of the input
 * frame is equal to the output from speedyInputFrameSize(). Return the tension,
 * which is a number between X and Y, which can be converted into a speedup.
 */
void speedyAddData(speedyStream stream, const float input[], int64_t at_time);
void speedyAddDataShort(speedyStream stream, const int16_t input[],
                        int64_t at_time);

/* Compute the tension given the data we have already received (via
 * speedyAddData). Return a boolean indicating whether we have enough data to
 * compute the tension. The at_time is denominated in frames. The first frame
 * provided to speedyAddData is frame time 0, then the next is 1.
 */
int speedyComputeTension(speedyStream stream, int64_t at_time, float* tension);
float speedyComputeSpeedFromTension(float tension, float R_g,
                                    float duration_feedback_strength,
                                    speedyStream stream);
int64_t speedyGetCurrentTime(speedyStream stream);

/* The following functions are NOT designed to be user callable.  They are
 * defined here to make the internals of this function available for testing.
 */
float* speedySpectrogram(speedyStream stream, float input[]);
int speedyFFTSize(speedyStream stream);
float speedyBinToFreq(speedyStream stream, int bin_number);
int speedyFreqToBin(speedyStream stream, float freq);

float speedyEvaluateHysteresis(speedyStream stream, int64_t at_time);
void speedyAddToHysteresisBuffer(speedyStream stream, float value,
                                 int64_t at_time);
void speedyComputeSpectralDifference(speedyStream stream,
                                     const float *spectrogram,
                                     const float *last_spectrogram,
                                     int64_t at_time);
void speedyComputeLocalEnergy(speedyStream stream, float* spectrogram,
                              int64_t at_time);
void speedySaveSpectrogramData(speedyStream stream, float spectrogram[],
                               int64_t at_time);
float* speedyGetSpectrogramAtTime(speedyStream stream, int64_t at_time);

void speedyPreemphasisFilter(speedyStream stream, float *input, int length);

float* speedyGetNormalizedSpectrogram(speedyStream stream);
float* speedyGetSpectrogram(speedyStream stream);

#define kFeatureValueCount 15
float* speedyGetInternalState(speedyStream stream);
float* speedyGetInternalSpectrogram(speedyStream stream);
float* speedyGetInternalNormalizedSpectrogram(speedyStream stream);
float speedyGetEnergyCompressed(speedyStream stream);
float speedyGetSpeechChanges(speedyStream stream);
float speedyNormalizeByEnergy(const float* spectrogram, float* normalized,
                               int length);

/* A simple structure to implement a digital first order filter. */
struct FirstOrderFilterStruct;
typedef struct FirstOrderFilterStruct* FirstOrderFilter;

FirstOrderFilter CreateFirstOrderFilter(float time_constant_in_samples);
void DesignFirstOrderLowpassFilter(FirstOrderFilter fof,
                                   float time_constant_in_samples);
float IterateFirstOrderFilter(FirstOrderFilter fof, float input);
void ResetFirstOrderFilter(FirstOrderFilter fof);
void DeleteFirstOrderFilter(FirstOrderFilter fof);

/* Put this here so we can get the temporal delay right. */
#ifdef  MATCH_MATLAB
/* Matlab version is backwards, and since this is what was tested with subjects
 * on Turk, we need to match it.
 */
#define  kTemporalHysteresisFuture   8  /* Frames */
#define  kTemporalHysteresisPast    12  /* Frames */
#else
/* This is what the paper said we wanted to do. */
#define  kTemporalHysteresisFuture  12  /* Frames */
#define  kTemporalHysteresisPast     8  /* Frames */
#endif

#ifdef __cplusplus
}
#endif

#endif /* SPEEDY_SPEEDY_SPEEDH_H_ */
