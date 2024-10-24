use miniz_oxide::deflate::compress_to_vec;
use miniz_oxide::inflate::decompress_to_vec;
use serde_json;
use std::io;

pub fn compress_message(message: &str) -> Result<Vec<u8>, serde_json::Error> {
    let compressed = compress_to_vec(message.as_bytes(), 6);
    Ok(compressed)
}

pub fn decompress_message(compressed: &[u8]) -> Result<String, io::Error> {
    let decompressed = decompress_to_vec(compressed)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Failed to decompress data"))?;
    
    String::from_utf8(decompressed)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid UTF-8"))
}
