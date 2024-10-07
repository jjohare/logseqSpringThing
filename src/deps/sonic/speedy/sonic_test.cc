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

#include <cmath>
#include <numeric>

#include "dynamic_time_warping.h"
#include "gtest/gtest.h"  // Needed for external testing

#include "glog/logging.h"
#include "glog/logging.h"  // Needed for external testing

/*
 * Lots of asserts in the C code, so test with:
 *   blaze test :sonic2_test -c dbg --copt=-gmlt
 * Otherwise asserts are ignored in gunit (because it assumes production mode.)
 * To get the debugging files, must run the binary (outside of blaze)
 *   ../../blaze-bin/sonic2_test
 * Then copy to gcloud
 *   gsutil -m cp /tmp/sounds/[a-z]* gs://speedytestaudio.appspot.com/tmp/
 * and view at
 *   https://pantheon.corp.google.com/storage/browser/speedytestaudio.appspot.com/tmp/?project=speedytestaudio
 */

extern "C" {
#include "wave.h"
#include "sonic2.h"
#include "speedy.h"
}

namespace {

// See http://goto/gunitprimer for an introduction to gUnit.

class Sonic2Test : public ::testing::Test {
 protected:
  Sonic2Test() {
    stream_ = 0;
  }

  void Reset() {
    if (stream_ != nullptr) {
      LOG(INFO) << "Destroying the sonicStream object." << std::endl;
      sonicDestroyStream(stream_);
    }
    stream_ = nullptr;
  }

  ~Sonic2Test() override {
    if (stream_ != nullptr) {
      LOG(INFO) << "Destroying the sonicStream object at " << stream_ <<
          std::endl;
      sonicDestroyStream(stream_);
    }
  }

  // Objects declared here can be used by all TEST_Fs in the test case for
  // sonic.
  // See http://goto/gunitprimer#Test_Fixtures_Using_the_Same_Dat for details.
  void Initialize(int sampleRate, int numChannels) {
    ASSERT_FALSE(stream_);
    stream_ = sonicCreateStream(sampleRate, numChannels);
    LOG(INFO) << "Initialize sonic stream returning " << stream_ <<
        " for " << numChannels << " channels at " << sampleRate << "Hz." <<
        std::endl;
  }

  sonicStream stream_;
};

/****************************************************************************
 * Analysis
 ****************************************************************************/

template<class T>
float LinearSlope(std::vector<T> x, std::vector<T> y) {
  // From: http://www.statisticshowto.com/wp-content/uploads/2009/11/linearregressionequations.bmp
  assert(x.size() == y.size());
  int n = x.size();
  float sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (int i = 0; i < x.size(); ++i) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
  }
  return (n*sumXY - sumX*sumY)/(n*sumX2 - sumX*sumX);
}

template<class T>
void LinearSlopeEverywhere(std::vector<T> x, std::vector<T> y, int halfWidth,
                           std::vector<float>* slopes) {
  assert(x.size() == y.size());
  int n = x.size();
  for (int i = halfWidth; i < n-halfWidth; i++) {
    std::vector<T> pieceX = std::vector<T>(x.begin()+i-halfWidth,
                                           x.begin()+i+halfWidth);
    std::vector<T> pieceY = std::vector<T>(y.begin()+i-halfWidth,
                                           y.begin()+i+halfWidth);
    slopes->push_back(LinearSlope(pieceX, pieceY));
  }
}

// https://stackoverflow.com/questions/7616511/calculate-mean-and-standard-deviation-from-a-vector-of-samples-in-c-using-boos
template<class T>
float VectorMean(std::vector<T> v) {
  float sum = std::accumulate(v.begin(), v.end(), 0.0);
  return sum / v.size();
}

template<class T>
float VectorStandardDeviation(std::vector<T> v) {
  float sum = std::accumulate(v.begin(), v.end(), 0.0);
  float mean = sum / v.size();

  std::vector<float> diff(v.size());
  std::transform(v.begin(), v.end(), diff.begin(),
                 [mean](float x) { return x - mean; });
  float sq_sum = std::inner_product(diff.begin(), diff.end(), diff.begin(),
                                     0.0);
  return std::sqrt(sq_sum / v.size());
}

// Compute the Teager energy operator
//     http://www.aes.org/e-lib/browse.cfm?elib=9892
// over a signal, which is equal to
//     x^2(n) - x(n-1)*x(n+1)
// and for a sinusoid should be a constant for all values of n.  Return the
// mean and variance of this operator (over the entire signal) as a quick and
// dirty check of sinusoidal quality.
template <class T>
void TeagerVariance(T* data, int total_samples, float* mean, float* variance) {
  float M2 = 0.0;
  *mean = 0.0;
  for (int n = 1; n < total_samples-1; ++n) {
    float teager = 1.0*data[n]*data[n] - 1.0*data[n-1]*data[n+1];
    // Compute the variance of the Teager signal with an online algorithm:
    // https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Online_algorithm
    float delta = teager - *mean;
    *mean += delta/n;
    float delta2 = teager - *mean;
    M2 += delta*delta2;
  }
  *variance = M2 / (total_samples - 3);  // Since 1st & last samples skipped
}

template <class T>
void TeagerVariance(std::vector<T> data, float* mean, float* variance) {
  TeagerVariance(&data[0], data.size(), mean, variance);
}

template <class T>
void TeagerComputation(std::vector<T> data, std::vector<float>* result) {
  result->clear();
  for (int n = 1; n < data.size() - 1; ++n) {
    float teager = static_cast<float>(data[n])*data[n] -
                   static_cast<float>(data[n - 1]) * data[n + 1];
    result->push_back(teager);
  }
}

