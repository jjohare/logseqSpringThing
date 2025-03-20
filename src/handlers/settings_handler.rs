use crate::app_state::AppState;
use crate::models::{UISettings, UserSettings};
use actix_web::{web, Error, HttpResponse, HttpRequest};
use chrono::Utc;
use serde_json::Value;
use crate::config::feature_access::FeatureAccess;
use log::{info, error, warn, debug};
use std::time::Instant;

// Add a new endpoint to clear the settings cache for a user
pub async fn clear_user_settings_cache(
    req: HttpRequest,
    feature_access: web::Data<FeatureAccess>
) -> Result<HttpResponse, Error> {
    // Get pubkey from header
    let pubkey = match req.headers().get("X-Nostr-Pubkey") {
        Some(value) => value.to_str().unwrap_or("").to_string(),
        None => {
            warn!("Missing Nostr pubkey in request headers");
            return Ok(HttpResponse::BadRequest().body("Missing Nostr pubkey"));
        }
    };
    
    // Check if user has permission
    if !feature_access.can_sync_settings(&pubkey) {
        warn!("User {} attempted to clear settings cache without permission", pubkey);
        return Ok(HttpResponse::Forbidden().body("Settings sync not enabled for this user"));
    }
    
    UserSettings::clear_cache(&pubkey);
    info!("Cleared settings cache for user {}", pubkey);
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "message": "Settings cache cleared"
    })))
}

// Add a new endpoint for admin to clear all settings caches
pub async fn clear_all_settings_cache(
    req: HttpRequest,
    feature_access: web::Data<FeatureAccess>
) -> Result<HttpResponse, Error> {
    // Get pubkey from header
    let pubkey = match req.headers().get("X-Nostr-Pubkey") {
        Some(value) => value.to_str().unwrap_or("").to_string(),
        None => {
            warn!("Missing Nostr pubkey in request headers");
            return Ok(HttpResponse::BadRequest().body("Missing Nostr pubkey"));
        }
    };
    
    // Only power users can clear all caches
    if !feature_access.is_power_user(&pubkey) {
        warn!("Non-power user {} attempted to clear all settings caches", pubkey);
        return Ok(HttpResponse::Forbidden().body("Only power users can clear all settings caches"));
    }
    
    UserSettings::clear_all_cache();
    info!("Power user {} cleared all settings caches", pubkey);
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "message": "All settings caches cleared"
    })))
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("/user-settings")
            .route(web::get().to(get_public_settings))
            .route(web::post().to(update_settings))
    ).service(
        web::resource("/user-settings/sync")
            .route(web::get().to(get_user_settings))
            .route(web::post().to(update_user_settings))
    ).service(
        web::resource("/user-settings/clear-cache")
            .route(web::post().to(clear_user_settings_cache))
    ).service(
        web::resource("/admin/settings/clear-all-cache")
            .route(web::post().to(clear_all_settings_cache))
    );
}

pub async fn get_public_settings(state: web::Data<AppState>) -> Result<HttpResponse, Error> {
    let settings_guard = state.settings.read().await;
    
    // Convert to UI settings
    let ui_settings = UISettings::from(&*settings_guard);
    
    Ok(HttpResponse::Ok().json(&ui_settings))
}

pub async fn get_user_settings(
    req: HttpRequest,
    state: web::Data<AppState>,
    feature_access: web::Data<FeatureAccess>
) -> Result<HttpResponse, Error> {
    let start_time = Instant::now();
    
    // Get pubkey from header
    let pubkey = match req.headers().get("X-Nostr-Pubkey") {
        Some(value) => value.to_str().unwrap_or("").to_string(),
        None => {
            warn!("Missing Nostr pubkey in request headers");
            return Ok(HttpResponse::BadRequest().body("Missing Nostr pubkey"));
        }
    };
    
    debug!("Processing settings request for user: {}", pubkey);
    
    // Check if user has permission using FeatureAccess
    if !feature_access.can_sync_settings(&pubkey) {
        warn!("User {} attempted to sync settings without permission", pubkey);
        return Ok(HttpResponse::Forbidden().body("Settings sync not enabled for this user"));
    }

    let is_power_user = feature_access.is_power_user(&pubkey);
    let result;

    if is_power_user {
        // Power users get settings from the global settings file
        let settings_guard = state.settings.read().await;
        let ui_settings = UISettings::from(&*settings_guard);
        debug!("Returning global settings for power user {}", pubkey);
        result = Ok(HttpResponse::Ok().json(ui_settings));
    } else {
        // Regular users get their personal settings or defaults
        // This will use the cache if available due to our UserSettings::load implementation
        let user_settings = UserSettings::load(&pubkey).unwrap_or_else(|| {
            debug!("Creating new user settings for {} with default settings", pubkey);
            UserSettings::new(&pubkey, UISettings::default())
        });
        result = Ok(HttpResponse::Ok().json(&user_settings.settings));
    }
    
    // Log the time taken to process this request
    let elapsed = start_time.elapsed();
    debug!("Settings request for {} processed in {:?}", pubkey, elapsed);
    
    result
}

