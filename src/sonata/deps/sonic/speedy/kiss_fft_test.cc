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
#include <cstddef>
#include <cstdio>
#include "gtest/gtest.h"  // Needed for external testing

extern "C" {
#include "kiss_fft.h"
}

namespace {

// See http://goto/gunitprimer for an introduction to gUnit.

class KissFftTest : public ::testing::Test {
 protected:
  // Remove all of the functions below that you do not need.
  // See http://goto/gunitfaq#CtorVsSetUp for when to use SetUp/TearDown.

  KissFftTest() {
  }

  ~KissFftTest() override {
  }

  void SetUp() override {
  }

  void TearDown() override {
  }

  // Objects declared here can be used by all TEST_Fs in the test case for
  // KissFft.
  // See http://goto/gunitprimer#Test_Fixtures_Using_the_Same_Dat for details.
};

TEST_F(KissFftTest, BasicTest) {
  constexpr int N = 8;
  constexpr float kTolerance = 1e-6;
  kiss_fft_cpx fin[N], fout[N];

  kiss_fft_cfg kiss_forward = kiss_fft_alloc(N, 0, NULL, NULL);
  for (int i=0; i < N; i++) {
    fin[i].r = cos(2*M_PI*i/static_cast<float>(N));
    fin[i].i = 0.0;
  }
  kiss_fft(kiss_forward, fin, fout);
  for (int i=0; i < N; i++) {
    printf("%d: %g, %g\n", i, fout[i].r, fout[i].i);
  }
  EXPECT_NEAR(fout[0].r, 0, kTolerance); EXPECT_NEAR(fout[0].i, 0, kTolerance);
  EXPECT_NEAR(fout[1].r, 4, kTolerance); EXPECT_NEAR(fout[1].i, 0, kTolerance);
  EXPECT_NEAR(fout[2].r, 0, kTolerance); EXPECT_NEAR(fout[2].i, 0, kTolerance);
  EXPECT_NEAR(fout[3].r, 0, kTolerance); EXPECT_NEAR(fout[3].i, 0, kTolerance);
  EXPECT_NEAR(fout[4].r, 0, kTolerance); EXPECT_NEAR(fout[4].i, 0, kTolerance);
  EXPECT_NEAR(fout[5].r, 0, kTolerance); EXPECT_NEAR(fout[5].i, 0, kTolerance);
  EXPECT_NEAR(fout[6].r, 0, kTolerance); EXPECT_NEAR(fout[6].i, 0, kTolerance);
  EXPECT_NEAR(fout[7].r, 4, kTolerance); EXPECT_NEAR(fout[7].i, 0, kTolerance);

  kiss_fft_cfg kiss_backward = kiss_fft_alloc(N, 1, NULL, NULL);
  kiss_fft(kiss_backward, fout, fin);

  for (int i=0; i < N; i++) {
    float expected = N*cos(2*M_PI*i/static_cast<float>(N));
    EXPECT_NEAR(fin[i].r, expected, kTolerance);
    EXPECT_NEAR(fin[i].i, 0, kTolerance);
  }

  kiss_fft_cleanup();
  kiss_fft_free(kiss_forward);
  kiss_fft_free(kiss_backward);
}

}  // namespace

int main(int argc, char **argv) {
  testing::InitGoogleTest(&argc, argv);

  return RUN_ALL_TESTS();
}