/* Count how many times the Teager energy measures exceeds a fixed threshold,
 * thus indicating places where a sinusoid is not continuous.  The argument
 * thresh_fraction is a fraction of the mean, and this function returns a count
 * of the number of times the Teager energy exceeds the mean by +/- this
 * threshold.
 */
template <class T>
int TeagerOutlierCount(std::vector<T> data, float thresh_fraction) {
  int error_count = 0;
  float mean, variance;

  TeagerVariance(data, &mean, &variance);
  float threshold = mean * thresh_fraction;
  for (int n=1; n < data.size() - 1; ++n) {
    float teager = static_cast<float>(data[n])*data[n] -
                   static_cast<float>(data[n - 1]) * data[n + 1];
    if (fabs(teager - mean) > threshold) {
      printf("Found outlier at position %d is out of scale %g\n", n,
             (teager-mean)/mean);
      error_count++;
    }
  }
  printf("*** Error count is %d in %lu samples.\n", error_count, data.size());
  return error_count;
}

// Computes the Euclidean distance between two points, used by DTW.
float EuclideanDistance(const std::vector<float>& sequence1,
                        const std::vector<float>& sequence2) {
  CHECK_EQ(sequence1.size(), sequence2.size());
  float sum2 = 0.0;
  for (int i=0; i < sequence1.size(); i++) {
    float diff = sequence1[i] - sequence2[i];
    sum2 += diff * diff;
  }
  return sqrt(sum2);
}

std::vector<std::vector<float>> ComputeSpectrogram(
    std::vector<int16_t> input_vector, float sample_rate) {
  speedyStream mySpeedyStream = speedyCreateStream(sample_rate);
  int frame_size = speedyInputFrameSize(mySpeedyStream);
  auto input_buffer = new float[frame_size];
  int spectrogram_height = speedyFFTSize(mySpeedyStream)/2;
  std::vector<std::vector<float>> my_result;
  LOG(INFO) << "ComputeSpectrogram frame_size is " << frame_size <<
    ", spectrogram_height is " << spectrogram_height << std::endl;
  LOG(INFO) << "ComputeSpectrogram input has " << input_vector.size() <<
    " elements at " << sample_rate << "Hz." << std::endl;

  for (int at_time=0; at_time+frame_size < input_vector.size();
       at_time += frame_size) {
    for (int i = 0; i < frame_size; i++) {
      input_buffer[i] = input_vector[at_time+i];
    }
    float *spectral_slice = speedySpectrogram(mySpeedyStream, input_buffer);
    auto spectral_vector = std::vector<float>(spectrogram_height);
    for (int i = 0; i < spectrogram_height/2; i++) {
      spectral_vector[i] = static_cast<float>(spectral_slice[i]);
    }
    my_result.push_back(spectral_vector);
  }
  speedyDestroyStream(mySpeedyStream);
  delete[] input_buffer;
  return my_result;
}

/****************************************************************************
 * File IO
 ****************************************************************************/
// Note these functions' output (usually to /tmp) will not be accessible unless
// the directory is present (and you are not running this as part of a
// blaze test...

// Small function to output data (generally into /tmp files) so we can read them
// in with Matlab or Numpy to investigate errors.
template <class myType>
void WriteData(std::vector<myType> data, const char* file_name) {
  FILE *fp = fopen(file_name, "wt");
  if (fp) {
    for (int i = 0; i < data.size(); ++i) {
      fprintf(fp, "  %g\n", static_cast<float>(data[i]));
    }
    fclose(fp);
  } else {
    fprintf(stderr, "Can't create WriteData file at %s.\n", file_name);
  }
}

void SaveWaveform(std::vector<int16_t> samples, const std::string& filename,
                  int sampleRate, int numChannels) {
  LOG(INFO) << "SaveWaveform writing " << samples.size() << " samples to " <<
      filename << "." << std::endl;
  auto fp = openOutputWaveFile(filename.c_str(), sampleRate, numChannels);
  if (fp) {
    writeToWaveFile(fp, &samples[0], samples.size()/numChannels);
    closeWaveFile(fp);
  }
}

std::vector<int16_t> ReadWaveFile(const std::string& fileName, int* sampleRate,
                                  int* numChannels) {
  const int32_t kBufferSize = 1024;
  int16_t buffer[kBufferSize];
  std::vector<int16_t> outputVector;
  auto fp = openInputWaveFile(fileName.c_str(), sampleRate, numChannels);
  EXPECT_TRUE(fp);
  int numRead;
  do {
    numRead = readFromWaveFile(fp, buffer, kBufferSize);
    outputVector.insert(outputVector.end(), buffer, buffer+numRead);
  } while (numRead > 0);
  closeWaveFile(fp);
  return outputVector;
}

/****************************************************************************
 * Support functions for the tests that follow
 ****************************************************************************/

/* CreateSinusoidTest - Create a stereo test sound, with an arbitrary number of
 * channels.  The matchingChannels parameter says whether all channels should be
 * identical (1) or different (0).
 */

// In Hz, number unlikely to be integer cycles per buffer.
constexpr float kPitch = 237;

std::vector<int16_t> CreateSinusoidTest(int sampleRate, int channels,
                                        int matchingChannels,
                                        float num_seconds) {
  constexpr uint32_t kAmplitude = 32000;
  uint32_t kTotalSampleCount = num_seconds * sampleRate;
  float kPeriodSamples = static_cast<float>(sampleRate) / kPitch;
  std::vector<int16_t> inputVector;

  // Create the input sinsuoid
  for (uint32_t i = 0; i < kTotalSampleCount; ++i) {
    int16_t sample =
        static_cast<int16_t>(kAmplitude * sin(i * 2 * M_PI / kPeriodSamples));
    inputVector.push_back(sample);    // First channel is always loaded.
    for (uint32_t j = 1; j < channels; j++) {
      inputVector.push_back(sample*matchingChannels);  // Rest are optional.
    }
  }
  assert(inputVector.size() == kTotalSampleCount*channels);
  return inputVector;
}

