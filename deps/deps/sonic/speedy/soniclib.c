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

#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include "sonic2.h"
#include "speedy.h"

/*
 * Replace original libSonic with this shim to allow non-linear speedups of
 * speech. It uses libSpeedy to calculate appropriate fine-time speed changes,
 * and then calls the original libSonic to do the speed changes.
 *
 * To maintain compatibility with the original libsonic library, this library
 * also uses a sonicStream structure. A new structure, speedyConnection,
 * contains the information for the shim, and this structure is pointed to by
 * the original libSonic userData field.  The sequence of structures is as
 * follows:
 *    sonicStream -> speedyConnection -> speedyStream
 * sonicStream is the original libsonic structure, with a user field added.
 * speedyConnection manages the buffers between libsonic and speed.
 * speedyStream has the information needed to do the Speedy speech calculations.
 *
 * This library maintains a set of buffers as it passes data to speedy, gets the
 * results back, and then sends them to the original libsonic library for time
 * compression.  The buffer pointers we need are:
 *
 * writeBufferFrameLocation -----\/   Index into next location to fill
 * writeBufferFrameIndex  --> ***     A partial buffer we are filling
 *                            ******
 * speedyBufferWriteIndex --> ******  Start of next buffer to send to Speedy
 *                            ******
 * readBufferFrameIndex   --> ******  Data waiting for analysis to finish before
 *                                    sending to libsonic
 * Fill from the top, pulling data from the bottom. These indices all point to a
 * set of circular buffers, so mod by bufferCount to get the actual buffer
 * index.  (i.e. the indices above grow continuously, and are never reset to
 * zero.)
 *
 * To manage all of this, this library keeps buffers of size 1/frameRate. The
 * speedy analysis code wants 50% overlap, so when ready the buffer we pass to
 * speedy has size 1.5/frameRate.
 *
 * TODO(malcolmslaney)
 *   1) Put some functionality in for sonicFreeSpace
 *   2) Remove debug prints
 */
struct speedyConnectionStruct {
  speedyStream mySpeedyStream;
  float globalSpeed;            /* Set by user request */
  float speedyNonlinearFactor;  /* Set by user, usually 0 or 1 (off or on) */
  float speedyDurationFeedbackStrength; /* How quick to feedback excess duration */
  float sampleRate;
  int channelCount;             /* Number of channels >= 1 */
  int bufferCount;
  int bufferSize;               /* Number of multi-channel samples per buffer */
  short** bufferList;
  float* tensionList;
  short* speedyInputBuffer;     /* To accumulate buffers to send to Speedy */
  int readBufferFrameIndex;     /* Frame time, always increasing. */
  int speedyBufferFrameIndex;   /* Frame time, always increasing. */
  int writeBufferFrameIndex;    /* Frame time, always increasing. */
  int writeBufferFrameLocation; /* Value is [0, bufferSize] */
  void (*returnTension)(sonicStream, int, float);
  void (*returnSpeed)(sonicStream, int, float);
  void (*returnFeatures)(sonicStream, int, float*);
  void (*returnSpectrogram)(sonicStream, int, float*);
  void (*returnNormalizedSpectrogram)(sonicStream, int, float*);
};
typedef struct speedyConnectionStruct* speedyConnection;

/* Note: Speedy's tension calculation at frame k depends on kTemporalHysteresis
 * frames in the *future*. For this reason, this shim needs to buffer a number
 * of frames so that speedy can see these frames in the future, and then
 * calculate the tension now.  This bufferList has to have enough room for all
 * of these future frames.
 */
#define kMinBufferSize (2+kTemporalHysteresisFuture)

