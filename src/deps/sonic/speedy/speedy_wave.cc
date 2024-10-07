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
#include <getopt.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#include <utility>
#include <iostream>
#include <vector>
#include "sonic.h"

extern "C" {
#include "wave.h"
#include "sonic2.h"
#include "speedy.h"
}

double speed = 3.0;
double duration_feedback_strength = 0.0;
double nonlinear = 1.0;
double normalization_time = 0.0;   /* Seconds, 0 turns it off. */
double desired_length = 0.0;
int match_nonlinear = false;

/*
 * A simple application that time-compresses one speech file.
 */

/* To test, try these commands from a CITC client.
   cd third_party/speedy
   # Linear speedup by 3x
   ../../blaze-bin/speedy_wave  \
     --input test_data/tapestry.wav \
     --nonlinear 0.0 --speed 3 --output /tmp/tap_linear.wav
   # Non-linear speedup (speedy) by a nominal 3x.
   ../../blaze-bin/speedy_wave \
     --input test_data/tapestry.wav \
     --tension_file /tmp/nl_tension.txt --speed_file /tmp/nl_speed.txt \
     --speed 3 --output /tmp/tap_nonlinear.wav
   # Non-linear speedup (speedy) by a normalized 3x.
   ../../blaze-bin/speedy_wave \
     --input test_data/tapestry.wav --normalization_time 0.01 \
     --tension_file /tmp/nln_tension.txt --speed_file /tmp/nln_speed.txt \
     --speed 3 --output /tmp/tap_nonlinear_normed.wav
   # Linear speedup matched to a 3x non-linear total time
   ../../blaze-bin/speedy_wave \
     --input test_data/tapestry.wav \
     --nonlinear 0.0 --speed 3 --match_nonlinear --output /tmp/tap_matched.wav
   # To see the computed tension and the resulting speedup, add these arguments
     --tension_file /tmp/tension.txt --speed_file /tmp/speed.txt
*/


/* Save the tension calculated by the libsonic2 (speedy) calculation.
 */
FILE* tension_fp;
void tensionSaver(sonicStream myStream, int time, float tension) {
  if (tension_fp) {
    fprintf(tension_fp, "%g\n", tension);
  }
}

/* Save the speedup request by the libsonic2 (speedy) calculation.  This number
 * is passed to libsonic, which will do its best to achieve this speedup.
 */
FILE* speed_fp;
void speedSaver(sonicStream myStream, int time, float speed) {
  if (speed_fp) {
    fprintf(speed_fp, "%g\n", speed);
  }
}

/* Save the features calculated by the libsonic2 (speedy) calculation.
 */
FILE* features_fp;
void featuresSaver(sonicStream myStream, int time, float *features) {
  if (features_fp) {
    for (int i=0; i < 15; i++) {
      fprintf(features_fp, "%g ", features[i]);
    }
    fprintf(features_fp, "\n");
  }
}

/* Save the spectrogram calculated by the libsonic2 (speedy) calculation.
 */
FILE* spectrogram_fp;
void spectrogramSaver(sonicStream myStream, int time, float *spectrogram) {
  if (spectrogram_fp) {
    int size = sonicSpectrogramSize(myStream);
    for (int i=0; i < size; i++) {
      fprintf(spectrogram_fp, "%g ", spectrogram[i]);
    }
    fprintf(spectrogram_fp, "\n");
  }
}

FILE* normalized_spectrogram_fp;
void normalizedSpectrogramSaver(sonicStream myStream, int time,
                                float *spectrogram) {
  if (normalized_spectrogram_fp) {
    int size = sonicSpectrogramSize(myStream);
    for (int i=0; i < size; i++) {
      fprintf(normalized_spectrogram_fp, "%g ", spectrogram[i]);
    }
    fprintf(normalized_spectrogram_fp, "\n");
  }
}