/* Like above but a floating point result.
 * CreateSinusoidFloatTest - Create a stereo test sound, with an arbitrary number of
 * channels.  The matchingChannels parameter says whether all channels should be
 * identical (1) or different (0).
 */
std::vector<float> CreateSinusoidFloatTest(int sampleRate, int channels,
                                           int matchingChannels) {
  constexpr float kAmplitude = .99;
  uint32_t kTotalSampleCount = sampleRate;
  float kPeriodSamples = sampleRate / kPitch;
  std::vector<float> inputVector;

  // Create the input sinsuoid
  for (uint32_t i = 0; i < kTotalSampleCount; ++i) {
    float sample = kAmplitude * sin(i * 2 * M_PI / kPeriodSamples);
    inputVector.push_back(sample);
    for (uint32_t j = 1; j < channels; j++) {
      inputVector.push_back(sample*matchingChannels);
    }
  }
  return inputVector;
}


// Global variables and functions so we can save the tension calculations.
// Just for testing.
std::vector<float> savedTensionVector;
void saveTension(sonicStream myStream, int time, float tension) {
  savedTensionVector.push_back(tension);
}


// Just preserve the tension calculated and saved in the internal features vec.
// Should be the same values as from above.
std::vector<float> savedTensionFromFeaturesVector;
void saveFeaturesTension(sonicStream stream, int time, float* features) {
  savedTensionFromFeaturesVector.push_back(features[11]);
}


// Feed a signal to libsonic and time compress the audio.  Call Initialize to
// set the sample rate and number of channels *before* calling this routine.
std::vector<int16_t> TimeCompressVector(sonicStream stream,
                                        std::vector<int16_t> inputVector,
                                        float speed, float nonlinear) {
  EXPECT_TRUE(stream);
  constexpr uint64_t kBufferSize = 128;
  int32_t samplesRead;
  int32_t channelCount = sonicIntGetNumChannels(stream);
  int16_t* outputBuffer = new int16_t[kBufferSize * channelCount];
  std::vector<int16_t> outputVector;

  sonicSetSpeed(stream, speed);
  // TODO(malcolmslaney) set last parameter to 0.0
  sonicEnableNonlinearSpeedup(stream, nonlinear);
  // Preserve the tension calculation results for testing.
  sonicTensionCallback(stream, saveTension);
  savedTensionVector.clear();
  sonicFeaturesCallback(stream, saveFeaturesTension);
  savedTensionFromFeaturesVector.clear();

  int num_time_steps = inputVector.size()/channelCount;
  for (uint32_t t = 0; t < num_time_steps; t += kBufferSize) {
    int16_t* inputPointer = &inputVector[0] + channelCount * t;
    int64_t inputCount = fmin(kBufferSize, num_time_steps - t);
    EXPECT_TRUE(sonicWriteShortToStream(stream, inputPointer, inputCount));
    samplesRead = sonicReadShortFromStream(stream, outputBuffer, kBufferSize);
    for (uint32_t i = 0; i < samplesRead * channelCount; ++i) {
      outputVector.push_back(outputBuffer[i]);
    }
  }
  // Flush the processing streams and collect the rest of the samples.
  EXPECT_TRUE(sonicFlushStream(stream));
  do {
    samplesRead = sonicReadShortFromStream(stream, outputBuffer, kBufferSize);
    for (uint32_t i = 0; i < samplesRead * channelCount; ++i) {
      outputVector.push_back(outputBuffer[i]);
    }
  } while (samplesRead > 0);
  delete[] outputBuffer;
  return outputVector;
}

// Floating point version of the routine above.
// Feed a signal to libsonic and time compress the audio.  Call Initialize to
// set the sample rate before calling this routine.
std::vector<float>TimeCompressFloatVector(sonicStream stream,
                                          std::vector<float>inputVector,
                                          float speed,
                                          float nonlinear) {
  EXPECT_TRUE(stream);
  constexpr uint64_t kBufferSize = 128;  // Number of time steps
  int32_t samplesRead;
  int32_t channelCount = sonicIntGetNumChannels(stream);
  float* outputBuffer = new float[kBufferSize*channelCount];
  std::vector<float> outputVector;

  sonicSetSpeed(stream, speed);
  sonicEnableNonlinearSpeedup(stream, nonlinear);
  sonicTensionCallback(stream, saveTension);

  int num_time_steps = inputVector.size()/channelCount;
  for (uint32_t t = 0; t < num_time_steps; t += kBufferSize) {
    float *inputPointer = &inputVector[0] + channelCount*t;
    int64_t inputCount = fmin(kBufferSize, num_time_steps - t);
    EXPECT_TRUE(sonicWriteFloatToStream(stream, inputPointer, inputCount));
    samplesRead = sonicReadFloatFromStream(stream, outputBuffer, kBufferSize);
    for (uint32_t i = 0; i < samplesRead * channelCount; ++i) {
      outputVector.push_back(outputBuffer[i]);
    }
  }
  // Flush the processing streams and collect the rest of the samples.
  EXPECT_TRUE(sonicFlushStream(stream));
  do {
    samplesRead = sonicReadFloatFromStream(stream, outputBuffer, kBufferSize);
    for (uint32_t i = 0; i < samplesRead * channelCount; ++i) {
      outputVector.push_back(outputBuffer[i]);
    }
  } while (samplesRead > 0);
  delete[] outputBuffer;
  return outputVector;
}

// Extract one channel from a multichannel vector.
template<class T>
void ExtractChannel(const std::vector<T> source, std::vector<T>* output,
                    int channel, int channelCount) {
  ASSERT_EQ(source.size() % channelCount, 0);
  int i = 0;
  output->clear();
  while (i < source.size()) {
    output->push_back(source[i + channel]);
    i += channelCount;
  }
}