sonicStream sonicCreateStream(int sampleRate, int numChannels){
  sonicStream mySonicStream = sonicIntCreateStream(sampleRate, numChannels);
  if (!mySonicStream) {
    return NULL;
  }
  sonicIntSetUserData(mySonicStream, NULL);

  speedyConnection mySpeedyConnector = (speedyConnection)
      calloc(1, sizeof(struct speedyConnectionStruct));
  if (!mySpeedyConnector) {
    sonicDestroyStream(mySonicStream);
    return NULL;
  }
  sonicIntSetUserData(mySonicStream, mySpeedyConnector);

  speedyStream mySpeedyStream = speedyCreateStream(sampleRate);
  if (!mySpeedyStream) {
    sonicDestroyStream(mySonicStream);
    return NULL;
  }
  mySpeedyConnector->mySpeedyStream = mySpeedyStream;
  mySpeedyConnector->globalSpeed = 1.0;
  mySpeedyConnector->sampleRate = sampleRate;
  mySpeedyConnector->channelCount = numChannels;
  mySpeedyConnector->speedyNonlinearFactor = 0.0;    /* Off by default */
  /* How fast to normalize the speed (after non-linear speedup) to keep the
   * average speed at the desired.  The default 0.1 means the speed is upped
   * by 0.1 times the excess duration in seconds.
   */
  mySpeedyConnector->speedyDurationFeedbackStrength = 0.1;
  mySpeedyConnector->returnTension = 0;
  mySpeedyConnector->returnSpeed = 0;
  mySpeedyConnector->returnFeatures = 0;
  mySpeedyConnector->returnSpectrogram = 0;
  mySpeedyConnector->returnNormalizedSpectrogram = 0;
  mySpeedyConnector->readBufferFrameIndex = 0;
  mySpeedyConnector->speedyBufferFrameIndex = 0;
  mySpeedyConnector->writeBufferFrameIndex = 0;
  mySpeedyConnector->writeBufferFrameLocation = 0;

  return mySonicStream;
}

/*
 * Delete these structures:
 *    sonicStream -> speedyConnection -> speedyStream
 * and the buffers that are part of the speedyConnection shim.
 */
void sonicDestroyStream(sonicStream mySonicStream) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  sonicIntDestroyStream(mySonicStream);
  if (mySpeedyConnector) {
    if (mySpeedyConnector->mySpeedyStream) {
      speedyDestroyStream(mySpeedyConnector->mySpeedyStream);
    }
    if (mySpeedyConnector->bufferCount > 0 && mySpeedyConnector->bufferList) {
      int i;
      for (i=0; i<mySpeedyConnector->bufferCount; i++) {
        if (mySpeedyConnector->bufferList[i]) {
          free(mySpeedyConnector->bufferList[i]);
        }
      }
      free(mySpeedyConnector->bufferList);
    }
    if (mySpeedyConnector->speedyInputBuffer) {
      free(mySpeedyConnector->speedyInputBuffer);
    }
    if (mySpeedyConnector->tensionList) {
      free(mySpeedyConnector->tensionList);
    }
    free(mySpeedyConnector);
  }
}

void sonicSetRate(sonicStream mySonicStream, float rate) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  mySpeedyConnector->sampleRate = rate;
  sonicIntSetRate(mySonicStream, rate);
}

void sonicSetSpeed(sonicStream mySonicStream, float rate) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  mySpeedyConnector->globalSpeed = rate;
  sonicIntSetSpeed(mySonicStream, rate);
}


