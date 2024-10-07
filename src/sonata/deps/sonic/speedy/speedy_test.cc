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

#include <math.h>
#include <algorithm>
#include <cassert>
#include <fstream>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <cmath>
#include <cstdint>
#include <numeric>
#include <sstream>
#include <string>
#include <vector>

#include "gtest/gtest.h"  // Needed for external testing
#include "sonic.h"

extern "C" {
#include "wave.h"
#include "speedy.h"
#include "sonic2.h"
}


namespace {

/* A simple class to enable dumping large floating point signals into a file
 * that can be read with Matlab.  Create the instance, and then use WriteXX
 * methods to dump data into a Matlab script file.
 * Need to run this outside of blaze (blaze_bin/...) in order to be able to
 * retrieve the files that this routine creates.
 */
class DebugFile {
 protected:
  FILE *fp_;

 public:
  DebugFile(const char *filename) {
    fp_ = fopen(filename, "w");
  }

  ~DebugFile() {
    if (fp_) fclose(fp_);
    fp_ = 0;
  }

  // Write a value into a 1d array
  template <typename T>
  void Write1DValue(const char *variable_name, T data, int index) {
    if (fp_) {
      fprintf(fp_, "\n%s(%d) = %g;\n", variable_name, index+1, data);
    }
  }

  // Write a one dimensional array into a variable.
  template <typename T>
  void Write1D(const char* variable_name, T *data, int N) {
    if (fp_) {
      fprintf(fp_, "\n%s = [\n", variable_name);
      for (int i = 0; i < N; i++) {
        fprintf(fp_, "  %g;\n", data[i]);
      }
      fprintf(fp_, "];\n");
    }
  }

  // Write one column of a 2d array.
  template <typename T>
  void Write1DColumn(const char* variable_name, T *data, int N, int col_num) {
    ASSERT_GE(col_num, 0);
    if (fp_) {
      std::string input_name = std::string(variable_name) + "(:," +
                               std::to_string(col_num + 1) + ")";
      fprintf(fp_, "\n%s = [\n", input_name.c_str());
      for (int i = 0; i < N; i++) {
        fprintf(fp_, "  %g;\n", data[i]);
      }
      fprintf(fp_, "];\n");
    }
  }

  // Write one row of a 2d array.
  template <typename T>
  void Write1DRow(const char* variable_name, T *data, int N, int row_num) {
    ASSERT_GE(row_num, 0);
    if (fp_) {
      std::string input_name = std::string(variable_name) + "(" +
                               std::to_string(row_num + 1) + ",:)";
      fprintf(fp_, "\n%s = [\n", input_name.c_str());
      for (int i = 0; i < N; i++) {
        fprintf(fp_, "  %g;\n", data[i]);
      }
      fprintf(fp_, "];\n");
    }
  }

  // Write a scalar variable into the debug file.
  template <typename T>
  void WriteScalar(const char* variable_name, T data) {
    if (fp_) {
      fprintf(fp_, "\n%s = %g;\n", variable_name, static_cast<float>(data));
    }
  }
};

class FirstOrderFilterTest : public testing::Test {
 protected:
  void SetUp() override {
    // Code here will be called before *each* test.
  }

  void TearDown() override {
    // Code here will be called after *each* test.
  }
};


// Given a time constant, design a first order filter and make sure that the
// impulse response declines to exp(-1) in time_constant steps.
TEST_F(FirstOrderFilterTest, TestFirstOrderFilter) {
  constexpr int time_constant_in_samples = 10;
  FirstOrderFilter fof = CreateFirstOrderFilter(time_constant_in_samples);
  EXPECT_TRUE(fof);

  // Run the filter and verify the impulse response after time_constant steps
  float output = IterateFirstOrderFilter(fof, 1.0);
  float first_output = output;
  for (int i = 0; i < time_constant_in_samples; i++) {
    output = IterateFirstOrderFilter(fof, 0.0);
  }
  // In time_constant_in_samples steps, did the output decline to e^-1, which
  // is the definition of a time constant?
  EXPECT_NEAR(first_output*exp(-1), output, 1e-7);

  // Check that we can reset the state
  ResetFirstOrderFilter(fof);
  output = IterateFirstOrderFilter(fof, 0.0);
  ASSERT_NEAR(0.0, output, 1e-7);

  DeleteFirstOrderFilter(fof);
}

class SpeedyTest : public ::testing::Test {
 protected:
  SpeedyTest() : stream_(nullptr) {
  }

  ~SpeedyTest() {
    if (stream_ != nullptr) {
      speedyDestroyStream(stream_);
    }
  }

  void Initialize(int sampleRate) {
    stream_ = speedyCreateStream(sampleRate);
  }