/****************************************************************************
 * Tests
 ****************************************************************************/

/*
 * Make sure we can access and properly read our test audio files.
 */
TEST_F(Sonic2Test, TestReadWave) {
  std::string fullFileName = 
      "test_data/tapestry.wav";
  int sampleRate, numChannels;
  auto tapestryVector = ReadWaveFile(fullFileName, &sampleRate, &numChannels);
  EXPECT_EQ(tapestryVector.size(), 50381);
}

/*
 * Test the basic plumbing.  Just like the original libsonic test, using a
 * sinusoid, to make sure that the data flows through correctly, and we get the
 * right number of samples back.
 */
TEST_F(Sonic2Test, TestWithSinusoids) {
  constexpr int kNumChannels = 1;
  constexpr int matchingChannels = 1;
  constexpr float kSpeed = 3.0;
  constexpr int kSampleRate = 22050;
  // Not zero, to force the full speedy computation (but still basically linear
  // speedup.)
  constexpr float kMinimalNonlinear = 1e-5;
  auto sinusoid = CreateSinusoidTest(kSampleRate, kNumChannels,
                                     matchingChannels, 1.0);
  SaveWaveform(sinusoid, "/tmp/sounds/sinusoid-input.wav", kSampleRate,
               kNumChannels);
  std::vector<float> teagerVector;
  TeagerComputation(sinusoid, &teagerVector);
  WriteData(teagerVector, "/tmp/sounds/sinusoid-fast-input-teager.txt");

  Initialize(kSampleRate, 1);
  ASSERT_EQ(getSonicBufferSize(stream_), 0);    /* Before buffers allocated. */

  auto compressed_result = TimeCompressVector(stream_, sinusoid, kSpeed,
                                              kMinimalNonlinear);
  ASSERT_GT(getSonicBufferSize(stream_), 0);    /* After buffers allocated. */
  SaveWaveform(compressed_result, "/tmp/sounds/sinusoid-fast-output.wav",
               kSampleRate, kNumChannels);

  // Check the output length to make sure it is close to expected.
  float expected_samples = sinusoid.size() / kSpeed;
  EXPECT_NEAR(compressed_result.size(), expected_samples,
              .015*expected_samples);

  // Now test the output to make sure it's still a sinusoid.  Compute the
  // Teager operator over the original input sinusoid, because
  // it is quite noisy (due to 16 bit quantization).  Use the variance of this
  // signal's Teager operator to normalize the measure we compute of the sped-up
  // signal.
  teagerVector.clear();
  TeagerComputation(compressed_result, &teagerVector);
  WriteData(teagerVector, "/tmp/sounds/sinusoid-fast-output-teager.txt");

  float input_mean, input_variance, compressed_mean, compressed_variance;
  TeagerVariance(sinusoid, &input_mean, &input_variance);
  // Skip the last few buffers because the amplitude goes down due to the SOLA
  // we use here.
  TeagerVariance(&compressed_result[0], compressed_result.size()-300,
                 &compressed_mean, &compressed_variance);
  printf("Input Teager Summary: Mean=%g, Variance=%g\n",
         input_mean, input_variance);
  printf("Output Teager Summary: Mean=%g, Variance=%g\n",
         compressed_mean, compressed_variance);
  ASSERT_NEAR(input_mean, compressed_mean, 0.01*input_mean);  // 1% error enough
  ASSERT_LT(sqrt(input_variance)/input_mean, 0.01);
  ASSERT_LT(sqrt(compressed_variance)/compressed_mean, 0.01);
}

/*
 * Test slowdown.  Just like above, but kSpeed < 1.0
 */
TEST_F(Sonic2Test, TestWithSinusoidsSlowdown) {
  constexpr int kNumChannels = 1;
  constexpr int matchingChannels = 1;
  constexpr float kSpeed = 0.4;
  constexpr int kSampleRate = 22050;
  // Not zero, to force the full speedy computation (but still basically linear
  // speedup.)
  constexpr float kMinimalNonlinear = 1e-5;
  auto sinusoid = CreateSinusoidTest(kSampleRate, kNumChannels,
                                     matchingChannels, 1.0);
  SaveWaveform(sinusoid, "/tmp/sounds/sinusoid-input.wav", kSampleRate,
               kNumChannels);
  std::vector<float> teagerVector;
  TeagerComputation(sinusoid, &teagerVector);
  WriteData(teagerVector, "/tmp/sounds/sinusoid-slow-input-teager.txt");

  Initialize(kSampleRate, 1);
  ASSERT_EQ(getSonicBufferSize(stream_), 0);    /* Before buffers allocated. */

  auto compressed_result = TimeCompressVector(stream_, sinusoid, kSpeed,
                                              kMinimalNonlinear);
  ASSERT_GT(getSonicBufferSize(stream_), 0);    /* After buffers allocated. */
  SaveWaveform(compressed_result, "/tmp/sounds/sinusoid-slow-output.wav",
               kSampleRate, kNumChannels);

  // Check the output length to make sure it is close to expected.
  float expected_samples = sinusoid.size() / kSpeed;
  EXPECT_NEAR(compressed_result.size(), expected_samples,
              .015*expected_samples);

  // Now test the output to make sure it's still a sinusoid.  Compute the
  // Teager operator over the original input sinusoid, because
  // it is quite noisy (due to 16 bit quantization).  Use the variance of this
  // signal's Teager operator to normalize the measure we compute of the sped-up
  // signal.
  teagerVector.clear();
  TeagerComputation(compressed_result, &teagerVector);
  WriteData(teagerVector, "/tmp/sounds/sinusoid-slow-output-teager.txt");

  float input_mean, input_variance, compressed_mean, compressed_variance;
  TeagerVariance(sinusoid, &input_mean, &input_variance);
  // Skip the last few buffers because the amplitude goes down due to the SOLA
  // we use here.
  TeagerVariance(&compressed_result[0], compressed_result.size()-1000,
                 &compressed_mean, &compressed_variance);
  printf("Input Teager Summary: Mean=%g, Variance=%g\n",
         input_mean, input_variance);
  printf("Output Teager Summary: Mean=%g, Variance=%g\n",
         compressed_mean, compressed_variance);

  ASSERT_NEAR(input_mean, compressed_mean, 0.01*input_mean);  // 1% error enough
  ASSERT_LT(sqrt(input_variance)/input_mean, 0.01);
  ASSERT_LT(sqrt(compressed_variance)/compressed_mean, 0.01);
}