int sonicAllocateBuffers(sonicStream mySonicStream, int sampleCount){
  /* TODO(malcolmslaney): Need to check if we have already allocated this space,
   * and if we need to increase the buffer size.
   */
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  speedyStream mySpeedyStream = mySpeedyConnector->mySpeedyStream;

  mySpeedyConnector->bufferSize = speedyInputFrameStep(mySpeedyStream);
  int bufferCount = sampleCount / mySpeedyConnector->bufferSize + 1;
  if (bufferCount < kMinBufferSize) {
      bufferCount = kMinBufferSize;
  }
  mySpeedyConnector->bufferCount = bufferCount;
  printf("Allocating %d buffers for sonic data.\n", bufferCount);
  short **bufferList =  (short**) calloc(mySpeedyConnector->bufferCount,
                                         sizeof(short*));
  mySpeedyConnector->bufferList = bufferList;
  if (!bufferList) {
    return 0;
  }
  int i;
  for (i=0; i<bufferCount; i++) {
    bufferList[i] = (short *)calloc(mySpeedyConnector->bufferSize,
                                    sizeof(short)*
                                    mySpeedyConnector->channelCount);
    if (!bufferList[i]) {
      return 0;
    }
  }

  int speedyBufferSize = speedyInputFrameSize(mySpeedyStream);
  printf("speedyBufferSize is %d, sonicBufferSize is %d.\n", speedyBufferSize,
         mySpeedyConnector->bufferSize); fflush(stdout);
  mySpeedyConnector->speedyInputBuffer = (short *)calloc(speedyBufferSize,
                                                         sizeof(short));
  if (!mySpeedyConnector->speedyInputBuffer) {
    return 0;
  }

  mySpeedyConnector->tensionList =
      (float*)calloc(mySpeedyConnector->bufferCount, sizeof(float));
  if (!mySpeedyConnector->tensionList) {
      return 0;
  }
  return 1;
}

/* Check to see if we have enough space to write the new data. */
int sonicFreeSpace(speedyConnection mySpeedyConnection, int sampleCount) {
  return 1;
}

/* sonicSendDataToSpeedy - We now have enough new data to send to Speedy. Send
 * one buffer. Then check to see if we have sent enough data to speedy to get
 * back a new tension estimate.  If so, use the tension to calculate a new
 * speedup, tell the original libsonic the new speed, and send it the
 * corresponding buffer.
 */
void sonicSendDataToSpeedy(sonicStream mySonicStream) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  speedyStream mySpeedyStream = (speedyStream)mySpeedyConnector->mySpeedyStream;
  int speedyBufferSize = speedyInputFrameSize(mySpeedyStream);
  int sonicBufferSize = mySpeedyConnector->bufferSize;
  int speedyFullBufferCount = speedyBufferSize/mySpeedyConnector->bufferSize;
  int partialCount = speedyBufferSize - sonicBufferSize*speedyFullBufferCount;
  assert(mySpeedyConnector->speedyBufferFrameIndex <
         mySpeedyConnector->writeBufferFrameIndex);
  assert(mySpeedyConnector->writeBufferFrameLocation > partialCount);

  /* Copy the full buffers, averaging the channels to get a mono signal for
   * speedy analysis.
   */
  int i, j, k, bufferIndex, sum;
  short* bp = mySpeedyConnector->speedyInputBuffer;
  short* wp;
  for (i=0; i<speedyFullBufferCount; i++) {
    bufferIndex = (mySpeedyConnector->speedyBufferFrameIndex + i) %
                      mySpeedyConnector->bufferCount;
    short* wp = mySpeedyConnector->bufferList[bufferIndex];
    for (j = 0; j<sonicBufferSize; j++) {
      int channelCount = mySpeedyConnector->channelCount;
      for (k = 0, sum=0; k<channelCount; k++) {
        sum += wp[j*channelCount + k];
      }
      *bp++ = sum /channelCount;
    }
  }
  /* Then copy the last partial buffer before sending for speedy analysis. */
  bufferIndex = (mySpeedyConnector->speedyBufferFrameIndex +
                 speedyFullBufferCount) % mySpeedyConnector->bufferCount;
  wp = mySpeedyConnector->bufferList[bufferIndex];
  for (i = 0; i<partialCount; i++) {
    int channelCount = mySpeedyConnector->channelCount;
    for (j = 0, sum=0; j<channelCount; j++) {
      sum += wp[i*channelCount + j];
    }
    *bp++ = sum /channelCount;
  }
  mySpeedyConnector->speedyBufferFrameIndex++;  /* Move to next frame. */

  /* Send the full speedyInputBuffer to Speedy for analysis */
#ifdef  DEBUG
  printf("Sending data from buffer at time %d to speedy\n",
         mySpeedyConnector->speedyBufferFrameIndex); fflush(stdout);