pub async fn update_user_settings(
    req: HttpRequest,
    state: web::Data<AppState>,
    feature_access: web::Data<FeatureAccess>,
    payload: web::Json<Value>,
) -> Result<HttpResponse, Error> {
    let start_time = Instant::now();
    
    // Get pubkey from header
    let pubkey = match req.headers().get("X-Nostr-Pubkey") {
        Some(value) => value.to_str().unwrap_or("").to_string(),
        None => {
            debug!("No Nostr pubkey in headers, returning default settings");
            let settings_guard = state.settings.read().await;
            let ui_settings = UISettings::from(&*settings_guard);
            return Ok(HttpResponse::Ok().json(ui_settings));
        }
    };
    
    debug!("Processing settings update for user: {}", pubkey);

    // Check if user has permission to sync settings
    if !feature_access.can_sync_settings(&pubkey) {
        warn!("User {} attempted to sync settings without permission", pubkey);
        return Ok(HttpResponse::Forbidden().body("Settings sync not enabled for this user"));
    }

    // Parse and validate settings
    let ui_settings: UISettings = match serde_json::from_value(payload.into_inner()) {
        Ok(settings) => settings,
        Err(e) => return Ok(HttpResponse::BadRequest().body(format!("Invalid settings format: {}", e)))
    };

    // Check if user is a power user
    let is_power_user = feature_access.is_power_user(&pubkey);
    let result;

    if is_power_user {
        // Power users update the global settings file
        let mut settings_guard = state.settings.write().await;
        ui_settings.merge_into_settings(&mut settings_guard);
        
        if let Err(e) = settings_guard.save() {
            error!("Failed to save global settings: {}", e);
            return Ok(HttpResponse::InternalServerError().body(format!("Failed to save settings: {}", e)));
        }
        
        info!("Power user {} updated global settings", pubkey);
        let updated_ui_settings = UISettings::from(&*settings_guard);
        result = Ok(HttpResponse::Ok().json(updated_ui_settings));
    } else {
        // Regular users update their personal settings file
        // This will use the cache if available due to our UserSettings::load implementation
        let mut user_settings = UserSettings::load(&pubkey).unwrap_or_else(|| {
            debug!("Creating new user settings for {}", pubkey);
            UserSettings::new(&pubkey, UISettings::default())
        });
        user_settings.settings = ui_settings;
        user_settings.last_modified = Utc::now().timestamp();
        
        // This will update the cache immediately and save to disk in the background
        if let Err(e) = user_settings.save() {
            error!("Failed to save user settings for {}: {}", pubkey, e);
            return Ok(HttpResponse::InternalServerError().body(format!("Failed to save user settings: {}", e)));
        }
        
        debug!("User {} updated their settings", pubkey);
        result = Ok(HttpResponse::Ok().json(&user_settings.settings));
    }
    
    // Log the time taken to process this request
    let elapsed = start_time.elapsed();
    debug!("Settings update for {} processed in {:?}", pubkey, elapsed);
    
    result
}

pub async fn update_settings(
    req: HttpRequest,
    state: web::Data<AppState>,
    feature_access: web::Data<FeatureAccess>,
    payload: web::Json<Value>,
) -> Result<HttpResponse, Error> {
    // Get pubkey from header
    let pubkey = match req.headers().get("X-Nostr-Pubkey") {
        Some(value) => value.to_str().unwrap_or("").to_string(),
        None => {
            warn!("Attempt to update settings without authentication");
            // For updates, we do require authentication
            // This prevents unauthenticated users from modifying settings
            // They can still read public settings via get endpoints
            return Ok(HttpResponse::BadRequest().body("Missing Nostr pubkey"));
        }
    };

    // Check if user is a power user
    let is_power_user = feature_access.is_power_user(&pubkey);

    if !is_power_user {
        warn!("Non-power user {} attempted to modify global settings", pubkey);
        return Ok(HttpResponse::Forbidden().body("Only power users can modify global settings"));
    }

    // Parse and validate settings
    let ui_settings: UISettings = match serde_json::from_value(payload.into_inner()) {
        Ok(settings) => settings,
        Err(e) => return Ok(HttpResponse::BadRequest().body(format!("Invalid settings format: {}", e)))
    };

    let mut settings_guard = state.settings.write().await;
    ui_settings.merge_into_settings(&mut settings_guard);
    
    if let Err(e) = settings_guard.save() {
        error!("Failed to save global settings: {}", e);
        return Ok(HttpResponse::InternalServerError().body(format!("Failed to save settings: {}", e)));
    }
    
    info!("Power user {} updated global settings", pubkey);
    let updated_ui_settings = UISettings::from(&*settings_guard);
    Ok(HttpResponse::Ok().json(updated_ui_settings))
}

pub async fn get_graph_settings(app_state: web::Data<AppState>) -> Result<HttpResponse, Error> {
    let settings = app_state.settings.read().await;
    let ui_settings = UISettings::from(&*settings);
    Ok(HttpResponse::Ok().json(&ui_settings.visualization))
}