/*
 * Floating point version of the routine above.
 * Test the basic plumbing.  Just like the original libsonic test, using a
 * sinusoid, to make sure that the data flows through correctly, and we get the
 * right number of samples back.
 */
TEST_F(Sonic2Test, TestWithFloatSinusoids) {
  constexpr int kNumChannels = 1;
  constexpr int matchingChannels = 1;
  constexpr float kSpeed = 3.0;
  constexpr int kSampleRate = 22050;
  // Not zero, to force the full speedy computation and all the buffering (but
  // still basically linear speedup.)
  constexpr float kMinimalNonlinear = 1e-5;
  auto sinusoid = CreateSinusoidFloatTest(kSampleRate, kNumChannels,
                                          matchingChannels);
  std::vector<float> teagerVector;
  TeagerComputation(sinusoid, &teagerVector);
  WriteData(teagerVector, "/tmp/sounds/sinusoid-float-input-teager.txt");

  Initialize(kSampleRate, 1);
  auto compressed_result = TimeCompressFloatVector(stream_, sinusoid, kSpeed,
                                                   kMinimalNonlinear);

  // Check the output length to make sure it is close to expected.
  float expected_samples = sinusoid.size() / kSpeed;
  EXPECT_NEAR(compressed_result.size(), expected_samples,
              .03*expected_samples);

  // Now test the output to make sure it's still a sinusoid.  Compute the
  // Teager operator over the original input sinusoid, because
  // it is quite noisy (due to 16 bit quantization).  Use the variance of this
  // signal's Teager operator to normalize the measure we compute of the sped-up
  // signal.
  teagerVector.clear();
  TeagerComputation(compressed_result, &teagerVector);
  WriteData(teagerVector, "/tmp/sounds/sinusoid-float-output-teager.txt");

  float input_mean, input_variance, compressed_mean, compressed_variance;
  TeagerVariance(sinusoid, &input_mean, &input_variance);
  // Skip the last few buffers because the amplitude goes down due to this SOLA.
  TeagerVariance(&compressed_result[0], compressed_result.size()-300,
                 &compressed_mean, &compressed_variance);
  ASSERT_NEAR(input_mean, compressed_mean, 0.01*input_mean);  // 1% error ok
  ASSERT_LT(sqrt(input_variance)/input_mean, 0.01);
  ASSERT_LT(sqrt(compressed_variance)/compressed_mean, 0.01);
}

/* Test basic speech speedup (comparing both linear and nonlinear).
 */
TEST_F(Sonic2Test, TestSpeechSample) {
  std::string inputFileName = 
      "test_data/tapestry.wav";
  int channelCount, sampleRate;
  auto original_samples = ReadWaveFile(inputFileName,
                                       &sampleRate, &channelCount);

  std::string outputFileName = "/tmp/sounds/tapestrySpeedy.wav";

  constexpr float kSpeed = 3.0;
  constexpr int kLinear = 0;
  constexpr int kNonLinear = 1;
  constexpr int kDtwWindow = 10;    // Smooth the (noisy) slope calculation

  SaveWaveform(original_samples, "/tmp/sounds/tapestry_original.wav",
               sampleRate, channelCount);
  auto original_spectrogram = ComputeSpectrogram(original_samples, sampleRate);

  Initialize(sampleRate, channelCount);
  auto linear_samples = TimeCompressVector(stream_, original_samples,
                                           kSpeed, kLinear);
  SaveWaveform(linear_samples, "/tmp/sounds/tapestry_linear.wav", 16000, 1);
  auto linear_spectrogram = ComputeSpectrogram(linear_samples, sampleRate);

  auto speedy_samples = TimeCompressVector(stream_, original_samples,
                                           kSpeed, kNonLinear);
  SaveWaveform(linear_samples, "/tmp/sounds/tapestry_linear.wav", 16000, 1);
  SaveWaveform(speedy_samples, "/tmp/sounds/tapestry_speedy.wav", 16000, 1);
  auto speedy_spectrogram = ComputeSpectrogram(speedy_samples, sampleRate);

  EXPECT_NEAR(original_samples.size(), 50381, 230);

  EXPECT_NEAR(linear_samples.size(), 50381/kSpeed, 140);

  const DynamicTimeWarping
      linear_dtw(linear_spectrogram[0].size(), EuclideanDistance);
  auto cost = linear_dtw.Compute(original_spectrogram, linear_spectrogram);

  EXPECT_LT(cost, 13000000);    // Arbitrary based on testing.
  // Now make sure the linear speedup has the correct slope.
  std::vector<int> path1, path2;
  linear_dtw.BestPathSequence(original_spectrogram, linear_spectrogram,
                       &path1, &path2);
  // Output results before checking (and potentially failing)
  WriteData(path1, "/tmp/sounds/linear_path1.txt");
  WriteData(path2, "/tmp/sounds/linear_path2.txt");

  EXPECT_EQ(path1.size(), path2.size());
  float linear_slope = LinearSlope(path1, path2);
  EXPECT_NEAR(linear_slope, 1.0/kSpeed, .02);

  // Now check the linear speedup's slope in more detail.
  std::vector<float> linear_slopes;
  LinearSlopeEverywhere(path1, path2, kDtwWindow, &linear_slopes);
  WriteData(linear_slopes, "/tmp/sounds/linear_slopes.txt");
  EXPECT_NEAR(VectorMean(linear_slopes), linear_slope, .02);
  // The following limit inversely depends on kDtwWindow.
  EXPECT_LT(VectorStandardDeviation(linear_slopes), 0.2);


  // Now make sure the speedy speedup has the correct slope.
  const DynamicTimeWarping
      speedy_dtw(linear_spectrogram[0].size(), EuclideanDistance);
  speedy_dtw.Compute(original_spectrogram, speedy_spectrogram);
  path1.clear(); path2.clear();
  speedy_dtw.BestPathSequence(original_spectrogram, speedy_spectrogram,
                              &path1, &path2);
  // Output results before checking (and potentially failing)
  WriteData(path1, "/tmp/sounds/speedy_path1.txt");
  WriteData(path2, "/tmp/sounds/speedy_path2.txt");
  WriteData(savedTensionVector, "/tmp/sounds/speedy_tension.txt");
  EXPECT_EQ(path1.size(), path2.size());
  float speedy_slope = LinearSlope(path1, path2);
  EXPECT_NEAR(speedy_slope, 1/kSpeed, .1);  // Arbitrary based on test run

  // Now check the speedy speedup's slope in more detail.
  std::vector<float> speedy_slopes;
  LinearSlopeEverywhere(path1, path2, kDtwWindow, &speedy_slopes);
  WriteData(speedy_slopes, "/tmp/sounds/speedy_slopes.txt");
  EXPECT_NEAR(VectorMean(speedy_slopes), speedy_slope, .02);
  // The following limit inversely depends on kDtwWindow.
  EXPECT_LT(VectorStandardDeviation(speedy_slopes), 0.2);
}