#endif
  speedyAddDataShort(mySpeedyStream, mySpeedyConnector->speedyInputBuffer,
                     mySpeedyConnector->writeBufferFrameIndex);
  if (mySpeedyConnector->returnSpectrogram) {
    /* Note: this spectrogram is calculated when the data is sent to speedy */
    (mySpeedyConnector->returnSpectrogram)(
        mySonicStream, mySpeedyConnector->writeBufferFrameIndex,
        speedyGetSpectrogram(mySpeedyStream));
  }
  if (mySpeedyConnector->returnNormalizedSpectrogram) {
    /* Note: the normalized spectrogram is calculated when we have enough data
     * to compute the tension, so it is offset from the spectrogram above.
     */
    (mySpeedyConnector->returnNormalizedSpectrogram)(
        mySonicStream, mySpeedyConnector->writeBufferFrameIndex,
        speedyGetNormalizedSpectrogram(mySpeedyStream));
  }

  /* Compute the tension. First see if anybody wants to know the result.
   * But more importantly, compute the new speedup and pass it to the sonic
   * library so the new samples we are sending here get spedup by this new
   * speed. */
  float newTension = 0.0;
  if (speedyComputeTension(mySpeedyStream,
                           mySpeedyConnector->readBufferFrameIndex,
                           &newTension)) {
    if (mySpeedyConnector->returnTension) {
      (mySpeedyConnector->returnTension)(mySonicStream,
                                         mySpeedyConnector->readBufferFrameIndex,
                                         newTension);
    }
    if (mySpeedyConnector->returnFeatures) {
      (mySpeedyConnector->returnFeatures)(mySonicStream,
                                          mySpeedyConnector->readBufferFrameIndex,
                                          speedyGetInternalState(mySpeedyStream));
    }
    /* Now that we have a new tension, send the data we have stored to the
     * original libSonic for sola processing (along with the new speed.)
     */
#ifdef  DEBUG
    printf("  Got back a tension result (%g) at time %d.\n",
           newTension,
           mySpeedyConnector->readBufferFrameIndex); fflush(stdout);
#endif

    float newRate = speedyComputeSpeedFromTension(
        newTension, mySpeedyConnector->globalSpeed,
        mySpeedyConnector->speedyDurationFeedbackStrength, mySpeedyStream);
    // Interpolate between speedy-derived speed, and the global/linear request.
    float globalSpeed = mySpeedyConnector->globalSpeed;
    newRate = newRate    *   mySpeedyConnector->speedyNonlinearFactor +
              globalSpeed*(1-mySpeedyConnector->speedyNonlinearFactor);
#ifdef  DEBUG
    printf("  Requesting a speed of %g from libsonicInt.\n", newRate);
#endif
    if (mySpeedyConnector->returnSpeed) {
      (mySpeedyConnector->returnSpeed)(mySonicStream,
                                       mySpeedyConnector->readBufferFrameIndex,
                                       newRate);
    }
    sonicIntSetSpeed(mySonicStream, newRate);
    int readIndex = mySpeedyConnector->readBufferFrameIndex %
                    mySpeedyConnector->bufferCount;
    short *readBuffer = mySpeedyConnector->bufferList[readIndex];
#ifdef  DEBUG
    printf("  Sending %d samples at time %d to libsonicInt for processing...\n",
           mySpeedyConnector->bufferSize,
           mySpeedyConnector->readBufferFrameIndex);
    fflush(stdout);
    printf("Frame %d sb:", mySpeedyConnector->readBufferFrameIndex);
    for (i=0; i<mySpeedyConnector->bufferSize; i++) {
      printf(" %d", readBuffer[i]);
    }
    printf("\n");
#endif
    sonicIntWriteShortToStream(mySonicStream, readBuffer,
                               mySpeedyConnector->bufferSize);
    mySpeedyConnector->readBufferFrameIndex++;
  }
}

