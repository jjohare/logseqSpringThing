use pyo3::exceptions::PyRuntimeError;
use pyo3::prelude::*;

/// Segment given text.
#[pyfunction]
fn segment(lang_code: &str, text: &str) -> PyResult<Vec<String>> {
    libtqsm::segment(lang_code, text).map_err(|e| PyRuntimeError::new_err(e.to_string()))
}

/// Sentence segmentation.
#[pymodule]
fn pytqsm(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(segment, m)?)?;
    Ok(())
}