/* Test the original sonic library to make sure it does the right thing with
 * stereo input.
 */
TEST_F(Sonic2Test, TestStereoOriginalSonic) {
  constexpr float kSpeed = 3.0;
  constexpr int kSampleRate = 22050;
  constexpr int kNumChannels = 2;

  Initialize(kSampleRate, kNumChannels);
  sonicIntSetSpeed(stream_, kSpeed);

  auto testStereo = CreateSinusoidTest(kSampleRate, kNumChannels, 1, 1.0);
  EXPECT_TRUE(sonicIntWriteShortToStream(stream_, &testStereo[0],
                                         testStereo.size()/kNumChannels));

  constexpr int kBufferSize = 1024;
  int16_t buffer[kBufferSize * kNumChannels];
  std::vector<int16_t> compressed;
  int samplesRead = 0;
  do {
    samplesRead = sonicIntReadShortFromStream(stream_, buffer, kBufferSize);
    for (int i = 0; i < samplesRead*kNumChannels; i++) {
      compressed.push_back(buffer[i]);
    }
    sonicIntFlushStream(stream_);
  } while (samplesRead > 0);
  EXPECT_NEAR(compressed.size(), testStereo.size()/kSpeed,
              testStereo.size()/kSpeed*.01);
}

/* Test the new sonic2 library to make sure it does the right thing with stereo
 * signals.
 */
