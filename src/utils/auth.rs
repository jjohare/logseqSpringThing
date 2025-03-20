use actix_web::{HttpRequest, HttpResponse};
use log::warn;
use crate::services::nostr_service::NostrService;

pub enum AccessLevel {
    Authenticated,  // Any authenticated Nostr user
    PowerUser,      // Power users only
}

pub async fn verify_access(
    req: &HttpRequest,
    nostr_service: &NostrService,
    required_level: AccessLevel,
) -> Result<String, HttpResponse> {
    // Get pubkey from header
    let pubkey = match req.headers().get("X-Nostr-Pubkey") {
        Some(value) => value.to_str().unwrap_or("").to_string(),
        None => {
            warn!("Missing Nostr pubkey in request headers");
            return Err(HttpResponse::Forbidden().body("Authentication required"));
        }
    };

    // Get token from header
    let token = match req.headers().get("X-Nostr-Token") {
        Some(value) => value.to_str().unwrap_or("").to_string(),
        None => {
            warn!("Missing Nostr token in request headers");
            return Err(HttpResponse::Forbidden().body("Authentication required"));
        }
    };

    // Validate session
    if !nostr_service.validate_session(&pubkey, &token).await {
        warn!("Invalid or expired session for user {}", pubkey);
        return Err(HttpResponse::Unauthorized().body("Invalid or expired session"));
    }

    // Check access level
    match required_level {
        AccessLevel::Authenticated => {
            // Any valid session is sufficient
            Ok(pubkey)
        }
        AccessLevel::PowerUser => {
            if nostr_service.is_power_user(&pubkey).await {
                Ok(pubkey)
            } else {
                warn!("Non-power user {} attempted restricted operation", pubkey);
                Err(HttpResponse::Forbidden().body("This operation requires power user access"))
            }
        }
    }
}

// Helper function for handlers that require power user access
pub async fn verify_power_user(
    req: &HttpRequest,
    nostr_service: &NostrService,
) -> Result<String, HttpResponse> {
    verify_access(req, nostr_service, AccessLevel::PowerUser).await
}

// Helper function for handlers that require authentication
pub async fn verify_authenticated(
    req: &HttpRequest,
    nostr_service: &NostrService,
) -> Result<String, HttpResponse> {
    verify_access(req, nostr_service, AccessLevel::Authenticated).await
}