/*
 * This the main input for sound to Speedy. This kicks off the processing needed
 * so Speedy can calculate the necessary speedup (when you use sonicRead...
 *
 * Accept sound data for speedup processing.  Fill in the next buffer, and when
 * the buffer is full send it to Speedy. There are several frames of latency
 * induced by speedy, so check to see if the results from a previous frame are
 * ready. If ready, calculate the speed from the tension, and send the original
 * sound data to SOLA (libsonic) for processing.
 *
 * Note the speedy buffers are 150% of the size of the sonic buffers.  Sonic
 * gets sonicBufferSize bytes at a time, and that is what is stored in this
 * buffer list, and eventually passed to the original sonic.  But speedy needs
 * more data to do its analysis (50% overlap) so we have to make sure we have
 * enough data to pass a full buffer to Speedy.
*/
int sonicWriteShortToStream(sonicStream mySonicStream, const short* inBuffer,
                            int sampleCount){
  assert(mySonicStream);

  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  if (!mySpeedyConnector->speedyNonlinearFactor) {    /* Short circuit speedy */
    return sonicIntWriteShortToStream(mySonicStream, inBuffer, sampleCount);
  }
  if (!mySpeedyConnector->bufferList) {
    sonicAllocateBuffers(mySonicStream, sampleCount);
  }
  speedyStream mySpeedyStream = (speedyStream)mySpeedyConnector->mySpeedyStream;
  int speedyBufferSize = speedyInputFrameSize(mySpeedyStream);
  int sonicBufferSize = mySpeedyConnector->bufferSize;
  int speedyFullBufferCount = speedyBufferSize/sonicBufferSize;
  /* This is how much of the next partial buffer we have to fill before sending
   * the frame (and this overlap) to speedy.
   */
  int partialCountNeeded = speedyBufferSize -
      speedyFullBufferCount*sonicBufferSize;
  assert(partialCountNeeded < sonicBufferSize);

  #ifdef  DEBUG
  printf("Writing %d samples to libsonic2 into frame index %d\n", sampleCount,
         mySpeedyConnector->writeBufferFrameIndex); fflush(stdout);
  printf("  speedyBufferSize: %d, sonicBufferSize: %d, partialCount: %d, "
         "writeBufferFrameIndex: %d\n",
         speedyBufferSize, sonicBufferSize, partialCountNeeded,
         mySpeedyConnector->writeBufferFrameIndex);
  printf("  speedyBufferFrameIndex: %d, speedyFullBufferCount: %d, "
         "writeBufferFrameLocation: %d\n",
         mySpeedyConnector->speedyBufferFrameIndex,
         speedyFullBufferCount, mySpeedyConnector->writeBufferFrameLocation);
  #endif

  while (inBuffer && sampleCount > 0) {
    int writeIndex = mySpeedyConnector->writeBufferFrameIndex %
                     mySpeedyConnector->bufferCount;
    short* writeBuffer = mySpeedyConnector->bufferList[writeIndex];
    int j, channelCount = mySpeedyConnector->channelCount;
    /* Copy all the channels into sonic buffer for the sample at this time. */
    for (j=0; j<channelCount; j++) {
      int loc = mySpeedyConnector->writeBufferFrameLocation * channelCount;
      writeBuffer[loc+j] = *inBuffer++;
    }
    mySpeedyConnector->writeBufferFrameLocation++;
    sampleCount--;
    /* Check to see if we have enough of a partial buffer to send to Speedy. */
    if (mySpeedyConnector->writeBufferFrameIndex >=
        mySpeedyConnector->speedyBufferFrameIndex+speedyFullBufferCount &&
        mySpeedyConnector->writeBufferFrameLocation == partialCountNeeded+1) {
      sonicSendDataToSpeedy(mySonicStream);
    }
    /* Check for full buffer and then wrap. */
    if (mySpeedyConnector->writeBufferFrameLocation >= sonicBufferSize) {
      mySpeedyConnector->writeBufferFrameLocation = 0;
      mySpeedyConnector->writeBufferFrameIndex++;
    }
  }
  return 1;
}

/* Like above, but convert floats to shorts before saving them into the buffer
 * and processing them.
 */
