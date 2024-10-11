use log::{info, error, warn};
use serde_json::Value;
use base64::engine::general_purpose;
use base64::Engine as _;

pub struct AudioProcessor;

impl AudioProcessor {
    pub fn process_json_response(response_data: &[u8]) -> Result<(String, Vec<u8>), String> {
        // Parse the JSON response
        let json_response: Value = serde_json::from_slice(response_data)
            .map_err(|e| format!("Failed to parse JSON response: {}", e))?;
        
        // Log the entire JSON response
        info!("Received JSON response: {}", serde_json::to_string_pretty(&json_response).unwrap_or_else(|_| "Unable to prettify JSON".to_string()));
        
        // Check if the response contains an error message
        if let Some(error_msg) = json_response["error"].as_str() {
            return Err(format!("Error in JSON response: {}", error_msg));
        }

        // Extract the text answer
        let answer = json_response["data"]["answer"]
            .as_str()
            .ok_or_else(|| "Text answer not found in JSON response".to_string())?
            .to_string();

        // Try to extract the audio data from different possible locations
        let audio_data = if let Some(audio) = json_response["data"]["audio"].as_str() {
            general_purpose::STANDARD.decode(audio).map_err(|e| format!("Failed to decode base64 audio data: {}", e))?
        } else if let Some(audio) = json_response["audio"].as_str() {
            general_purpose::STANDARD.decode(audio).map_err(|e| format!("Failed to decode base64 audio data: {}", e))?
        } else {
            // If we can't find the audio data, log the keys present in the JSON and return an error
            warn!("Audio data not found in JSON response. Available keys: {:?}", json_response.as_object().map(|obj| obj.keys().collect::<Vec<_>>()));
            return Err("Audio data not found in JSON response".to_string());
        };
        
        info!("Decoded audio data size: {} bytes", audio_data.len());
        if audio_data.len() >= 44 {
            info!("First 44 bytes (WAV header): {:?}", &audio_data[..44]);
            
            // Verify WAV header
            if &audio_data[..4] != b"RIFF" || &audio_data[8..12] != b"WAVE" {
                error!("Invalid WAV header");
                return Err("Invalid WAV header".to_string());
            }
        } else {
            error!("Audio data too short to contain WAV header");
            return Err("Audio data too short".to_string());
        }
        
        Ok((answer, audio_data))
    }
}