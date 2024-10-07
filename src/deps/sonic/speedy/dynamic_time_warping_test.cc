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

#include "dynamic_time_warping.h"


#include <cmath>
#include <vector>
#include "gtest/gtest.h"  // Needed for external testing

namespace {
// Computes the Euclidean distance between two points.
float distance(const std::vector<float>& sequence1,
               const std::vector<float>& sequence2) {
  EXPECT_EQ(sequence1.size(), 1);
  EXPECT_EQ(sequence2.size(), 1);
  return std::fabs(sequence1[0] - sequence2[0]);
}
TEST(DynamicTimeWarpingTest, IdenticalSequences) {
  const std::vector<std::vector<float>> sequence1 = {
      {0.f}, {1.f}, {2.f}, {3.f}, {4.f}};
  const DynamicTimeWarping dtw(1, distance);
  const float cost = dtw.Compute(sequence1, sequence1);
  // Optimal path is following the main diagonal of the cost matrix.
  const float expected_cost = 0.f;
  EXPECT_FLOAT_EQ(expected_cost, cost);
  std::vector<int> path1;
  std::vector<int> path2;
  dtw.DisplayDebugInformation(sequence1, sequence1);
  dtw.BestPathSequence(sequence1, sequence1, &path1, &path2);
  EXPECT_EQ(path1, path2);
}
TEST(DynamicTimeWarpingTest, ShiftedSequences) {
  const std::vector<std::vector<float>> sequence1 = {
      {0.f}, {1.f}, {2.f}, {3.f}, {4.f}};
  const std::vector<std::vector<float>> sequence2 = {
      {-2.f}, {-1.f}, {0.f}, {1.f}, {2.f}};
  const DynamicTimeWarping dtw(1, distance);
  const float cost = dtw.Compute(sequence1, sequence2);
  // Optimal path is following a shifted diagonal of the cost matrix.
  const float expected_cost = 6.f;
  EXPECT_FLOAT_EQ(expected_cost, cost);
  std::vector<int> path1;
  std::vector<int> path2;
  dtw.DisplayDebugInformation(sequence1, sequence2);
  dtw.BestPathSequence(sequence1, sequence2, &path1, &path2);
  const std::vector<int> expected1 = {0, 0, 0, 1, 2, 3, 4};
  const std::vector<int> expected2 = {0, 1, 2, 3, 4, 4, 4};
  EXPECT_EQ(path1, expected1);
  EXPECT_EQ(path2, expected2);
}
TEST(DynamicTimeWarpingTest, DownsampledSequence) {
  const std::vector<std::vector<float>> sequence1 = {
      {0.f}, {1.f}, {2.f}, {3.f}, {4.f}};
  const std::vector<std::vector<float>> sequence2 = {{0.f}, {2.f}, {4.f}};
  const DynamicTimeWarping dtw(1, distance);
  const float cost = dtw.Compute(sequence1, sequence2);
  // Optimal path is following diagonals by block of the cost matrix.
  const float expected_cost = 2.f;
  EXPECT_FLOAT_EQ(expected_cost, cost);
  std::vector<int> path1;
  std::vector<int> path2;
  dtw.DisplayDebugInformation(sequence1, sequence2);
  dtw.BestPathSequence(sequence1, sequence2, &path1, &path2);
  const std::vector<int> expected1 = {0, 1, 2, 3, 4};
  const std::vector<int> expected2 = {0, 0, 1, 1, 2};
  EXPECT_EQ(path1, expected1);
  EXPECT_EQ(path2, expected2);
}
}  // namespace


int main(int argc, char **argv) {
  testing::InitGoogleTest(&argc, argv);

  return RUN_ALL_TESTS();
}