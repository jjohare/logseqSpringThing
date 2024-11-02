use log::{info, error, warn, debug};
use serde_json::Value;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

pub struct AudioProcessor;

impl AudioProcessor {
    pub fn process_json_response(response_data: &[u8]) -> Result<(String, Vec<u8>), String> {
        // Parse the JSON response
        let json_response: Value = serde_json::from_slice(response_data)
            .map_err(|e| format!("Failed to parse JSON response: {}", e))?;
        
        // Log the entire JSON response at debug level
        debug!("Received JSON response: {}", serde_json::to_string_pretty(&json_response).unwrap_or_else(|_| "Unable to prettify JSON".to_string()));
        
        // Check if the response contains an error message
        if let Some(error_msg) = json_response["error"].as_str() {
            error!("Error in JSON response: {}", error_msg);
            return Err(format!("Error in JSON response: {}", error_msg));
        }

        // Extract the text answer with better error handling
        let answer = json_response["data"]["answer"]
            .as_str()
            .or_else(|| json_response["answer"].as_str())
            .ok_or_else(|| {
                error!("Text answer not found in JSON response");
                "Text answer not found in JSON response".to_string()
            })?
            .to_string();

        // Try to extract the audio data from different possible locations with detailed logging
        let audio_data = if let Some(audio) = json_response["data"]["audio"].as_str() {
            debug!("Found audio data in data.audio");
            BASE64.decode(audio).map_err(|e| format!("Failed to decode base64 audio data from data.audio: {}", e))?
        } else if let Some(audio) = json_response["audio"].as_str() {
            debug!("Found audio data in root.audio");
            BASE64.decode(audio).map_err(|e| format!("Failed to decode base64 audio data from root.audio: {}", e))?
        } else {
            // Log available paths in the JSON for debugging
            warn!("Audio data not found in JSON response. Available paths:");
            if let Some(obj) = json_response.as_object() {
                for (key, value) in obj {
                    warn!("- {}: {}", key, match value {
                        Value::Null => "null",
                        Value::Bool(_) => "boolean",
                        Value::Number(_) => "number",
                        Value::String(_) => "string",
                        Value::Array(_) => "array",
                        Value::Object(_) => "object",
                    });
                }
            }
            return Err("Audio data not found in JSON response".to_string());
        };
        
        info!("Successfully processed audio data: {} bytes", audio_data.len());
        
        // Validate WAV header
        if audio_data.len() >= 44 {
            debug!("WAV header: {:?}", &audio_data[..44]);
            
            if &audio_data[..4] != b"RIFF" || &audio_data[8..12] != b"WAVE" {
                error!("Invalid WAV header detected");
                return Err("Invalid WAV header".to_string());
            }
            
            // Extract and log WAV format information
            let channels = u16::from_le_bytes([audio_data[22], audio_data[23]]);
            let sample_rate = u32::from_le_bytes([audio_data[24], audio_data[25], audio_data[26], audio_data[27]]);
            let bits_per_sample = u16::from_le_bytes([audio_data[34], audio_data[35]]);
            
            debug!("WAV format: {} channels, {} Hz, {} bits per sample", 
                  channels, sample_rate, bits_per_sample);
        } else {
            error!("Audio data too short to contain WAV header: {} bytes", audio_data.len());
            return Err("Audio data too short".to_string());
        }
        
        Ok((answer, audio_data))
    }

    pub fn validate_wav_header(audio_data: &[u8]) -> Result<(), String> {
        if audio_data.len() < 44 {
            return Err("Audio data too short for WAV header".to_string());
        }

        if &audio_data[..4] != b"RIFF" {
            return Err("Missing RIFF header".to_string());
        }

        if &audio_data[8..12] != b"WAVE" {
            return Err("Missing WAVE format".to_string());
        }

        let channels = u16::from_le_bytes([audio_data[22], audio_data[23]]);
        let sample_rate = u32::from_le_bytes([audio_data[24], audio_data[25], audio_data[26], audio_data[27]]);
        let bits_per_sample = u16::from_le_bytes([audio_data[34], audio_data[35]]);

        debug!("Validated WAV format: {} channels, {} Hz, {} bits per sample",
              channels, sample_rate, bits_per_sample);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_process_json_response_valid() {
        let test_wav = vec![
            b'R', b'I', b'F', b'F', // ChunkID
            0x24, 0x00, 0x00, 0x00, // ChunkSize
            b'W', b'A', b'V', b'E', // Format
            b'f', b'm', b't', b' ', // Subchunk1ID
            0x10, 0x00, 0x00, 0x00, // Subchunk1Size
            0x01, 0x00,             // AudioFormat (PCM)
            0x01, 0x00,             // NumChannels (Mono)
            0x44, 0xAC, 0x00, 0x00, // SampleRate (44100)
            0x88, 0x58, 0x01, 0x00, // ByteRate
            0x02, 0x00,             // BlockAlign
            0x10, 0x00,             // BitsPerSample (16)
            b'd', b'a', b't', b'a', // Subchunk2ID
            0x00, 0x00, 0x00, 0x00  // Subchunk2Size
        ];

        let json_data = json!({
            "data": {
                "answer": "Test answer",
                "audio": BASE64.encode(test_wav)
            }
        });

        let result = AudioProcessor::process_json_response(
            serde_json::to_vec(&json_data).unwrap().as_slice()
        );

        assert!(result.is_ok());
        let (answer, audio) = result.unwrap();
        assert_eq!(answer, "Test answer");
        assert_eq!(&audio[..4], b"RIFF");
    }

    #[test]
    fn test_process_json_response_invalid_wav() {
        let invalid_wav = vec![0x00; 44]; // Invalid WAV header
        let json_data = json!({
            "data": {
                "answer": "Test answer",
                "audio": BASE64.encode(invalid_wav)
            }
        });

        let result = AudioProcessor::process_json_response(
            serde_json::to_vec(&json_data).unwrap().as_slice()
        );

        assert!(result.is_err());
    }
}