TEST_F(Sonic2Test, TestStereoSinusoid) {
  constexpr float kSpeed = 3.0;
  constexpr int kSampleRate = 22050;
  // Not zero, to force the full speedy computation and all the buffering (but
  // still basically linear speedup.)
  constexpr float kMinimalNonlinear = 1e-5;

  int channelCount = 1;
  auto testMono = CreateSinusoidTest(kSampleRate, channelCount, 1, 1.0);
  EXPECT_EQ(testMono.size(), kSampleRate);
  Initialize(kSampleRate, channelCount);
  auto compressedMono = TimeCompressVector(stream_, testMono, kSpeed,
                                           kMinimalNonlinear);
  Reset();
  SaveWaveform(compressedMono, "/tmp/sounds/compressedMono.wav",
               kSampleRate, channelCount);
  EXPECT_NEAR(compressedMono.size(), testMono.size()/kSpeed,
              compressedMono.size()*.01);

  // Skip the last few buffers because the amplitude goes down due to this SOLA.
  float compressed_teager_mean, compressed_teager_variance;
  TeagerVariance(&compressedMono[0], compressedMono.size()-300,
                 &compressed_teager_mean, &compressed_teager_variance);

  // Now test the same things with stereo sinusoids. Diotic first.
  channelCount = 2;
  auto testStereo = CreateSinusoidTest(kSampleRate, channelCount, 1, 1.0);
  SaveWaveform(testStereo, "/tmp/sounds/originalStereo.wav",
               kSampleRate, channelCount);
  EXPECT_EQ(testStereo.size(), kSampleRate*channelCount);
  Reset();
  Initialize(kSampleRate, channelCount);
  auto compressedStereo = TimeCompressVector(stream_, testStereo,
                                             kSpeed, kMinimalNonlinear);
  Reset();
  SaveWaveform(compressedStereo, "/tmp/sounds/compressedStereo.wav",
               kSampleRate, channelCount);
  EXPECT_NEAR(compressedStereo.size(), testStereo.size()/kSpeed,
              testStereo.size()*.01);

  // Now check to see that the left channel is coherent.
  std::vector<int16_t> leftChannel;
  ExtractChannel(compressedStereo, &leftChannel, 0, channelCount);
  SaveWaveform(leftChannel, "/tmp/sounds/compressedLeftChannel.wav",
               kSampleRate, 1);
  EXPECT_NEAR(leftChannel.size(), testStereo.size()/kSpeed/channelCount,
             testStereo.size()*.01);
  float left_teager_mean, left_teager_variance;
  TeagerVariance(&leftChannel[0], leftChannel.size()-300,
                 &left_teager_mean, &left_teager_variance);
  EXPECT_NEAR(compressed_teager_mean, left_teager_mean,
              compressed_teager_mean*0.01);
  EXPECT_NEAR(compressed_teager_variance, left_teager_variance,
              compressed_teager_variance*0.01);

  // Now check to see that the right channel is coherent.
  std::vector<int16_t> rightChannel;
  ExtractChannel(compressedStereo, &rightChannel, 1, channelCount);
  float right_teager_mean, right_teager_variance;
  ASSERT_GT(rightChannel.size(), 0);
  TeagerVariance(&rightChannel[0], rightChannel.size()-300,
                 &right_teager_mean, &right_teager_variance);
  EXPECT_NEAR(compressed_teager_mean, right_teager_mean,
              compressed_teager_mean*0.01);
  EXPECT_NEAR(compressed_teager_variance, right_teager_variance,
              compressed_teager_variance*0.01);
  EXPECT_NEAR(left_teager_variance, right_teager_variance,
              left_teager_variance*.0001);

  // Now test the same things with stereo sinusoids. Left only has sound.
  channelCount = 2;
  auto testDichotic = CreateSinusoidTest(kSampleRate, channelCount, 0, 1.0);
  SaveWaveform(testDichotic, "/tmp/sounds/originalDichotic.wav",
               kSampleRate, channelCount);
  EXPECT_EQ(testDichotic.size(), kSampleRate*channelCount);
  Initialize(kSampleRate, channelCount);
  auto compressedDichotic = TimeCompressVector(stream_, testDichotic,
                                               kSpeed, kMinimalNonlinear);
  SaveWaveform(compressedDichotic, "/tmp/sounds/compressedDichotic.wav",
               kSampleRate, channelCount);
  EXPECT_NEAR(compressedDichotic.size(), testDichotic.size()/kSpeed,
              testDichotic.size()*.01);

  // Now check to see that the left channel is coherent.
  std::vector<int16_t> leftDichotic;
  ExtractChannel(compressedDichotic, &leftDichotic, 0, channelCount);
  ASSERT_GT(leftDichotic.size(), 0);
  TeagerVariance(&leftDichotic[0], leftDichotic.size()-300,
                 &left_teager_mean, &left_teager_variance);
  EXPECT_NEAR(compressed_teager_mean, left_teager_mean,
              compressed_teager_mean*0.01);
  EXPECT_NEAR(compressed_teager_variance, left_teager_variance,
              compressed_teager_variance*0.01);

  // Now check to see that the right channel is coherent.
  std::vector<int16_t> rightDichotic;
  ExtractChannel(compressedDichotic, &rightDichotic, 1, channelCount);
  ASSERT_GT(rightDichotic.size(), 0);
  TeagerVariance(&rightDichotic[0], rightDichotic.size()-300,
                 &right_teager_mean, &right_teager_variance);
  EXPECT_EQ(right_teager_mean, 0.0);
  EXPECT_EQ(right_teager_variance, 0.0);
  EXPECT_GT(left_teager_variance, right_teager_variance);
}


/* Test sonic2 library to make sure that we get the same results with mono
 * and stereo input.  Convert a mono sample to stereo (left channel and right
 * channel are scaled by 0.9 and 1.1, respectively), and then use speedy to
 * compress both.
 */

TEST_F(Sonic2Test, TestStereoTapestry) {
  const float kSpeed = 3.0;

  std::string testDirName = "test_data/";
  std::string inputFileName =  testDirName + "tapestry.wav";
  int channelCount, sampleRate;
  auto original_samples = ReadWaveFile(inputFileName,
                                       &sampleRate, &channelCount);
  ASSERT_EQ(sampleRate, 16000);
  ASSERT_EQ(channelCount, 1);

  // First compress the original monaural test signal.
  Initialize(sampleRate, channelCount);
  // Time compress the monaural speech sample.
  constexpr float kNonlinear = 1;
  auto mono_result = TimeCompressVector(stream_, original_samples, kSpeed,
                                        kNonlinear);
  auto mono_tension_data = savedTensionVector;
  auto features_tension_data = savedTensionFromFeaturesVector;
  ASSERT_EQ(mono_tension_data.size(), features_tension_data.size());
  Reset();
  auto wave_fp = openOutputWaveFile("/tmp/sounds/monoTapestry.wav",
                                    sampleRate, channelCount);
  if (wave_fp) {
    writeToWaveFile(wave_fp, &mono_result[0], mono_result.size());
    closeWaveFile(wave_fp);
  }

  // Convert the monaural sample to stereo, first channel has slightly lower
  // gain than the right, but the average is the same as before.
  std::vector<int16_t> stereo_samples;
  for (uint32_t i = 0; i < original_samples.size(); ++i) {
    int16_t sample = original_samples[i];
    stereo_samples.push_back(sample - 50);    // Arbitrary shift to make sure
    stereo_samples.push_back(sample + 50);    //  channels are averaged.
  }

  // Now do the same test using the stereo signal.
  channelCount = 2;
  Initialize(sampleRate, channelCount);
  savedTensionVector.clear();
  auto stereo_result = TimeCompressVector(stream_, stereo_samples, kSpeed,
                                          kNonlinear);
  auto stereo_tension_data = savedTensionVector;
  Reset();
  wave_fp = openOutputWaveFile("/tmp/sounds/stereoTapestry.wav",
                               sampleRate, channelCount);
  if (wave_fp) {
    writeToWaveFile(wave_fp, &stereo_result[0],
                    stereo_result.size()/channelCount);
    closeWaveFile(wave_fp);
  }

  std::cout << "TestStereoTapestry got " << mono_result.size() <<
      " mono values, and " << stereo_result.size() << " stereo values.\n";
  ASSERT_EQ(2*mono_result.size(), stereo_result.size());

  // Check to see if the tension calculations are the same for monaural and
  // stereo input.
  ASSERT_GT(mono_tension_data.size(), 0);
  ASSERT_EQ(mono_tension_data.size(), stereo_tension_data.size());
  for (int i = 0; i < mono_tension_data.size(); i++) {
    ASSERT_NEAR(mono_tension_data[i], stereo_tension_data[i],
                fabs(mono_tension_data[i])*.00001) << "Sample #" << i;
    ASSERT_EQ(mono_tension_data[i], features_tension_data[i]);
  }

  // Check to see if the size and data are consistent between the monaural and
  // the stereo results.
  ASSERT_EQ(mono_result.size(), stereo_result.size()/channelCount);
  for (uint32_t t = 0; t < stereo_result.size() / channelCount; ++t) {
    int sample = (stereo_result[channelCount*t] +
                  stereo_result[channelCount*t+1])/channelCount;
    ASSERT_NEAR(mono_result[t], sample, 1) << "Sample # " << t;
  }
}