/*
 * Compress a sound and return the actual compression length.
 *
 * Read a sound file and compress it with the speedy and non-linear properties
 * that are indicated. If an output file is specified, then also write the
 * output in wave format to the output file.
 *
 * Args:
 *   input_file: file from which to read input waveform data (.wav format)
 *   speed: desired speedup factor (generally greater than 1.0)
 *   nonlinear: whether non-linear speedup should be done. Set to 0 for linear,
 *     and set to 1.0 for normal non-linear (speedy) speedup.  Other values
 *     should be proportional speedups, but haven't been tested.
 *   normalization_time: Over what time period (in seconds) should the average
 *     speedup be equal to the specified time argument.  Zero means no
 *     averaging.  Otherwise, the proferred speed after running the non-linear
 *     speedup algorithm is modified to keep the average as specified.
 *   duration_feedback_strength: How fast to close the duration loop.  Zero
 *     means run open loop, as was the original default.  Vaues > 0 indicate how
 *     much of the excess duration to use to increase the overall speed. About
 *     0.1 converges after a few seconds.
 *   output_file: wave file to store the output waveform.  Don't store if the
 *     output_file string is empty.
 *
 * Returns:
 *   Actual achieved speedup.  (Returning this is useful so that you can match
 *   the actual non-linear speedup when compressing with linear speedup.)
 */
double compress_sound(const std::string& input_file_name, double speed,
                      double nonlinear, double duration_feedback_strength,
                      const std::string &output_file_name) {
  int sampleRate, numChannels, totalFramesReadFromWave = 0;
  int totalFramesProducedBySpeedy = 0;
  const int maxSamples = 1000;

  waveFile waveOutputFp = NULL;
  waveFile waveInputFp = openInputWaveFile(input_file_name.c_str(),
                                           &sampleRate, &numChannels);
  if (!waveInputFp) {
    std::cerr << "Can't open " << input_file_name << " for speedy input." <<
        std::endl;
    exit(-1);
  }
  printf("Read %d channel data at a sample rate of %d.\n",
         numChannels, sampleRate);
  int16_t* inputBuffer = new int16_t[numChannels*maxSamples];
  int16_t* outputBuffer = new int16_t[numChannels*maxSamples];

  sonicStream mySonicStream = sonicCreateStream(sampleRate, numChannels);
  sonicSetSpeed(mySonicStream, speed);

  sonicEnableNonlinearSpeedup(mySonicStream, nonlinear > 0.0);
  sonicSetDurationFeedbackStrength(mySonicStream, duration_feedback_strength);
  if (nonlinear > 0.0 && !output_file_name.empty()) {
    // If we are generating non-linear output, output the debug data if wanted.
    sonicTensionCallback(mySonicStream, tensionSaver);
    sonicSpeedCallback(mySonicStream, speedSaver);
    sonicFeaturesCallback(mySonicStream, featuresSaver);
    sonicSpectrogramCallback(mySonicStream, spectrogramSaver);
    sonicNormalizedSpectrogramCallback(mySonicStream,
                                       normalizedSpectrogramSaver);
  }

  if (!output_file_name.empty()) {
    waveOutputFp = openOutputWaveFile(output_file_name.c_str(),
                                      sampleRate, numChannels);
    if (!waveOutputFp) {
      std::cerr << "Can't open " << output_file_name << " for speedy output." <<
          std::endl;
      exit(-1);
    }
  }
  int soundFramesFromWave;
  while (1) {
    /* numSamples and maxSamples are the number of **multi-channel** samples */
    soundFramesFromWave = readFromWaveFile(waveInputFp, inputBuffer,
                                           maxSamples);
    if (soundFramesFromWave == 0) break;
    totalFramesReadFromWave += soundFramesFromWave;
    int samples_written = sonicWriteShortToStream(mySonicStream, inputBuffer,
                                                  soundFramesFromWave);
    if (samples_written <= 0) {
      std::cerr << "Tried writing " << soundFramesFromWave << "samples to " <<
          "sonicWrite and failed." << std::endl;
      exit(-1);
    }
    /* Check to see if there is anything ready to be read (i.e. processed.) */
    int soundSamplesFromSpeedy = sonicReadShortFromStream(mySonicStream,
                                                          outputBuffer,
                                                          maxSamples);
    totalFramesProducedBySpeedy += soundSamplesFromSpeedy;
    if (waveOutputFp) {
      writeToWaveFile(waveOutputFp, outputBuffer, soundSamplesFromSpeedy);
    }
  }
  closeWaveFile(waveInputFp);

  sonicFlushStream(mySonicStream);
  do {
    soundFramesFromWave = sonicReadShortFromStream(mySonicStream, outputBuffer,
                                                maxSamples);
    totalFramesProducedBySpeedy += soundFramesFromWave;
    if (waveOutputFp) {
      writeToWaveFile(waveOutputFp, outputBuffer, soundFramesFromWave);
    }
  } while (soundFramesFromWave > 0);
  if (waveOutputFp) {
    closeWaveFile(waveOutputFp);
  }
  delete[] outputBuffer;
  /* Return the actual speedup */
  printf("Compress_sound read %d frames, and output %d frames with "
         "nonlinear=%g.\n",
         totalFramesReadFromWave, totalFramesProducedBySpeedy, nonlinear);
  return static_cast<double>(totalFramesReadFromWave) /
                             totalFramesProducedBySpeedy;
}

