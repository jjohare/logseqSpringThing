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

#ifndef THIRD_PARTY_SPEEDY_SONIC_sonic2LIB_H_
#define THIRD_PARTY_SPEEDY_SONIC_sonic2LIB_H_

#ifdef __cplusplus
extern "C" {
#endif

/* This new library implements the non-linear speedup algorithm known as speedy
 * and is implemented as a shim between libsonic users, and the original code.
 * We don't change the original libsonic code.  Instead we redefine the
 * original function names, when the library is compiled, to include the
 * word "Int".  This sonic2library defines new versions of the original
 * function name (i.e. sonicCreateStream), and then calls the original
 * name via its new name (i.e. sonicIntCreateStream).
 *
 * Define this symbol, before loading the sonic.h library, so all the original
 * file names are redefined.  Then #undef the variable names so the code here
 * can define the original function names (which are what users are calling).
 */
#define  SONIC_INTERNAL 1
#include "sonic.h"

/* Note we are undef'ing only the following sumbols because we redefine them
 * in this file. */
#undef sonicCreateStream
#undef sonicDestroyStream
#undef sonicWriteFloatToStream
#undef sonicWriteShortToStream
#undef sonicReadFloatFromStream
#undef sonicReadShortFromStream
#undef sonicFlushStream
#undef sonicSetSpeed
#undef sonicSetRate
#undef sonicSetDurationFeedbackStrength
#undef sonicEnableNonlinearSpeedup


#undef   SONIC_UPGRADE

sonicStream sonicCreateStream(int sampleRate, int numChannels);
void sonicDestroyStream(sonicStream mySonicStream);
/******************************************************************************
 * NOTE: One sample corresponds to the values from *all* channels. Thus a stereo
 * signal with N samples has 2*N short values.
 ******************************************************************************/
int sonicWriteShortToStream(sonicStream mySonicStream, const short int* inBuffer,
                             int sampleCount);
int sonicReadShortFromStream(sonicStream mySonicStream, short* outBuffer,
                              int bufferSize);
/* Samples in floating-point format are assumed to be in the range (-1,1) */
int sonicWriteFloatToStream(sonicStream mySonicStream, const float* inBuffer,
                             int sampleCount);
int sonicReadFloatFromStream(sonicStream mySonicStream, float* outBuffer,
                              int bufferSize);

void sonicSetRate(sonicStream mySonicStream, float rate);
void sonicSetSpeed(sonicStream mySonicStream, float rate);
int sonicFlushStream(sonicStream mySonicStream);

/* Enable non-linear speedup. Default is 0, which means purely linear speedup.
 * Set to 1.0 to get the standard Speedy non-linear speedup.  Values between
 * 0 and 1 have not been tested, but can give a partial non-linear speedup.
 *
 * The normalizationTime parameter specifies the amount of averaging used to
 * keep the average speed at the desired rate.  0 turns this off, otherwise,
 * the current speed is averaged with a low-pass filter with this time constant
 * (in seconds) and the average speed is driven to the requested.
 */
void sonicEnableNonlinearSpeedup(sonicStream mySonicStream,
                                 float nonlinearFactor);

/* Set the feedback strength to use when connecting the excess duration
 * (current minus desired duration, given the global speed request) and the
 * amount to goose the requested (to sonic) speedup.
 * Use 0.0 to get the original behavior (no feedback. The value of 0.1 seems to
 * be a good compromise, providing a .1 speedup for every 1s of excess duration.
 */
void sonicSetDurationFeedbackStrength(sonicStream mySonicStream, float factor);

/* Return the size of the internal buffers.  This is needed for the callback
 * functions, which return time in buffer counts.
 */
int getSonicBufferSize(sonicStream mySonicStream);


/* Monitoring status. The time parameter in the callback is the index of
 * internal buffer counts, each buffer has getSonicBufferSize() monaural
 * samples.
 */
typedef void (*tensionFunction)(sonicStream myStream, int time, float tension);
void sonicTensionCallback(sonicStream mySonicStream, tensionFunction);
tensionFunction getSonicTensionCallback(sonicStream mySonicStream);

typedef void (*speedFunction)(sonicStream myStream, int time, float speed);
void sonicSpeedCallback(sonicStream mySonicStream, speedFunction);
tensionFunction getSonicSpeedCallback(sonicStream mySonicStream);

typedef void (*featuresFunction)(sonicStream myStream, int time,
                                 float *features);
void sonicFeaturesCallback(sonicStream mySonicStream, featuresFunction);
featuresFunction getSonicFeaturesCallback(sonicStream mySonicStream);

typedef void (*spectrogramFunction)(sonicStream myStream, int time,
                                    float* spectrogram);
void sonicSpectrogramCallback(sonicStream mySonicStream, spectrogramFunction);
spectrogramFunction getSonicSpectrogramCallback(sonicStream mySonicStream);
void sonicNormalizedSpectrogramCallback(sonicStream mySonicStream,
                                        spectrogramFunction);
spectrogramFunction getSonicNormalizedSpectrogramCallback(
    sonicStream mySonicStream);
int sonicSpectrogramSize(sonicStream mySonicStream);  /* For debugging */

#ifdef __cplusplus
}
#endif

#endif  /* THIRD_PARTY_SPEEDY_SONIC_sonic2LIB_H_ */
