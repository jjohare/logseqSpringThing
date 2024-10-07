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

#ifndef THIRD_PARTY_SPEEDY_DYNAMIC_TIME_WARPING_H_
#define THIRD_PARTY_SPEEDY_DYNAMIC_TIME_WARPING_H_


#include <cstddef>
#include <functional>
#include <vector>

// #include "third_party/absl/synchronization/mutex.h"

// A class that implements dynamic time warping for n-dimensional time series
// comparison.
// This class is thread-safe.
class DynamicTimeWarping {
 public:
  // This algorithm aims at comparing two time series / sequences.
  // For this purpose, there is a need of a local distance between those
  // sequences. This implementation solely relies on distances between
  // individual points of the sequences.
  //
  // Consecutively, we can compare two sequences u and v by comparing their
  // local distance for selected sequences of indices [m_k]_{k} and [n_k]_{k}.
  // The dynamic time warping distance of the optimal mapping is then defined
  // by:
  //  C(u, v) = \sum d(u_{m_k}, v_{n_k}),
  // where d() is the distance used to compare individual points of the
  // sequences.
  //
  // A list of pair of indices [(m_k, n_k)]_{k} of length L defines a warping
  // path for the sequences u and v. Assuming, that u is of length M and v of
  // length N, we enforce the following constraints:
  //  1. For any 0 <= k <= L-1, 0 <= m_k <= M-1 and 0 <= n_k <= N-1.
  //  2. The warping path has endpoints (m_{0}, n_{0}) = (0, 0) and
  //     (m_{L-1}, n_{L-1}) = (M-1, N-1)
  //  3. The sequences [m_k]_{k} and [n_k]_{k} are monotically increasing.
  //  4. Connectivity: For any k, (m_{k} - m_{k-1}, n_{k} - n_{k-1}) belongs to
  //     {(1, 0), (0, 1), (1, 1)}.
  //
  // The arguments of the constructor are:
  // `dimension`: The dimensionality of the time series to compare.
  // `distance`: The distance measure to use to compare points of time series.
  DynamicTimeWarping(
      std::size_t dimension,
      std::function<float(const std::vector<float>&, const std::vector<float>&)>
          distance);

  // Applies the dynamic time warping algorithm to two sequences and returns the
  // optimal cost.
  //
  // The two input sequences `sequence1` and `sequence2` are represented as
  // vectors (of possibly different length) of points of dimensionality
  // `dimension`.
  // Dies with a fatal error if any point is not of dimensionality `dimension`.
  float Compute(const std::vector<std::vector<float>>& sequence1,
                const std::vector<std::vector<float>>& sequence2) const;
      // ABSL_LOCKS_EXCLUDED(mutex_);

  // Returns the best path found via dynamic-time warping. Must first call the
  // function Compute() before calling this function, with the original
  // sequences used for Compute. The best matching path is returned in the two
  // path arguments that are passed by pointer (so they can be modified). The
  // new path information is appended to the current value, so it's best if
  // these are empty vectors to start.
  void BestPathSequence(const std::vector<std::vector<float>>& sequence1,
                        const std::vector<std::vector<float>>& sequence2,
                        std::vector<int>* path1, std::vector<int>* path2) const;

  // This function shows the internal state of the DTW code, and is useful for
  // verifying the expected test results.
  void DisplayDebugInformation(
      const std::vector<std::vector<float>>& sequence1,
      const std::vector<std::vector<float>>& sequence2) const;

 private:
  // Checks that the points of the sequences have all the same dimensionality
  // equal to `dimension`.
  // Dies with a fatal error if any point is not of dimensionality `dimension`.
  void CheckInput(const std::vector<std::vector<float>>& sequence1,
                  const std::vector<std::vector<float>>& sequence2) const;

  // Computes the cost matrix and stores it into the local (mutable) cache.
  void ComputeCostMatrix(
      const std::vector<std::vector<float>>& sequence1,
      const std::vector<std::vector<float>>& sequence2) const;
      // ABSL_EXCLUSIVE_LOCKS_REQUIRED(mutex_);

  // Computes the optimal cost from the current non-accumulumated cost matrix.
  float ComputeFromCostMatrix(int height, int width) const;
      // ABSL_EXCLUSIVE_LOCKS_REQUIRED(mutex_);

  // mutable absl::Mutex mutex_;
  const std::size_t dimension_;
  const std::function<float(const std::vector<float>&,
                            const std::vector<float>&)>
      distance_;
  // mutable std::vector<float> cost_matrix_ ABSL_GUARDED_BY(mutex_);
  // mutable std::vector<int> best_directions_ ABSL_GUARDED_BY(mutex_);
  mutable std::vector<float> cost_matrix_;
  mutable std::vector<int> best_directions_;

  // Distance helper function.  Returns an indication of which values is
  // smallest. -1 if a is smallest, 0 if the middle is smallest, +1 if c is
  // smallest.
  int ArgMin(float a, float b, float c) const;
};

#endif  // THIRD_PARTY_SPEEDY_DYNAMIC_TIME_WARPING_H_