int main(int argc, char** argv) {
  std::string input_file_name;
  std::string output_file_name;
  static const char* usage = "Usage: %s [--speed 3.0]\n"
                "\t[--nonlinear 1.0] [--match_nonlinear]\n"
                "\t[--tension_file filename] [--speed_file filename]\n"
                "\t--input sound.wav --output fastsound.wav\n"
                "\t [set nonlinear to 0.0 to get a linear speedup.]\n";

  if (argc <= 1) {
    fprintf(stderr, usage, argv[0]);
    exit(-1);
  }
  while (1) {
    static struct option long_options[] =
      {
        /* These options set a flag. */
        {"match_nonlinear", no_argument, &match_nonlinear, 1},
        {"linear",        no_argument, NULL, 'l'},    /* Default is nonlinear */
        /* The remaining options have a value and don’t set a flag.
           We distinguish them by their values (last field). */
        {"input",         required_argument, NULL, 'i'},
        {"output",        required_argument, NULL, 'o'},
        {"speed",         optional_argument, NULL, 's'},
        {"nonlinear",     optional_argument, NULL, 'n'},    /* How nonlinear? */
        {"length",        required_argument, NULL, 'e'},    /* total seconds */
        {"tension_file",  optional_argument, NULL, 't'},
        {"speed_file",    optional_argument, NULL, 'p'},
        {"features_file", optional_argument, NULL, 'f'},
        {"spectrogram_file", optional_argument, NULL, 'S'},
        {"duration_feedback_strength", optional_argument, NULL, 'd'},
        {"normalized_spectrogram_file", optional_argument, NULL, 'N'},
        {0, 0, 0, 0}
      };
    /* getopt_long stores the option index here. */
    int option_index = 0;

    int c = getopt_long(argc, argv, "mi:o:s:n:",
                        long_options, &option_index);

    /* Detect the end of the options. */
    if (c == -1)
      break;
    switch (c) {
    case 0:
        break;        /* Handled as a flag, nothing to do here. */

    case 'i':         /* Input file name */
        if (optarg) {
          input_file_name = optarg;
        } else {
          input_file_name = argv[optind];
        }
        break;

    case 'o':         /* Output file name */
        if (optarg) {
          output_file_name = optarg;
        } else {
          output_file_name = argv[optind];
        }
        break;

    case 's':         /* Desired speedup ratio */
        assert(optarg || argv[optind]);
        if (optarg) {
          speed = strtod(optarg, NULL);
        } else {
          speed = strtod(argv[optind], NULL);
        }
        assert(speed > 0.0);
        break;

    case 'd':         /* Duratiom feedback strength */
        assert(optarg || argv[optind]);
        if (optarg) {
          duration_feedback_strength = strtod(optarg, NULL);
        } else {
          duration_feedback_strength = strtod(argv[optind], NULL);
        }
        assert(duration_feedback_strength >= 0.0);
        break;

    case 'e':         /* Desired length of output */
        assert(optarg || argv[optind]);
        if (optarg) {
          desired_length = strtod(optarg, NULL);
        } else {
          desired_length = strtod(argv[optind], NULL);
        }
        assert(desired_length > 0.0);
        break;

    case 'l':         /* Flag turning on linear speedup */
        nonlinear = 0.0;
        break;

    case 'n':         /* Turn on non-linear speedup by this factor. */
        assert(optarg || argv[optind]);
        if (optarg) {
          nonlinear = strtod(optarg, NULL);
        } else {
          nonlinear = strtod(argv[optind], NULL);
        }
        /* Normally either 0 or 1 */
        assert(nonlinear >= 0.0 && nonlinear <= 2.0);
        break;

    case 't':         /* Tension debug file name */
        assert(optarg || argv[optind]);
        if (optarg) {
          tension_fp = fopen(optarg, "w");
        } else {
          tension_fp = fopen(argv[optind], "w");
        }
        assert(tension_fp);
        break;

    case 'p':         /* Speed debug file name */
        assert(optarg || argv[optind]);
        if (optarg) {
          speed_fp = fopen(optarg, "w");
        } else {
          speed_fp = fopen(argv[optind], "w");
        }
        assert(speed_fp);
        break;

    case 'f':         /* Features debug file name */
        assert(optarg || argv[optind]);
        if (optarg) {
          features_fp = fopen(optarg, "w");
        } else {
          features_fp = fopen(argv[optind], "w");
        }
        assert(features_fp);
        break;

    case 'S':          /* Spectrogram debug file name */
        assert(optarg || argv[optind]);
        if (optarg) {
          spectrogram_fp = fopen(optarg, "w");
        } else {
          spectrogram_fp = fopen(argv[optind], "w");
        }
        assert(spectrogram_fp);
        break;

    case 'N':           /* Normalized spectrogram debug file name */
        assert(optarg || argv[optind]);
        if (optarg) {
          normalized_spectrogram_fp = fopen(optarg, "w");
        } else {
          normalized_spectrogram_fp = fopen(argv[optind], "w");
        }
        assert(normalized_spectrogram_fp);
        assert(optarg || argv[optind]);
        if (optarg) {
          normalized_spectrogram_fp = fopen(optarg, "w");
        } else {
          normalized_spectrogram_fp = fopen(argv[optind], "w");
        }
        assert(normalized_spectrogram_fp);
        break;

    default:
        fprintf(stderr, "%s: Unknown command line option (%d).\n", argv[0], c);
        fprintf(stderr, usage, argv[0]);
        exit(1);
    }
  }
  if (output_file_name.length() <= 0) {
    printf("%s: Must specify an output file name.\n", argv[0]);
    exit(1);
  }
  if (input_file_name.length() <= 0) {
    printf("%s: Must specify an input file name.\n", argv[0]);
    exit(1);
  }

  if (match_nonlinear) {
    // Figure out what speed we get with non-linear speedup.
    speed = compress_sound(input_file_name, speed, 1.0,
                           duration_feedback_strength, "");
  } else if (desired_length > 0) {
    // Try to hit a desired length.  First compress it normally, and then
    // adjust the desired speed by scaling to get what we want.
    int sampleRate, numChannels;
    waveFile waveInputFp = openInputWaveFile(input_file_name.c_str(),
                                             &sampleRate, &numChannels);
    if (!waveInputFp) {
      std::cerr << "Can't open " << input_file_name << " for speedy input." <<
          std::endl;
      exit(-1);
    }

    int totalFramesReadFromWave = 0, framesRead;
    const int maxSamples = 1000;
    int16_t* inputBuffer = new int16_t[numChannels*maxSamples];
    do {
      /* numSamples and maxSamples are the # of **multi-channel** samples */
      framesRead = readFromWaveFile(waveInputFp, inputBuffer,
                                    maxSamples);
      totalFramesReadFromWave += framesRead;
    } while (framesRead > 0);
    delete[] inputBuffer;
    auto input_length = totalFramesReadFromWave /
                        static_cast<float>(sampleRate);
    auto desired_speed = input_length / desired_length;
    printf("Read %d frames, and trying to speed up with a factor of %g.\n",
           totalFramesReadFromWave, desired_speed);
    auto new_speed = compress_sound(input_file_name, desired_speed, 1.0,
                                    duration_feedback_strength, "");
    speed = desired_speed * (desired_speed / new_speed);
    printf("First scaling by %g gave a speed of %g.\n", desired_speed,
           new_speed);
    printf("  New speed should be %g with a length of %d.\n", desired_speed,
           (int)(desired_length*sampleRate*2));
  }

  std::cout << "Reading sound from " << input_file_name <<
      " and speeding it up " <<
      (nonlinear > 0.0 ? "non-linearly" : "linearly") << " by " <<
      speed << "X into " << output_file_name << "." << std::endl;

  compress_sound(input_file_name, speed, nonlinear,
                 duration_feedback_strength, output_file_name);
}
