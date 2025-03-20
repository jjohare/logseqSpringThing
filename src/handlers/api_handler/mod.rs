pub mod files;
pub mod graph;
pub mod visualization;

// Re-export specific types and functions
// Re-export specific types and functions
pub use files::{
    fetch_and_process_files,
    get_file_content,
};

pub use graph::{
    get_graph_data,
    get_paginated_graph_data,
    refresh_graph,
    update_graph,
};

pub use visualization::get_visualization_settings;

use actix_web::web;

// Configure all API routes
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .configure(files::config)
            .configure(graph::config)
            .configure(visualization::config)
            .configure(crate::handlers::nostr_handler::config)
            .service(
                web::scope("/settings")
                    .route("", web::get().to(crate::handlers::settings_handler::get_public_settings))
                    .route("", web::post().to(crate::handlers::settings_handler::update_settings))
                    .route("/sync", web::get().to(crate::handlers::settings_handler::get_user_settings))
                    .route("/sync", web::post().to(crate::handlers::settings_handler::update_user_settings))
                    .route("/clear-cache", web::post().to(crate::handlers::settings_handler::clear_user_settings_cache))
            )
    );
}