int sonicWriteFloatToStream(sonicStream mySonicStream, const float* inBuffer,
                            int sampleCount){
  assert(mySonicStream);

  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  if (!mySpeedyConnector->speedyNonlinearFactor) {    /* Short circuit speedy */
    return sonicIntWriteFloatToStream(mySonicStream, inBuffer, sampleCount);
  }
  if (!mySpeedyConnector->bufferList) {
    sonicAllocateBuffers(mySonicStream, sampleCount);
  }
  speedyStream mySpeedyStream = (speedyStream)mySpeedyConnector->mySpeedyStream;
  int speedyBufferSize = speedyInputFrameSize(mySpeedyStream);
  int sonicBufferSize = mySpeedyConnector->bufferSize;
  int speedyFullBufferCount = speedyBufferSize/sonicBufferSize;
  int partialCountNeeded = speedyBufferSize -
      speedyFullBufferCount*sonicBufferSize;

  #ifdef  DEBUG
  printf("Writing %d floats to sonic at %d\n", sampleCount,
         mySpeedyConnector->writeBufferFrameIndex); fflush(stdout);
  printf("  speedyBufferSize: %d, sonicBufferSize: %d, partialCount: %d, "
         "writeBufferFrameIndex: %d\n",
         speedyBufferSize, sonicBufferSize, partialCountNeeded,
         mySpeedyConnector->writeBufferFrameIndex);
  printf("  speedyBufferFrameIndex: %d, speedyFullBufferCount: %d, "
         "writeBufferFrameLocation: %d\n",
         mySpeedyConnector->speedyBufferFrameIndex,
         speedyFullBufferCount, mySpeedyConnector->writeBufferFrameLocation);
  #endif

  while (inBuffer && sampleCount > 0) {
    int writeIndex = mySpeedyConnector->writeBufferFrameIndex %
                     mySpeedyConnector->bufferCount;
    short* writeBuffer = mySpeedyConnector->bufferList[writeIndex];
    int j, channelCount = mySpeedyConnector->channelCount;
    for (j=0; j<channelCount; j++) {
      int loc = mySpeedyConnector->writeBufferFrameLocation * channelCount;
      writeBuffer[loc + j] = (short)(*inBuffer++ * 32768.0);
    }
    mySpeedyConnector->writeBufferFrameLocation++;
    sampleCount--;
    /* Check to see if we have enough of a partial buffer to send to Speedy. */
    assert(partialCountNeeded < sonicBufferSize);
    if (mySpeedyConnector->writeBufferFrameIndex >=
        mySpeedyConnector->speedyBufferFrameIndex+speedyFullBufferCount &&
        mySpeedyConnector->writeBufferFrameLocation == partialCountNeeded+1) {
      sonicSendDataToSpeedy(mySonicStream);
    }
    /* Check for full buffer and then wrap. */
    if (mySpeedyConnector->writeBufferFrameLocation >= sonicBufferSize) {
      mySpeedyConnector->writeBufferFrameLocation = 0;
      mySpeedyConnector->writeBufferFrameIndex++;
    }
#ifdef DEBUG
    printf("Finished %d samples\n", sampleCount);
#endif
  }
  return 1;
}

int sonicReadShortFromStream(sonicStream mySonicStream, short* outBuffer,
                             int bufferSize){
  return sonicIntReadShortFromStream(mySonicStream, outBuffer, bufferSize);
}

int sonicReadFloatFromStream(sonicStream mySonicStream, float* outBuffer,
                             int bufferSize){
  return sonicIntReadFloatFromStream(mySonicStream, outBuffer, bufferSize);
}

int sonicFlushStream(sonicStream mySonicStream){
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
#ifdef  DEBUG
  printf("About to start flushing the sonicFlushStream (%d vs %d).\n",
        mySpeedyConnector->readBufferFrameIndex,
        mySpeedyConnector->writeBufferFrameIndex);
#endif
  while (mySpeedyConnector->readBufferFrameIndex <
         mySpeedyConnector->writeBufferFrameIndex) {
    int readIndex = mySpeedyConnector->readBufferFrameIndex %
                    mySpeedyConnector->bufferCount;
    short *curBuffer = mySpeedyConnector->bufferList[readIndex];
#ifdef  DEBUG
    printf("Flushing buffer at time %d to libsonicInt\n",
           mySpeedyConnector->readBufferFrameIndex); fflush(stdout);
#endif
    sonicIntWriteShortToStream(mySonicStream, curBuffer,
                               mySpeedyConnector->bufferSize);
    mySpeedyConnector->readBufferFrameIndex++;
  }
  return sonicIntFlushStream(mySonicStream);
}

