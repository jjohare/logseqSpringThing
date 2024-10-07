use once_cell::sync::Lazy;
use std::{ collections::HashMap, f32::consts::PI};

static HANN_WINDOW_LOOKUP_TABLE: Lazy<HashMap<usize, Vec<f32>>> =
    Lazy::new(|| {
    // Defining an array of pre-computed window lengths
    const HANN_WINDOW_PRECOMPUTED_LENGTHS: [usize; 7] = [
        64, 128, 256, 512, 1024, 2048, 4096
    ];
    // Initialize an empty HashMap for the lookup table
    let mut table = HashMap::new();
    // Iterate over the pre-computed lengths and calculate the Hann windows
    for &length in &HANN_WINDOW_PRECOMPUTED_LENGTHS {
        let hann_window = calculate_hann_window(length);
        // Insert the computed Hann window into the lookup table with the corresponding length
        table.insert(length, hann_window);
    }
    // Return the populated lookup table
    table
});


/// Compute a Hann window of the given length.
///
/// This function takes an integer `window_length` representing the desired length of the Hann window,
/// and returns an `Vec<f32>` containing the Hann window values. If the `window_length` is less
/// than or equal to 1, or greater than the allowed maximum, an error is returned. If the `window_length`
/// is in the precomputed lookup table, the precomputed values are returned. Otherwise, the Hann window
/// values are computed using the formula `w(n) = 0.5 - 0.5 * cos(2π * n / (N - 1))`, where `n` is the
/// index of the current sample and `N` is the length of the window.
pub fn get_hann_window(window_length: usize) -> Vec<f32>{
  if window_length == 0  { panic!("Invalid window length: 0") }
  // Check if the window length is in the lookup table.
  if let Some(hann_window) = HANN_WINDOW_LOOKUP_TABLE.get(&window_length) {
    hann_window.clone()
  } else {
    // If the window length is not in the lookup table, compute the Hann window values.
    calculate_hann_window(window_length)
  }
}

/// Computes a Hann window of length `window_length`.
///
/// A Hann window is a function that smoothly tapers the edges of a signal window to reduce spectral leakage.
/// This function computes the Hann window values for a given window length and returns them as a vector.
/// https://en.wikipedia.org/wiki/Window_function#Hann_and_Hamming_windows
/// Formula used: w(n) = 0.5 - 0.5 * cos(2π * n / (N - 1))
///
/// # Arguments
/// `window_length` The length of the Hann window.
///
/// # Returns
/// `Vec<Complex<f32>>` A Vec containing the Hann window values.
fn calculate_hann_window(window_length: usize) -> Vec<f32> {
  // Since the Hann window is symmetric, we can compute only half of the values and mirror them to the other half.
  // This reduces the number of cosine computations by half.
  // Calculate the half-length of the window, accounting for odd window lengths.
  let half_length = (window_length + (window_length % 2)) / 2;

  // Compute the scaling factor for the Hann window: 2π / (N - 1)
  // The scaling factor adjusts the window values based on the length of the window
  // and is used in the formula to calculate the Hann window values for each sample.
  let scaling_factor = (PI * 2.0) / ((window_length - 1) as f32);

  // Initialize the window array with zeros and a length equal to the window_length
  let mut window = vec![0.0; window_length];

  // Compute the first half of the Hann window values
  // Formula used: w(n) = 0.5 - 0.5 * cos(2π * n / (N - 1))
  for i in 0..half_length {
    window[i] = 0.5 - 0.5 * ((scaling_factor * (i as f32)).cos());
    window[window_length - 1 - i] = window[i];
  }

  // Return the Hann window values.
  window
}

