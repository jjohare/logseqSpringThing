use miniz_oxide::deflate::compress_to_vec;
use miniz_oxide::inflate::decompress_to_vec;
use serde_json;
use std::io;

const COMPRESSION_MAGIC: &[u8] = b"COMP";

pub fn compress_message(message: &str) -> Result<Vec<u8>, serde_json::Error> {
    let mut compressed = Vec::with_capacity(COMPRESSION_MAGIC.len() + message.len());
    compressed.extend_from_slice(COMPRESSION_MAGIC);
    compressed.extend_from_slice(&compress_to_vec(message.as_bytes(), 6));
    Ok(compressed)
}

pub fn decompress_message(compressed: &[u8]) -> Result<String, io::Error> {
    if compressed.len() < COMPRESSION_MAGIC.len() || &compressed[..COMPRESSION_MAGIC.len()] != COMPRESSION_MAGIC {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Invalid compression header"));
    }

    let decompressed = decompress_to_vec(&compressed[COMPRESSION_MAGIC.len()..])
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Failed to decompress data"))?;
    
    String::from_utf8(decompressed)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Invalid UTF-8"))
}
