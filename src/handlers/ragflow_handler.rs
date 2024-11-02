use actix_web::{web, HttpResponse, Error, ResponseError};
use crate::AppState;
use serde::{Serialize, Deserialize};
use log::{info, error};
use actix_web::web::Bytes;
use std::sync::Arc;
use futures::StreamExt;
use crate::services::ragflow_service::RAGFlowError;
use base64::engine::general_purpose;
use base64::Engine as _;

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

/// Response structure for initiating a chat.
#[derive(Serialize)]
pub struct InitChatResponse {
    pub success: bool,
    pub conversation_id: String,
    pub message: Option<String>,
}

// Implement ResponseError for RAGFlowError
impl ResponseError for RAGFlowError {
    fn error_response(&self) -> HttpResponse {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "error": self.to_string()
        }))
    }
}

/// Handler for sending a message to the RAGFlow service.
pub async fn send_message(state: web::Data<AppState>, msg: web::Json<MessageRequest>) -> Result<HttpResponse, Error> {
    let message_content = msg.messages.last().unwrap().content.clone();
    let quote = msg.quote.unwrap_or(false);
    let doc_ids = msg.doc_ids.clone();
    let stream = msg.stream.unwrap_or(false);
    let conversation_id = msg.conversation_id.clone();

    info!("Sending message to RAGFlow: {}", message_content);
    info!("Quote: {}, Stream: {}, Doc IDs: {:?}", quote, stream, doc_ids);

    // Clone the Arc<RAGFlowService>
    let ragflow_service = Arc::clone(&state.ragflow_service);

    // Call the async send_message function
    match ragflow_service.send_message(conversation_id, message_content, quote, doc_ids, stream).await {
        Ok(response_stream) => {
            let mapped_stream = response_stream.map(|result| {
                result.map(|(answer, audio_data)| {
                    let response = serde_json::json!({
                        "type": "ragflowResponse",
                        "data": {
                            "answer": answer,
                            "audio": general_purpose::STANDARD.encode(&audio_data)
                        }
                    });
                    Bytes::from(serde_json::to_string(&response).unwrap())
                })
                .map_err(|e| actix_web::error::ErrorInternalServerError(e))
            });
            Ok(HttpResponse::Ok().streaming(mapped_stream))
        },
        Err(e) => {
            error!("Error sending message: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to send message: {}", e)
            })))
        }
    }
}

/// Handler for initiating a new chat conversation.
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

/// Handler for retrieving chat history.
pub async fn get_chat_history(_state: web::Data<AppState>, path: web::Path<String>) -> HttpResponse {
    let conversation_id = path.into_inner();
    info!("Retrieving chat history for conversation: {}", conversation_id);

    // Note: We've removed the get_chat_history method from RAGFlowService
    // You may want to implement this functionality if needed
    HttpResponse::NotImplemented().json(serde_json::json!({
        "message": "Chat history retrieval is not implemented"
    }))
}