// Now test Sonic2 with changing speeds.  Make sure the expected output length
// matches the expected within a small number of pitch periods.  The expected
// length is the sum of the current input_buffer size divided by the current
// speed. The structure below defines the two speeds that we alternate between
// for each buffer.
struct SpeedSpec {
  float speed1;
  float speed2;
};

class Sonic2ParameterizedTest:
    public Sonic2Test,
    public testing::WithParamInterface<SpeedSpec> {
};

TEST_P(Sonic2ParameterizedTest, TestWithVaryingSpeed) {
  constexpr int kNumChannels = 1;
  constexpr int matchingChannels = 1;
  constexpr int kSampleRate = 22050;
  // Not zero, to force the full speedy computation (but still basically linear
  // speedup.)
  auto sinusoid = CreateSinusoidTest(kSampleRate, kNumChannels,
                                     matchingChannels, 10.0);
  constexpr uint64_t kBufferSize = 128;
  float speed1 = GetParam().speed1;
  float speed2 = GetParam().speed2;
  LOG(INFO) << "Testing with speed1 = " << std::to_string(speed1)
            << ", speed2 = " << std::to_string(speed2);
  int32_t samplesRead;
  int16_t* outputBuffer = new int16_t[kBufferSize * kNumChannels];
  std::vector<int16_t> outputVector;

  Initialize(kSampleRate, kNumChannels);
  sonicEnableNonlinearSpeedup(stream_, 0);

  int num_time_steps = sinusoid.size()/kNumChannels;
  float expected_length = 0;
  int frame_count = 0;  // To keep track of speed (every other frame).
  for (uint32_t t = 0; t < num_time_steps; t += kBufferSize) {
    int16_t* inputPointer = &sinusoid[0] + kNumChannels * t;
    int64_t inputCount = fmin(kBufferSize, num_time_steps - t);
    float speed;
    if (frame_count++ % 2){
      speed = speed1;
    } else {
      speed = speed2;
    }
    sonicSetSpeed(stream_, speed);
    EXPECT_TRUE(sonicWriteShortToStream(stream_, inputPointer, inputCount));
    expected_length += inputCount/speed;
    samplesRead = sonicReadShortFromStream(stream_, outputBuffer, kBufferSize);
    for (uint32_t i = 0; i < samplesRead * kNumChannels; ++i) {
      outputVector.push_back(outputBuffer[i]);
    }
  }
  // Flush the processing streams and collect the rest of the samples.
  EXPECT_TRUE(sonicFlushStream(stream_));
  do {
    samplesRead = sonicReadShortFromStream(stream_, outputBuffer, kBufferSize);
    for (uint32_t i = 0; i < samplesRead * kNumChannels; ++i) {
      outputVector.push_back(outputBuffer[i]);
    }
  } while (samplesRead > 0);

  // Make sure we get the right length, within a small # of pitch periods.
  float samples_per_period = kSampleRate/kPitch;
  float output_period_count = outputVector.size()/samples_per_period;
  float expected_period_count = expected_length/samples_per_period;

  // TODO(malcolmslaney, waywardgeek) Fix code so that this test passses with
  // reasonable tolerance.
  ASSERT_NEAR(output_period_count, expected_period_count, 6);
  // ASSERT_NEAR(output_period_count, expected_period_count, 200000);

  delete[] outputBuffer;
}
// TODO(malcolmslaney, waywardgeek) Fix code so that all theses tests pass.

// Create separate list of test values so as to not confused the preprocessor.
auto test_values = testing::Values(SpeedSpec{1.0, 1.0},  // Test 0 - Passes
                                   SpeedSpec{1.5, 1.5},  // Test 1 - Passes
                                   SpeedSpec{2.5, 2.5},  // Test 2 - Passes
                                   SpeedSpec{3.0, 3.0},  // Test 3 - Passes
                                   SpeedSpec{1.25, 1.75},  // Test 4 - Fails
                                   SpeedSpec{2.25, 3.5},   // Test 5 - Fails
                                   SpeedSpec{1.5, 3.0},    // Test 6 - Fails
                                   SpeedSpec{0.75, 0.75},  // Test 7 - Passes
                                   SpeedSpec{0.75, 1.5},   // Test 8 - Passes?!?
                                   SpeedSpec{0.75, 3.0}    // Test 9 - Fails
                                   );

INSTANTIATE_TEST_SUITE_P(TestSuiteWithVaryingSpeed,
                         Sonic2ParameterizedTest,
                         test_values);

}  // namespace


int main(int argc, char **argv) {
  testing::InitGoogleTest(&argc, argv);

  return RUN_ALL_TESTS();
}