/* Enable non-linear speedup. */
void sonicEnableNonlinearSpeedup(sonicStream mySonicStream, float factor) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);

  /* TODO(malcolmslaney): Perhaps flush buffers if turning off speedy? */
  mySpeedyConnector->speedyNonlinearFactor = factor;
}

/* Set the strength of the feedback term connecting excess duration to speed. */
void sonicSetDurationFeedbackStrength(sonicStream mySonicStream, float factor) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);

  mySpeedyConnector->speedyDurationFeedbackStrength = factor;
}

void sonicTensionCallback(sonicStream mySonicStream,
                          tensionFunction newCallbackFunction) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  mySpeedyConnector->returnTension = newCallbackFunction;
}

tensionFunction getSonicTensionCallback(sonicStream mySonicStream) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  return mySpeedyConnector->returnTension;
}

void sonicSpeedCallback(sonicStream mySonicStream,
                        speedFunction newCallbackFunction) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  mySpeedyConnector->returnSpeed = newCallbackFunction;
}

speedFunction getSonicSpeedCallback(sonicStream mySonicStream) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  return mySpeedyConnector->returnSpeed;
}

void sonicFeaturesCallback(sonicStream mySonicStream,
                           featuresFunction newCallbackFunction) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  mySpeedyConnector->returnFeatures = newCallbackFunction;
}

/* The following functions are useful for testing and debugging, and are
 * probably not useful to the user of this library.
 */
featuresFunction getSonicFeaturesCallback(sonicStream mySonicStream) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  return mySpeedyConnector->returnFeatures;
}

/* Get the spectrogram computed by the speedy algorithm.  Note this is computed
 * (and the callback routine is called) when there is enough data to send to
 * speedy for analysis.)
 */
void sonicSpectrogramCallback(sonicStream mySonicStream,
                             spectrogramFunction newCallbackFunction) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  mySpeedyConnector->returnSpectrogram = newCallbackFunction;
}

spectrogramFunction getSonicSpectrogramCallback(sonicStream mySonicStream) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  return mySpeedyConnector->returnSpectrogram;
}

/* Get the normalized spectrogram computed by the speedy algorithm.  Note this
 * is computed (and the callback routine is called) when speedy calculates the
 * tension.  This is done after a number of frames have been sent to speedy so
 * it can do the lookahead.
 */
void sonicNormalizedSpectrogramCallback(
    sonicStream mySonicStream, spectrogramFunction newCallbackFunction) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  mySpeedyConnector->returnNormalizedSpectrogram = newCallbackFunction;
}

spectrogramFunction getSonicNormalizedSpectrogramCallback(
    sonicStream mySonicStream) {
  assert(mySonicStream);
  speedyConnection mySpeedyConnector =
      (speedyConnection)sonicIntGetUserData(mySonicStream);
  return mySpeedyConnector->returnNormalizedSpectrogram;
}

int sonicSpectrogramSize(sonicStream mySonicStream) {
  if (mySonicStream) {
    speedyConnection mySpeedyConnector =
        (speedyConnection)sonicIntGetUserData(mySonicStream);
    return speedyFFTSize(mySpeedyConnector->mySpeedyStream);
  } else {
    return 0;
  }
}


int getSonicBufferSize(sonicStream mySonicStream) {
  if (mySonicStream) {
    speedyConnection mySpeedyConnector =
        (speedyConnection)sonicIntGetUserData(mySonicStream);
    return mySpeedyConnector->bufferSize;
  } else {
    return 0;
  }
}