  speedyStream stream_;
};

std::vector<int16_t> ReadWaveFile(const std::string& fileName, int* sampleRate,
                                  int* numChannels) {
  const int32_t kBufferSize = 1024;
  int16_t buffer[kBufferSize];
  std::vector<int16_t> outputVector;
  auto fp = openInputWaveFile(fileName.c_str(), sampleRate, numChannels);
  EXPECT_TRUE(fp != NULL);
  int numRead;
  do {
    numRead = readFromWaveFile(fp, buffer, kBufferSize);
    outputVector.insert(outputVector.end(), buffer, buffer+numRead);
  } while (numRead > 0);
  closeWaveFile(fp);
  return outputVector;
}

constexpr int kSampleRate = 22050;

/* For a sinusoid input, does the spectrogram calculation put the peak in the
 * right location (given its frequency)?
 */
TEST_F(SpeedyTest, TestSpectrogramCalculation) {
  Initialize(kSampleRate);
  const int N = speedyFFTSize(stream_)/2;    /* Hamming window size */
  const int freq = 10;                       /* Cycles per FFT length */
  std::vector<float> input(2*N);

  for (int i = 0; i < N; i++) {
    input[i] = sin(10*i/(float)N*M_PI);
  }
  speedySpectrogram(stream_, &input[0]);
  float* spectrogram = speedyGetSpectrogram(stream_);
  EXPECT_NEAR(spectrogram[freq], 88.8677, .001);
  for (int i = 0; i < N; i++) {
    if (i != freq) {
      EXPECT_GT(spectrogram[freq], spectrogram[i]);
    }
    if (abs(i-freq) > 3) {
      EXPECT_LE(20 * std::log10(spectrogram[i]),
                20 * std::log10(spectrogram[1]));
    }
  }
}

// Test the spectrogram code.  Put in a single sinusoid, and make sure that the
// peak in the spectrogram is in the correct frequency bin.
TEST_F(SpeedyTest, TestSpectrogram) {
  constexpr float kTestSinusoidFrequency = 220*10;  // Hz

  // Test with a simple sinusoid.
  Initialize(kSampleRate);
  int window_size = speedyInputFrameSize(stream_);
  ASSERT_EQ(window_size, 330);
  int fft_size = speedyFFTSize(stream_);
  ASSERT_EQ(fft_size, 660);

  float *input = new float[window_size];
  for (int i = 0; i < window_size; i++) {
    input[i] = sin(2 * M_PI * i / static_cast<float>(kSampleRate) *
                   kTestSinusoidFrequency);
  }
  float* spectrogram = speedySpectrogram(stream_, input);
  // Find the position of the peak to make sure the bins are where we expect
  // them.
  int pos = 0;
  float max = spectrogram[pos];
  for (int i = 1; i < speedyFFTSize(stream_) / 2; i++) {  // Only pos. freqs.
    if (spectrogram[i] > max) {
      max = spectrogram[i];
      pos = i;
    }
  }
  EXPECT_EQ(pos, speedyFreqToBin(stream_, kTestSinusoidFrequency));
  EXPECT_NEAR(max, 88.4847412109375, 1e-3);    // Calculated by Matlab
  // Make sure the peak width is correct too.
  EXPECT_NEAR(spectrogram[pos-1], 76.9396, 1e-1);
  EXPECT_NEAR(spectrogram[pos+1], 68.0196, 1e-1);
  delete[] input;
}


// Check the preemphasis filter in the simplest case, a big buffer of data.
// Make sure it has the right impulse response.
TEST_F(SpeedyTest, TestSpeedupPreemphasis) {
  Initialize(kSampleRate);
  float x[] = {1.0, 0.0, 0.0, 0.0};
  speedyPreemphasisFilter(stream_, x, sizeof(x)/sizeof(x[0]));
  EXPECT_NEAR(x[0], 1.0, 1e-7);
  EXPECT_NEAR(x[1], -0.97, 1e-7);
  EXPECT_NEAR(x[2], 0.0, 1e-7);
  EXPECT_NEAR(x[3], 0.0, 1e-7);
}

// Test the preemphasis filter by checking that it maintains state across calls.
TEST_F(SpeedyTest, TestSpeedupPreemphasis2) {
  Initialize(kSampleRate);
  float x = 1.0;
  speedyPreemphasisFilter(stream_, &x, 1);
  EXPECT_NEAR(x, 1.0, 1e-7);
  x = 0.0;
  speedyPreemphasisFilter(stream_, &x, 1);
  EXPECT_NEAR(x, -0.97, 1e-7);
  x = 0.0;
  speedyPreemphasisFilter(stream_, &x, 1);
  EXPECT_NEAR(x, 0.0, 1e-7);
  x = 0.0;
  speedyPreemphasisFilter(stream_, &x, 1);
  EXPECT_NEAR(x, 0.0, 1e-7);
}

// Test the hysteresis filter, by putting in some data and watching it go
// through.
TEST_F(SpeedyTest, TestSpeedupHysteresis) {
  Initialize(kSampleRate);
#ifdef MATCH_MATLAB
  float correct[] = {
      0,       0,        0,        0,       0,       0,       0,       0,
      0,       1 / 16.,  2 / 16.,  3 / 16., 4 / 16., 5 / 16., 6 / 16., 7 / 16.,
      1,       11 / 24., 10 / 24., 9 / 24., 8 / 24., 7 / 24., 6 / 24., 5 / 24.,
      4 / 24., 3 / 24.,  2 / 24.,  1 / 24., 0,       0,       0,       0};
#else
  float correct[] = {0, 0, 0, 0, 0, 1/24., 2/24., 3/24., 4/24., 5/24., 6/24.,
                     7/24., 8/24., 9/24., 10/24., 11/24., 1.,
                     7/16., 6/16., 5/16., 4/16., 3/16., 2/16., 1/16.,
                     0, 0, 0, 0, 0, 0, 0, 0};
#endif
  for (int i = 0; i < sizeof(correct) / sizeof(correct[0]); i++) {
    speedyAddToHysteresisBuffer(stream_, i == 16, i);
  }

  printf("SpeedupHysteresis: ");
  for (int i = 0; i < sizeof(correct) / sizeof(correct[0]); i++) {
    float result = speedyEvaluateHysteresis(stream_, i);
    printf("%g ", result);
    EXPECT_NEAR(result, correct[i], 1e-8);
  }
  printf("\n");
}

// Test the spectrogram normalization. Put in some fake data, and make sure that
// the result is properly normalized.
TEST_F(SpeedyTest, TestNormalizeByEnergy) {
  constexpr int N = 5;
  constexpr float input[N] = {0, 0, 1, 0, 1};
  float output[N];
  float energy = speedyNormalizeByEnergy(input, output, N);
  EXPECT_NEAR(energy, 2.0, 1e-7);
  EXPECT_NEAR(output[0], 0, 1e-7);
  EXPECT_NEAR(output[1], 0, 1e-7);
  EXPECT_NEAR(output[2], sqrt(1 / 2.0), 1e-7);
  EXPECT_NEAR(output[3], 0, 1e-7);
  EXPECT_NEAR(output[4], sqrt(1 / 2.0), 1e-7);
}


TEST_F(SpeedyTest, TestAddData) {
  Initialize(kSampleRate);
  ASSERT_TRUE(stream_);
  const int N = speedyInputFrameSize(stream_);
  ASSERT_GT(N, 0);
  float* input = new float[N];
  int i;

  // Create the test signal, a single sinusoid filling the input buffer.
  for (i = 0; i < N; i++) {
    input[i] = sin(2 * M_PI * i / static_cast<float>(N));
  }
  speedyAddData(stream_, input, 0);
  EXPECT_EQ(speedyGetCurrentTime(stream_), 0);

  // And add a second sinusoid at twice the frequency.
  for (i = 0; i < N; i++) {
    input[i] = sin(2 * 2 * M_PI * i / static_cast<float>(N));
  }
  speedyAddData(stream_, input, 1);
  EXPECT_EQ(speedyGetCurrentTime(stream_), 1);
  delete[] input;

  // First check to see if first frame has peak in bin 2.
  // The peak is in bin 2 since the original input has 1 cycle per input length,
  // but the FFT doubles the size, so now it's 2 cycles per fft size.
  float* spectrogram = speedyGetSpectrogramAtTime(stream_, 0);
  EXPECT_GT(spectrogram[2], spectrogram[1]);
  EXPECT_GT(spectrogram[2], spectrogram[3]);
  for (i = 0; i < speedyFFTSize(stream_) / 2; i++) {
    if (i != 2) EXPECT_GT(spectrogram[2], spectrogram[i]);
  }

  // Next check to see if second frame has peak in bin 4.
  // Peak is in bin 4 since the second input has 2 cycle per input length,
  // but the FFT doubles the size, so now it's 4 cycles per fft size.
  spectrogram = speedyGetSpectrogramAtTime(stream_, 1);
  EXPECT_GT(spectrogram[4], spectrogram[3]);
  EXPECT_GT(spectrogram[4], spectrogram[5]);
  for (i = 0; i < speedyFFTSize(stream_) / 2; i++) {
    if (i != 4) EXPECT_GT(spectrogram[4], spectrogram[i]);
  }
}

/*
 * SpeedyComputeLocalEnergy - Calculates the local energy profile over time.
 * Feed in a constant spectrogram, which pins the energy computation to the
 * maximum value... then it slowly decays (adapts) to the constant output.
 */
TEST_F(SpeedyTest, TestSpeedyComputeLocalEnergy) {
  Initialize(kSampleRate);
  ASSERT_TRUE(stream_);
  const int N_Trials = 100;
  float energy_profile;
  int t, num_at_max = 0;
  const int N = speedyInputFrameSize(stream_);
  ASSERT_GT(N, 0);
  float* input = new float[N];

  DebugFile debug = DebugFile("/tmp/sounds/test_local_energy.m");
  float amplitude;
  for (t = 0, amplitude = 1.0; t < N_Trials; t++, amplitude *= 0.9) {
    int i;
    for (i = 0; i < N; i++) {
      input[i] = sin(2 * M_PI * i / static_cast<float>(N)) * amplitude;
    }
    speedyAddData(stream_, input, t);
    EXPECT_EQ(speedyGetCurrentTime(stream_), t);
    float* spectrogram = speedyGetSpectrogramAtTime(stream_, t);
    EXPECT_TRUE(spectrogram);
    speedyComputeLocalEnergy(stream_, spectrogram, t);
    energy_profile = speedyGetEnergyCompressed(stream_);
    if (energy_profile > 1.414) num_at_max++;  // Count pins to max.
    float* features = speedyGetInternalState(stream_);
    debug.Write1DColumn("le_features", features, kFeatureValueCount, t);
  }
  delete[] input;
  // Output is at pinned at max for 6 frames, then decays exponentially.
  EXPECT_EQ(num_at_max, 6);
  // Then output decays to this value over the rest of the 100 trials.
  EXPECT_NEAR(speedyGetEnergyCompressed(stream_), 1.7745e-04, 1e-8);
}

// Test the spectral difference calculation by sending it a bunch of blocks with
// increasing frequency (frequency is constant in each block.)  Test to see if
// the output after N_Trials frames is what we expect.  (This tests for changes
// in the output.)
TEST_F(SpeedyTest, TestSpectralDifference) {
  Initialize(kSampleRate);
  EXPECT_TRUE(stream_);
  const int N = speedyInputFrameSize(stream_);
  ASSERT_GT(N, 0);
  float* input = new float[N];
  float *spectrogram, *last_spectrogram;
  int t;
  const int N_Trials = 100;
  float output_profile[N_Trials];
  DebugFile debug = DebugFile("/tmp/sounds/test_spectral_difference.m");
  float amplitude;
  for (t = 0, amplitude = 1.0; t < N_Trials; t++, amplitude *= 0.9) {
    int i;
    const float freq = t / 2.0;
    for (i = 0; i < N; i++) {
      input[i] = sin(2 * M_PI * freq * i / static_cast<float>(N)) * amplitude;
    }
    speedyAddData(stream_, input, t);
    int current_time = speedyGetCurrentTime(stream_);
    spectrogram = speedyGetSpectrogramAtTime(stream_, current_time);
    ASSERT_TRUE(spectrogram);
    last_spectrogram = speedyGetSpectrogramAtTime(stream_, current_time - 1);
    ASSERT_TRUE(last_spectrogram);

    speedyComputeSpectralDifference(stream_, spectrogram, last_spectrogram, t);
    output_profile[t] = speedyGetSpeechChanges(stream_);

    float* features = speedyGetInternalState(stream_);
    debug.Write1DColumn("sd_features", features, kFeatureValueCount, t);
  }
  delete[] input;

  debug.Write1D("relative_sd", output_profile, N_Trials);
  EXPECT_NEAR(output_profile[N_Trials - 1], 0.0, 1e-6);
}

// Send a decaying sinusoid to Speedy via speedyAddData.  Make sure that the
// final calculated tension is what we expect.
TEST_F(SpeedyTest, TestTension) {
  constexpr float kTestSinusoidFrequency = 220;  // Hz
  constexpr float kSoundDuration = 1.0;          // Seconds
  constexpr float kSilentStart = 0.15;           // When to start the sound
  constexpr float kDecayRate = 0.5;              // Exponential signals decay
  constexpr int kSampleRate = 22050;             // Samples per second
  constexpr int kFrameRate = 100;                // Frames per second
  // kStepSize is a float because the step size might not be an integer
  // number based on the actual audio sample rate.
  constexpr float kStepSize = (kSampleRate / static_cast<float>(kFrameRate));
  constexpr int kSampleCount = kSampleRate*kSoundDuration;
  DebugFile debug = DebugFile("/tmp/sounds/test_tension.m");

  // Create a decaying exponential, after kSilentStart seconds of silence.
  float* input = new float[kSampleCount];
  for (int i = 0; i < kSilentStart * kSampleRate; i++) input[i] = 0;
  for (int i = kSilentStart * kSampleRate; i < kSampleCount; i++) {
    input[i] = std::exp(-(i - kSilentStart * kSampleRate) /
                        (kSampleRate * kDecayRate)) *
               sin(2 * M_PI * kTestSinusoidFrequency * i /
                   static_cast<float>(kSampleRate));
  }

  Initialize(kSampleRate);
  debug.Write1D("input", input, kSampleCount);

  const int window_size = speedyInputFrameSize(stream_);
  const int frame_count = (kSampleCount-window_size)/kStepSize + 1;
  const int fft_size = speedyFFTSize(stream_);
  float* tension = new float[frame_count];

  // Write out the experiment parameters.
  debug.WriteScalar("f_s", kSampleRate);
  debug.WriteScalar("f0", kTestSinusoidFrequency);
  debug.WriteScalar("window_size", window_size);
  debug.WriteScalar("fft_size", fft_size);
  debug.WriteScalar("frame_count", frame_count);

  // Run the test over all the input frames.
  int input_time = 0, output_time = 0;
  for (input_time = 0; input_time < frame_count; input_time++) {
    int input_start = static_cast<int>(std::round(input_time * kStepSize));
    debug.Write1DColumn("frame", &input[input_start], window_size, input_time);
    speedyAddData(stream_, &input[input_start], input_time);
    // Check to see if any output data is available.  If so, save it.
    if (speedyComputeTension(stream_, output_time, &tension[output_time])) {
      // Write out one spectrogram slice.  Convert index (f) to Matlab indexing
      float* spectrogram = speedyGetSpectrogram(stream_);
      debug.Write1DColumn("spectrogram", spectrogram, fft_size, output_time);
      // Write out one spectrogram slice.  Convert index (f) to Matlab indexing
      float* normalized_spectrogram = speedyGetNormalizedSpectrogram(stream_);
      debug.Write1DColumn("normalized_spectrogram", normalized_spectrogram,
                          fft_size / 2, output_time);
      // Write out the current feature state.
      debug.Write1DColumn("features", speedyGetInternalState(stream_), 15,
                          output_time);
      output_time++;
    }
  }
  debug.Write1D("tension", tension, output_time);
  printf("Acculuated %d input frames, and output %d tension frames.\n",
         input_time, output_time);
  delete[] input;

  float minimum = tension[0], maximum = tension[0];
  for (int t = 0; t < output_time; t++) {
    if (tension[t] < minimum) minimum = tension[t];
    if (tension[t] > maximum) maximum = tension[t];
  }
  EXPECT_NEAR(minimum, -0.6, 1e-5);
  EXPECT_NEAR(maximum, 0.14273257553577423, 1e-6);
  EXPECT_NEAR(tension[output_time - 1], -0.31351470947265625, 1e-5);
  delete[] tension;
}

// Now apply speedy to some real speech.  Make sure that the average tension
// is close to zero, and the global speedup is close to what we asked for.
TEST_F(SpeedyTest, TestRealSpeech) {
  std::string fullFileName =
      
      "test_data/tapestry.wav";
  int sampleRate, numChannels;
  auto tapestryInts = ReadWaveFile(fullFileName, &sampleRate, &numChannels);
  EXPECT_EQ(tapestryInts.size(), 50381);
  std::vector<float> tapestryVector(tapestryInts.begin(), tapestryInts.end());
  EXPECT_EQ(tapestryInts[0], 15);  // Make sure input data is non-zero

  constexpr int kFrameRate = 100;                // Frames per second
  // stepSize is a float because the step size might not be an integer
  // number based on the actual audio sample rate.
  float stepSize = (sampleRate / static_cast<float>(kFrameRate));

  Initialize(sampleRate);

  const int window_size = speedyInputFrameSize(stream_);
  const int frame_count = (tapestryVector.size()-window_size)/stepSize + 1;

  // Run the test over all the input frames.
  std::vector<float> tension;
  int input_time, output_time = 0;
  for (input_time = 0; input_time < frame_count; input_time++) {
    int input_start = static_cast<int>(std::round(input_time * stepSize));
    float new_tension;
    speedyAddData(stream_, &tapestryVector[input_start], input_time);
    // Check to see if any output data is available.  If so, save it.
    if (speedyComputeTension(stream_, output_time, &new_tension)) {
      tension.push_back(new_tension);
      output_time = 0;
    }
  }
  printf("Sent %d sound frames to Speedy, and got back %d tension frames.\n",
         input_time, output_time);

  // Now check the limits of the tension from this utterance.
  auto maximum = *max_element(std::begin(tension), std::end(tension));
  auto minimum = *min_element(std::begin(tension), std::end(tension));
  EXPECT_LT(minimum, -0.4);
  EXPECT_GT(maximum, .75);
  auto average_tension =
      std::accumulate(tension.begin(), tension.end(), 0.0) / tension.size();
  // DC Response should be close to 0.
  EXPECT_NEAR(average_tension, 0.0, maximum/6.0);

  // Check that the average desired speed (Rg) is maintained).
  std::vector<float> speed(tension.size(), 0.0);
  const float Rg = 2.1;    // Arbitrary global speedup
  for (int i=0; i < tension.size(); i++) {
    speed[i] = speedyComputeSpeedFromTension(tension[i], Rg, 0.0, stream_);
  }
  auto average_speed = accumulate(speed.begin(), speed.end(), 0.0)/speed.size();

  printf("Speed Limits: %g %g ** %g ** %g %g", Rg-Rg/10.0, Rg-Rg/20.0, Rg,
         Rg+Rg/40.0, Rg+Rg/10.0);
  EXPECT_NEAR(average_speed, Rg, Rg/10.0);

  // check to make sure we're not too close.  (Leave room for normalization.)
  EXPECT_LE(average_speed, Rg - Rg/20.0);
}

// Now test speedy with the normalized rate. Final average speed should be much
// closer to the requested global speed.
TEST_F(SpeedyTest, TestRealSpeechNormalized) {
  std::string fullFileName =
      
      "test_data/tapestry.wav";
  int sampleRate, numChannels;
  auto tapestryInts = ReadWaveFile(fullFileName, &sampleRate, &numChannels);
  EXPECT_EQ(tapestryInts.size(), 50381);
  std::vector<float> tapestryVector(tapestryInts.begin(), tapestryInts.end());

  constexpr int kFrameRate = 100;                // Frames per second
  // stepSize is a float because the step size might not be an integer
  // number based on the actual audio sample rate.
  float stepSize = (sampleRate / static_cast<float>(kFrameRate));

  Initialize(sampleRate);

  const int window_size = speedyInputFrameSize(stream_);
  const int frame_count = (tapestryVector.size()-window_size)/stepSize + 1;

  // Run the test over all the input frames.
  std::vector<float> tension;
  int input_time, output_time = 0;
  for (input_time = 0; input_time < frame_count; input_time++) {
    int input_start = static_cast<int>(std::round(input_time * stepSize));
    float new_tension;
    speedyAddData(stream_, &tapestryVector[input_start], input_time);
    // Check to see if any output data is available.  If so, save it.
    if (speedyComputeTension(stream_, output_time, &new_tension)) {
      tension.push_back(new_tension);
      output_time = 0;
    }
  }
  printf("Sent %d sound frames to Speedy, and got back %d tension frames.\n",
         input_time, output_time);

  // Now check the limits of the tension from this utterance.
  auto maximum = *max_element(std::begin(tension), std::end(tension));
  auto minimum = *min_element(std::begin(tension), std::end(tension));
  EXPECT_LT(minimum, -0.4);
  EXPECT_GT(maximum, .75);
  auto average_tension =
      std::accumulate(tension.begin(), tension.end(), 0.0) / tension.size();
  // DC Response should be close to 0.
  EXPECT_NEAR(average_tension, 0.0, maximum/6.0);

  // Check that the average desired speed (Rg) is maintained).
  std::vector<float> speed(tension.size(), 0.0);
  const float Rg = 2.1;    // Arbitrary global speedup
  for (int i=0; i < tension.size(); i++) {
    speed[i] = speedyComputeSpeedFromTension(tension[i], Rg, 0.0, stream_);
  }
  auto average_speed = accumulate(speed.begin(), speed.end(), 0.0)/speed.size();
  EXPECT_NEAR(average_speed, Rg, Rg/10.0);
}

float MeasureExcessDuration(float feedbackStrength){
  std::string fullFileName =
      
      "test_data/tapestry.wav";
  int sampleRate, numChannels;
  auto tapestryInts = ReadWaveFile(fullFileName, &sampleRate, &numChannels);
  EXPECT_EQ(tapestryInts.size(), 50381);
  std::vector<float> tapestryVector(tapestryInts.begin(), tapestryInts.end());

  // Run the test over all the input frames.
  const int max_sample_count = 128;
  const float desired_rate = 3.0;
  sonicStream mySonicStream = sonicCreateStream(sampleRate, numChannels);
  sonicSetSpeed(mySonicStream, desired_rate);
  int16_t outputBuffer[max_sample_count];
  int totalSamplesSentToSpeedy = 0;
  int totalSamplesProducedBySpeedy = 0;

  sonicEnableNonlinearSpeedup(mySonicStream, 1.0);
  sonicSetDurationFeedbackStrength(mySonicStream, feedbackStrength);
  for (int i = 0; i < 100; i++) {  // Make input longer by concatenation
    for (int input_time = 0; input_time < tapestryVector.size();
        input_time += max_sample_count) {
      sonicWriteShortToStream(mySonicStream, &tapestryInts[input_time],
                              max_sample_count);
      totalSamplesSentToSpeedy += max_sample_count;
      /* Check to see if there is anything ready to be read (i.e. processed.) */
      int soundSamplesFromSpeedy = sonicReadShortFromStream(mySonicStream,
                                                            outputBuffer,
                                                            max_sample_count);
      totalSamplesProducedBySpeedy += soundSamplesFromSpeedy;
    }
  }
  printf("Sent %d sound samples to Speedy, and got back %d samples.\n",
         totalSamplesSentToSpeedy, totalSamplesProducedBySpeedy);
  auto excess_samples = (totalSamplesSentToSpeedy/desired_rate -
                         totalSamplesProducedBySpeedy);
  sonicDestroyStream(mySonicStream);
  return excess_samples/sampleRate;
}

// Now test speedy with feedback. Final average speed should be much
// closer to the requested global speed.
TEST_F(SpeedyTest, TestRealSpeechFeedback) {
  auto excess_p0 = MeasureExcessDuration(0.0);
  printf("Excess duration with feedback 0.0 is %gs\n", excess_p0);

  auto excess_p1 = MeasureExcessDuration(0.1);
  printf("Excess duration with feedback 0.1 is %gs\n", excess_p1);
  EXPECT_LT(fabs(excess_p1), fabs(excess_p0));

  auto excess_p2 = MeasureExcessDuration(0.2);
  printf("Excess duration with feedback 0.2 is %gs\n", excess_p2);
  EXPECT_LT(fabs(excess_p2), fabs(excess_p1));

  auto excess_p4 = MeasureExcessDuration(0.4);
  printf("Excess duration with feedback 0.4 is %gs\n", excess_p4);
  EXPECT_LT(fabs(excess_p4), fabs(excess_p2));
}

// Test the tension return function.
TEST_F(SpeedyTest, TestFeatureReturn) {
  const int sampleRate = 16000, sampleCount = 8000;
  const float F0 = 440.0;
  std::vector<float> inputVector;
  for (int i=0; i < sampleCount; i++) {
    inputVector.push_back(cos(2*M_PI*F0*i/static_cast<float>(sampleRate)));
  }

  constexpr int kFrameRate = 100;                // Frames per second
  // stepSize is a float because the step size might not be an integer
  // number based on the actual audio sample rate.
  float stepSize = (sampleRate / static_cast<float>(kFrameRate));

  Initialize(sampleRate);

  const int window_size = speedyInputFrameSize(stream_);
  const int frame_count = (inputVector.size()-window_size)/stepSize + 1;
  int expectedPeakBin = F0/(sampleRate/speedyFFTSize(stream_));

  // Run the test over all the input frames.
  std::vector<float> tension;
  int input_time, output_time = 0;
  for (input_time = 0; input_time < frame_count; input_time++) {
    int input_start = static_cast<int>(std::round(input_time * stepSize));
    float new_tension;
    speedyAddData(stream_, &inputVector[input_start], input_time);
    // Check to see if any output data is available.  If so, save it.
    if (speedyComputeTension(stream_, output_time, &new_tension)) {
      tension.push_back(new_tension);
      output_time++;
      // Make sure that the internal features vector has the right tension.
      float *features = speedyGetInternalState(stream_);
      ASSERT_EQ(features[11], new_tension);
      // Make sure the peak of the spectrogram is in the right place.
      float *spectrogram = speedyGetInternalSpectrogram(stream_);
      ASSERT_GT(spectrogram[expectedPeakBin], spectrogram[expectedPeakBin-1]);
      ASSERT_GT(spectrogram[expectedPeakBin], spectrogram[expectedPeakBin+1]);
    }
  }
  ASSERT_GT(output_time, 0);
  printf("Sent %d sound frames to Speedy, and got back %d tension frames.\n",
         input_time, output_time);
  ASSERT_EQ(input_time, output_time+kTemporalHysteresisFuture);
}

std::vector<std::vector<float>> ReadFloatMatrix(std::string filename) {
  std::string full_filename = 
                              "test_data/" +
                              filename;

  std::ifstream file_pointer(full_filename);

  std::vector<std::vector<float>> my_data;
  int row_number = 0;
  std::string line;
  while (getline(file_pointer, line)){
    if (line[0] == '#'){
      continue;
    }
    float value;
    std::stringstream ss(line);

    my_data.push_back(std::vector<float>());

    int cols = 0;
    while (ss >> value) {
      my_data[row_number].push_back(value);
      cols++;
    }
    ++row_number;
  }
  return my_data;
}

float ComputeDifference(std::vector<float> a, std::vector<float> b) {
  if (a.size() != b.size()) {
    return -1;
  }
  float error = 0.0;
  for (int i = 0; i < a.size(); i++) {
    float e = a[i] - b[i];
    error += e*e;
  }
  return error;
}

float ComputeEnergy(std::vector<float> a) {
  float sum = 0;
  for (float f : a) {
    sum += f*f;
  }
  return sum;
}

float ComputeSNR(std::vector<float> signal, std::vector<float> estimate) {
  float signal_power = ComputeEnergy(signal);
  float error_power = ComputeDifference(signal, estimate);
  return signal_power / error_power;
}

float FindMax(std::vector<float> a) {
  float m = 0;
  for (float f : a) {
    if (f > m) m = f;
  }
  return m;
}

std::vector<float> ExtractColumn(std::vector<std::vector<float>> a,
                                 int column) {
  std::vector<float> result;
  for (int i=0; i < a.size(); i++) {
    result.push_back(a[i][column]);
  }
  return result;
}

// https://stackoverflow.com/questions/421573/best-way-to-extract-a-subvector-from-a-vector
std::vector<float> ExtractPortion(std::vector<float> a, int start, int count) {
  assert(start >= 0);
  assert(count >= 0);
  int end = start + count;
  if (end > a.size()) end = a.size();
  std::vector<float> result(&a[start], &a[end-1]);
  return result;
}

std::vector<float> FindCrossCorrelation(std::vector<float> a,
                                        std::vector<float> b,
                                        int num_delays) {
  std::vector<float> correlation, a_short, b_short;
  for (int delay=-num_delays; delay < num_delays+1; delay++) {
    if (delay < 0) {
      int N = a.size() + delay;
      a_short = ExtractPortion(a, -delay, N);
      b_short = ExtractPortion(b, 0, N);
    } else {
      int N = a.size() - delay;
      a_short = ExtractPortion(a, 0, N);
      b_short = ExtractPortion(b, delay, N);
    }
    correlation.push_back(ComputeSNR(a_short, b_short));
  }
  return correlation;
}

TEST_F(SpeedyTest, TestTapestryFeatureComputations) {
  auto expectedSpectrogram = ReadFloatMatrix("tapestry_spectrogram_data.txt");
  ASSERT_EQ(expectedSpectrogram.size(), 314);      /* Number of time steps */
  ASSERT_EQ(expectedSpectrogram[0].size(), 330);   /* FFT Size / 2 */

  auto expectedNormalized = ReadFloatMatrix(
      "tapestry_normalized_spectrogram_data.txt");
  ASSERT_EQ(expectedNormalized.size(), 314);       /* Number of time steps */
  ASSERT_EQ(expectedNormalized[0].size(), 330);    /* FFT Size / 2 */

  auto expectedFeatures = ReadFloatMatrix("tapestry_features_data.txt");
  ASSERT_EQ(expectedFeatures.size(), 314);         /* Number of time steps */
  ASSERT_EQ(expectedFeatures[0].size(), 12);       /* Number of features/time */

  /* Use the 22kHz version of Tapestry so the default window size (1.5x the
   * frame step) is equal to 330, which is the only window size supported by the
   * Matlab reference code.
   */
  std::string fullFileName =
      
      "test_data/tapestry22050.wav";
  int sampleRate, numChannels;
  auto tapestryInts = ReadWaveFile(fullFileName, &sampleRate, &numChannels);
  EXPECT_EQ(tapestryInts.size(), 69431);
  EXPECT_EQ(numChannels, 1);
  EXPECT_EQ(sampleRate, 22050);
  std::vector<float> tapestryVector(tapestryInts.begin(), tapestryInts.end());
  for (int i = 0; i < tapestryInts.size(); i++) {
    tapestryVector[i] /= 32768.0;
  }
  EXPECT_NEAR(FindMax(tapestryVector), 0.41369, 0.001);  /* To match Matlab */

  constexpr int kFrameRate = 100;                // Frames per second
  // stepSize is a float because the step size might not be an integer
  // number based on the actual audio sample rate.
  float stepSize = (sampleRate / static_cast<float>(kFrameRate));

  Initialize(sampleRate);

  const int window_size = speedyInputFrameSize(stream_);
  ASSERT_EQ(window_size, 330);                    /* Match Matlab reference */
  const int frame_count = (tapestryVector.size()-window_size)/stepSize + 1;

  // Run the test over all the input frames.
  std::vector<float> tension;
  int input_time, output_time = 0;
  const int fft_size = speedyFFTSize(stream_);
  const int feature_size = kFeatureValueCount;

  std::vector<std::vector<float>> computedSpectrogram;
  std::vector<std::vector<float>> computedNormalized;
  std::vector<std::vector<float>> computedFeatures;
  for (input_time = 0; input_time < frame_count; input_time++) {
    int input_start = static_cast<int>(std::round(input_time * stepSize));
    float new_tension;
    speedyAddData(stream_, &tapestryVector[input_start], input_time);
    auto spectrogram_frame = speedyGetSpectrogram(stream_);
    std::vector<float> spectrogram_frame_vec(spectrogram_frame,
                                             spectrogram_frame + fft_size/2);
    computedSpectrogram.push_back(spectrogram_frame_vec);
    // Check to see if any output data is available.  If so, save it.
    if (speedyComputeTension(stream_, output_time, &new_tension)) {
      tension.push_back(new_tension);

      auto normalized_frame = speedyGetNormalizedSpectrogram(stream_);
      std::vector<float> normalized_frame_vec(normalized_frame,
                                              normalized_frame + fft_size/2);
      computedNormalized.push_back(normalized_frame_vec);

      auto features_frame = speedyGetInternalState(stream_);
      std::vector<float> features_frame_vec(features_frame,
                                            features_frame + feature_size);
      computedFeatures.push_back(features_frame_vec);

      output_time++;
    }
  }
  printf("Sent %d sound frames to Speedy, and got back %d tension frames.\n",
         input_time, output_time);
  ASSERT_EQ(computedSpectrogram.size(), expectedSpectrogram.size());
  ASSERT_EQ(computedSpectrogram.size(), 314);
  ASSERT_EQ(computedNormalized.size(), 306);
  ASSERT_EQ(computedFeatures.size(), 306);

  DebugFile debug = DebugFile("/tmp/sounds/test_features.m");
  // Check the spectrogram behavior.
  if (1) {
    int col = 150;
    const int max_delay = 20;
    std::vector<float> spectrogram_snrs;
    for (int delay = -max_delay; delay < max_delay; delay++) {
      auto snr = ComputeSNR(expectedSpectrogram[col],
                            computedSpectrogram[col+delay]);
      printf("Spectrogram snr at %d is %g.\n", delay, snr);
      float snr_db = 10 * std::log10(snr);
      debug.Write1DColumn("expected_spectrogram_slice",
                          &expectedSpectrogram[col][0],
                          expectedSpectrogram[col].size(),
                          delay+max_delay);
      debug.Write1DColumn("computed_spectrogram_slice",
                          &computedSpectrogram[col+delay][0],
                          computedSpectrogram[col+delay].size(),
                          delay+max_delay);
      debug.Write1DValue("spectrogram_snr", snr_db, delay+max_delay);
      spectrogram_snrs.push_back(snr_db);
    }
    ASSERT_GT(spectrogram_snrs[max_delay], 27);
    for (int delta = -max_delay; delta < max_delay; delta++) {
      if (delta != 0) {
        ASSERT_GT(spectrogram_snrs[max_delay],
                  spectrogram_snrs[max_delay + delta]);
      }
    }
  }

  if (1) {          /* Check the normalized spectrogram */
    for (int frame = 0; frame < computedNormalized.size(); frame++) {
      auto frame_energy = ComputeEnergy(computedNormalized[frame]);
      ASSERT_NEAR(frame_energy, 1, 4e-3);
    }

    int col = 150;
    const int max_delay = 20;
    std::vector<float> normalized_snrs;
    for (int delay = -max_delay; delay < max_delay; delay++) {
      auto snr = ComputeSNR(expectedNormalized[col],
                            computedNormalized[col+delay]);
      float snr_db = 10 * std::log10(snr);
      debug.Write1DValue("normalized_spectrogram_snr", snr_db, delay+max_delay);
      normalized_snrs.push_back(snr_db);
    }
    ASSERT_GT(normalized_snrs[max_delay], 27);
    for (int delay = -max_delay; delay < max_delay; delay++) {
      if (delay != 0) {
        ASSERT_GT(normalized_snrs[max_delay],
                  normalized_snrs[max_delay + delay]);
      }
    }
  }

  // Test all the intermediate features, comparing the expected values from
  // Matlab to those that are computed by the speedy library.

  struct feature_list_struct {
    std::string name;
    int best_delay;
    float threshold;
  };
  struct feature_list_struct feature_list[] = {
    {"Spectrogram energy",                 0,  2e5},
    {"Energy Lowpass",                     8,  7e5},
    {"Energy Local",                       8,  4e4},
    {"Energy Compressed",                  8,  9e5},
    {"Energy Hysteresis",                  0,  320},
    {"Low Energy Frame",                   0,  1e8},
    {"Local Spectral Difference",          0,  19},
    {"Emphasis Weighted Local Difference", 0,  29},
    {"Emphasis Weighted Lowpass Filter",  -1,  2300},
    {"Relative Spectral Difference",       0,  28},
    {"Speech Changes",                     0,  7},
    {"Audio Tension",                      0,  8},
  };

  for (int feature_num = 0; feature_num < 12; feature_num++) {
    const int num_delays = 10;
    auto expected_feature = ExtractColumn(expectedFeatures, feature_num);
    ASSERT_EQ(expected_feature.size(),
              expectedFeatures.size()) <<
        "Feature #" << feature_num << " " << feature_list[feature_num].name;

    auto computed_feature = ExtractColumn(computedFeatures, feature_num);
    ASSERT_EQ(computed_feature.size(), computedFeatures.size()) <<
        "Feature #" << feature_num << " " << feature_list[feature_num].name;
    debug.Write1DColumn("expected_features", &expected_feature[0],
                        expected_feature.size(), feature_num);
    debug.Write1DColumn("computed_features", &computed_feature[0],
                        computed_feature.size(), feature_num);
    auto signal_to_noise_ratios = FindCrossCorrelation(computed_feature,
                                                       expected_feature,
                                                       num_delays);
    float best_delay_snr = -1;
    int best_delay_index = -1;
    for (int i=0; i < signal_to_noise_ratios.size(); i++) {
      if (signal_to_noise_ratios[i] > best_delay_snr) {
        best_delay_snr = signal_to_noise_ratios[i];
        best_delay_index = i;
      }
    }
    debug.Write1DColumn("feature_snr", &signal_to_noise_ratios[0],
                        signal_to_noise_ratios.size(), feature_num);
    printf("Best match for feature %d is at delay %d: %g\n", feature_num,
           best_delay_index - num_delays, best_delay_snr);
    EXPECT_EQ(best_delay_index - num_delays,
              feature_list[feature_num].best_delay) <<
        "Feature #" << feature_num << " " << feature_list[feature_num].name;
    EXPECT_GT(best_delay_snr, feature_list[feature_num].threshold) <<
        "Feature #" << feature_num << " " << feature_list[feature_num].name;
  }
}

/* To plot the results stored in the test_feature file, use the following
 * Matlab commands to create a plot overlaying the expected and the computed
 * features.

test_features

feature_name = {'Spectrogram energy',
    'Energy Lowpass',
    'Energy Local',
    'Energy Compressed',
    'Energy Hysteresis',
    'Low Energy Frame',
    'Local Spectral Difference',
    'Emphasis Weighted Local Difference',
    'Emphasis Weighted Lowpass Filter',
    'Relative Spectral Difference',
    'Speech Changes',
    'Audio Tension'
    };
%%
figure(3);
for i=1:12
    subplot(6,2,i);
    offset = 0;
    if i == 2 | i == 3 || i == 4
        offset = 8;
    end
    plot(offset+(1:size(computed_features, 1)), computed_features(:,i), ...
                 1:size(expected_features, 1),  expected_features(:,i));
    title(feature_name{i});
    if i == 1
        legend('Speedy C', 'Matlab');
    end
end
xlabel(string(datetime))
 */


}  // namespace


int main(int argc, char **argv) {
  testing::InitGoogleTest(&argc, argv);

  return RUN_ALL_TESTS();
}