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

#include <algorithm>
#include <iomanip>
#include <iostream>
#include <utility>

#include "glog/logging.h"
#include <cassert>


DynamicTimeWarping::DynamicTimeWarping(
    std::size_t dimension,
    std::function<float(const std::vector<float>&, const std::vector<float>&)>
        distance)
    : dimension_(dimension), distance_(std::move(distance)) {}

float DynamicTimeWarping::Compute(
    const std::vector<std::vector<float>>& sequence1,
    const std::vector<std::vector<float>>& sequence2) const {
  CheckInput(sequence1, sequence2);

  // absl::MutexLock lock(&mutex_);
  ComputeCostMatrix(sequence1, sequence2);
  return ComputeFromCostMatrix(sequence1.size(), sequence2.size());
}

void DynamicTimeWarping::CheckInput(
    const std::vector<std::vector<float>>& sequence1,
    const std::vector<std::vector<float>>& sequence2) const {
  for (const auto& sequence : sequence1) {
    CHECK_EQ(sequence.size(), dimension_);
  }
  for (const auto& sequence : sequence2) {
    CHECK_EQ(sequence.size(), dimension_);
  }
}

void DynamicTimeWarping::ComputeCostMatrix(
    const std::vector<std::vector<float>>& sequence1,
    const std::vector<std::vector<float>>& sequence2) const {
  const auto height = sequence1.size();
  const auto width = sequence2.size();
  cost_matrix_.resize(height * width);

  for (int i = 0; i < height; ++i) {
    for (int j = 0; j < width; ++j) {
      cost_matrix_[i * width + j] = distance_(sequence1[i], sequence2[j]);
    }
  }
}

int DynamicTimeWarping::ArgMin(float a, float b, float c) const {
  /* Do the test this way, with strict inequality so that default path is along
   * the diagonal.
   */
  if (a < b && a < c) return -1;
  if (c < a && c < b) return 1;
  return 0;
}

float DynamicTimeWarping::ComputeFromCostMatrix(int height, int width) const {
  best_directions_.resize(height * width);
  for (int j = 1; j < width; ++j) {
    cost_matrix_[j] += cost_matrix_[j - 1];
    best_directions_[j] = 1;
  }
  for (int i = 1; i < height; ++i) {
    cost_matrix_[i * width] += cost_matrix_[(i - 1) * width];
    best_directions_[i * width] = -1;
  }
  for (int i = 1; i < height; ++i) {
    for (int j = 1; j < width; ++j) {
      cost_matrix_[i * width + j] +=
          std::min(std::min(cost_matrix_[(i - 1) * width + j],
                            cost_matrix_[i * width + j - 1]),
                   cost_matrix_[(i - 1) * width + j - 1]);
      best_directions_[i * width + j] =
          ArgMin(cost_matrix_[(i - 1) * width + j],
                 cost_matrix_[(i - 1) * width + j - 1],
                 cost_matrix_[i * width + j - 1]);
    }
  }

  return cost_matrix_.back();
}

void DynamicTimeWarping::BestPathSequence(
    const std::vector<std::vector<float>>& sequence1,
    const std::vector<std::vector<float>>& sequence2, std::vector<int>* path1,
    std::vector<int>* path2) const {
  CHECK_NE(nullptr, path1);
  CHECK_NE(nullptr, path2);
  const auto height = sequence1.size();
  const auto width = sequence2.size();

  // absl::MutexLock lock(&mutex_);
  for (int i = height - 1, j = width - 1; i >= 0 && j >= 0;) {
    switch (best_directions_[i * width + j]) {
      case -1:
        path1->push_back(i--);
        path2->push_back(j);
        break;
      case 0:
        path1->push_back(i--);
        path2->push_back(j--);
        break;
      case 1:
        path1->push_back(i);
        path2->push_back(j--);
        break;
      default:
        assert(false);
    }
  }
  std::reverse(std::begin(*path1), std::end(*path1));
  std::reverse(std::begin(*path2), std::end(*path2));
}

void DynamicTimeWarping::DisplayDebugInformation(
    const std::vector<std::vector<float>>& sequence1,
    const std::vector<std::vector<float>>& sequence2) const {
  const auto height = sequence1.size();
  const auto width = sequence2.size();
  // absl::MutexLock lock(&mutex_);
  std::cout << "Cost matrix:" << std::endl;
  for (int i = 0; i < height; ++i) {
    for (int j = 0; j < width; ++j) {
      std::cout << std::setw(3) << cost_matrix_[i * width + j] << " ";
    }
    std::cout << std::endl;
  }
  std::cout << "Directions matrix:" << std::endl;
  for (int i = 0; i < height; ++i) {
    for (int j = 0; j < width; ++j) {
      std::cout << std::setw(3) << best_directions_[i * width + j] << " ";
    }
    std::cout << std::endl;
  }
}
