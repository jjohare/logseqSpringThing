use miniz_oxide::{compress, decompress};
use serde_json;

pub fn compress_message(message: &str) -> Result<Vec<u8>, serde_json::Error> {
    let compressed = compress(message.as_bytes());
    Ok(compressed)
}

pub fn decompress_message(compressed: &[u8]) -> Result<String, miniz_oxide::inflate::Error> {
    let decompressed = decompress(compressed)?;
    Ok(String::from_utf8_lossy(&decompressed).to_string())
}
