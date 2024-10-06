use actix_web::{web, HttpResponse, Error, ResponseError};
use crate::AppState;
use serde::{Serialize, Deserialize};
use log::{info, error};
use actix_web::web::Bytes;
use std::sync::Arc;
use futures::StreamExt;
use crate::services::ragflow_service::RAGFlowError;
use crate::tts_service::TtsService;
use tokio::sync::RwLock;

#[derive(Serialize, Deserialize)]
pub struct MessageRequest {
    pub conversation_id: String,
    pub messages: Vec<Message>,
    pub quote: Option<bool>,
    pub doc_ids: Option<Vec<String>>,
    pub stream: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct InitChatRequest {
    pub user_id: String,
}

#[derive(Serialize)]
pub struct InitChatResponse {
    pub success: bool,
    pub conversation_id: String,
    pub message: Option<String>,
}

#[derive(Serialize)]
pub struct MessageResponse {
    pub text: String,
    pub audio_path: String,
}

impl ResponseError for RAGFlowError {
    fn error_response(&self) -> HttpResponse {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": self.to_string()
        }))
    }
}

pub async fn send_message(state: web::Data<AppState>, msg: web::Json<MessageRequest>) -> Result<HttpResponse, Error> {
    let message_content = msg.messages.last().unwrap().content.clone();
    let quote = msg.quote.unwrap_or(false);
    let doc_ids = msg.doc_ids.clone();
    let stream = msg.stream.unwrap_or(false);
    let conversation_id = msg.conversation_id.clone();

    info!("Sending message to RAGFlow: {}", message_content);
    info!("Quote: {}, Stream: {}, Doc IDs: {:?}", quote, stream, doc_ids);

    let ragflow_service = Arc::clone(&state.ragflow_service);
    let tts_service = Arc::clone(&state.tts_service);

    match ragflow_service.send_message(conversation_id, message_content, quote, doc_ids, stream).await {
        Ok(response_stream) => {
            let mut full_response = String::new();
            let mut response = response_stream.map(|result| {
                result.map(|bytes| {
                    let chunk = String::from_utf8_lossy(&bytes).to_string();
                    full_response.push_str(&chunk);
                    Bytes::from(chunk)
                }).map_err(|e| actix_web::error::ErrorInternalServerError(e))
            });

            // Collect the full response
            while let Some(chunk) = response.next().await {
                chunk?;
            }

            // Generate audio from the full response
            let mut tts_service = tts_service.write().await;
            match tts_service.generate_audio(&full_response).await {
                Ok(audio_path) => {
                    let response = MessageResponse {
                        text: full_response,
                        audio_path: audio_path.to_string_lossy().into_owned(),
                    };
                    Ok(HttpResponse::Ok().json(response))
                },
                Err(e) => {
                    error!("Error generating audio: {}", e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                        "error": format!("Failed to generate audio: {}", e)
                    })))
                }
            }
        },
        Err(e) => {
            error!("Error sending message: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to send message: {}", e)
            })))
        }
    }
}

pub async fn init_chat(state: web::Data<AppState>, req: web::Json<InitChatRequest>) -> HttpResponse {
    let user_id = &req.user_id;

    info!("Initializing chat for user: {}", user_id);

    match state.ragflow_service.create_conversation(user_id.clone()).await {
        Ok(conversation_id) => HttpResponse::Ok().json(InitChatResponse {
            success: true,
            conversation_id,
            message: None,
        }),
        Err(e) => {
            error!("Error initiating chat: {}", e);
            HttpResponse::InternalServerError().json(InitChatResponse {
                success: false,
                conversation_id: "".to_string(),
                message: Some(format!("Failed to initialize chat: {}", e)),
            })
        }
    }
}

pub async fn get_chat_history(_state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let conversation_id = path.into_inner();
    info!("Retrieving chat history for conversation: {}", conversation_id);

    HttpResponse::NotImplemented().json(serde_json::json!({
        "message": "Chat history retrieval is not implemented"
    }))
}
