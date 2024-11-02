use miniz_oxide::deflate::compress_to_vec;
use miniz_oxide::inflate::decompress_to_vec;
use serde_json;
use std::io;
use log::{debug, error};

const COMPRESSION_MAGIC: &[u8] = b"COMP";
const COMPRESSION_LEVEL: u8 = 6; // Balance between compression ratio and speed

pub fn compress_message(message: &str) -> Result<Vec<u8>, serde_json::Error> {
    debug!("Compressing message of length: {}", message.len());
    
    let mut compressed = Vec::with_capacity(COMPRESSION_MAGIC.len() + message.len());
    compressed.extend_from_slice(COMPRESSION_MAGIC);
    compressed.extend_from_slice(&compress_to_vec(message.as_bytes(), COMPRESSION_LEVEL));
    
    debug!("Compressed size: {} bytes", compressed.len());
    Ok(compressed)
}

pub fn decompress_message(compressed: &[u8]) -> Result<String, io::Error> {
    if compressed.len() < COMPRESSION_MAGIC.len() {
        error!("Compressed data too short: {} bytes", compressed.len());
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Compressed data too short"
        ));
    }

    if &compressed[..COMPRESSION_MAGIC.len()] != COMPRESSION_MAGIC {
        error!("Invalid compression header");
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid compression header"
        ));
    }

    let decompressed = decompress_to_vec(&compressed[COMPRESSION_MAGIC.len()..])
        .map_err(|e| {
            error!("Decompression failed: {:?}", e);
            io::Error::new(io::ErrorKind::InvalidData, "Failed to decompress data")
        })?;
    
    String::from_utf8(decompressed)
        .map_err(|e| {
            error!("Invalid UTF-8 in decompressed data: {}", e);
            io::Error::new(io::ErrorKind::InvalidData, "Invalid UTF-8")
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compression_roundtrip() {
        let original = "Hello, World!";
        let compressed = compress_message(original).unwrap();
        let decompressed = decompress_message(&compressed).unwrap();
        assert_eq!(original, decompressed);
    }

    #[test]
    fn test_compression_magic_header() {
        let message = "Test message";
        let compressed = compress_message(message).unwrap();
        assert_eq!(&compressed[..COMPRESSION_MAGIC.len()], COMPRESSION_MAGIC);
    }

    #[test]
    fn test_invalid_compression_header() {
        let invalid_data = vec![0; 10];
        let result = decompress_message(&invalid_data);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_message() {
        let empty = "";
        let compressed = compress_message(empty).unwrap();
        let decompressed = decompress_message(&compressed).unwrap();
        assert_eq!(empty, decompressed);
    }

    #[test]
    fn test_large_message() {
        let large_message = "A".repeat(1000000);
        let compressed = compress_message(&large_message).unwrap();
        let decompressed = decompress_message(&compressed).unwrap();
        assert_eq!(large_message, decompressed);
        // Verify compression actually reduces size
        assert!(compressed.len() < large_message.len());
    }
}
