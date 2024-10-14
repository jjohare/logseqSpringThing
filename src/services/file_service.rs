// file_service.rs

use crate::models::metadata::Metadata;
use crate::config::Settings;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use async_trait::async_trait;
use log::{info, debug, error};
use regex::Regex;
use sha1::{Sha1, Digest};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::error::Error as StdError;

const METADATA_PATH: &str = "/app/data/markdown/metadata.json";

/// Structure representing a file's metadata from GitHub.
#[derive(Serialize, Deserialize, Clone)]
pub struct GithubFileMetadata {
    pub name: String, // File path relative to the repository root or base path
    pub sha: String,  // SHA1 checksum of the file
}

/// Structure representing a processed file.
#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessedFile {
    pub file_name: String,    // Name/path of the file
    pub content: String,      // Content of the file
    pub is_public: bool,      // Indicates if the file is public
    pub metadata: Metadata,   // Additional metadata
}

/// Trait defining the necessary GitHub service methods.
#[async_trait]
pub trait GitHubService: Send + Sync {
    /// Fetches metadata for all relevant files from GitHub.
    async fn fetch_file_metadata(&self) -> Result<Vec<GithubFileMetadata>, Box<dyn StdError + Send + Sync>>;
    
    /// Fetches the content of a file using its SHA1 checksum via the Git Blobs API.
    async fn fetch_file_content_by_sha(&self, sha: &str) -> Result<String, Box<dyn StdError + Send + Sync>>;
}

/// Service responsible for interacting with GitHub and processing files.
pub struct FileService;

#[async_trait]
impl GitHubService for FileService {
    async fn fetch_file_metadata(&self) -> Result<Vec<GithubFileMetadata>, Box<dyn StdError + Send + Sync>> {
        // TODO: Implement actual GitHub API call to fetch file metadata
        // For now, return a mock implementation
        Ok(vec![
            GithubFileMetadata {
                name: "example.md".to_string(),
                sha: "abc123".to_string(),
            }
        ])
    }

    async fn fetch_file_content_by_sha(&self, _sha: &str) -> Result<String, Box<dyn StdError + Send + Sync>> {
        // TODO: Implement actual GitHub API call to fetch file content
        // For now, return a mock implementation
        Ok("public:: true\n# Example Content".to_string())
    }
}

impl FileService {
    /// Fetches and processes files from GitHub, updating the local metadata map.
    pub async fn fetch_and_process_files(
        github_service: &dyn GitHubService,
        _settings: Arc<RwLock<Settings>>,
        metadata_map: &mut HashMap<String, Metadata>,
    ) -> Result<Vec<ProcessedFile>, Box<dyn StdError + Send + Sync>> {
        // Fetch all relevant file metadata from GitHub in a single API call.
        let github_files_metadata = github_service.fetch_file_metadata().await?;
        debug!("Fetched {} file metadata from GitHub", github_files_metadata.len());

        let mut processed_files = Vec::new();
        let local_metadata = metadata_map.clone();
        let github_file_names: HashSet<String> = github_files_metadata.iter().map(|f| f.name.clone()).collect();
        
        // Identify and remove local files that no longer exist on GitHub.
        let removed_files: Vec<String> = local_metadata.keys()
            .filter(|name| !github_file_names.contains(*name))
            .cloned()
            .collect();
        
        for removed_file in removed_files {
            info!("Removing file not present on GitHub: {}", removed_file);
            metadata_map.remove(&removed_file);
        }

        // Iterate through each file metadata fetched from GitHub.
        for file_meta in github_files_metadata {
            let local_meta = metadata_map.get(&file_meta.name);
            if let Some(local_meta) = local_meta {
                // If the SHA1 checksum matches, the file is up-to-date; skip processing.
                if local_meta.sha1 == file_meta.sha {
                    debug!("File '{}' is up-to-date. Skipping.", file_meta.name);
                    continue;
                } else {
                    info!("File '{}' has been updated. Fetching new content.", file_meta.name);
                }
            } else {
                // New file detected; proceed to fetch its content.
                info!("New file detected: '{}'. Fetching content.", file_meta.name);
            }

            // Fetch the file content using the Blobs API with the SHA1 checksum.
            let content = match github_service.fetch_file_content_by_sha(&file_meta.sha).await {
                Ok(content) => content,
                Err(e) => {
                    error!("Failed to fetch content for '{}': {}", file_meta.name, e);
                    continue; // Skip this file and proceed with others.
                }
            };

            // Determine if the file is public by checking the first line.
            let is_public = if content.starts_with("public:: true") {
                true
            } else {
                false
            };

            if is_public {
                // Save the file content to the local filesystem.
                if let Err(e) = fs::write(format!("/app/data/markdown/{}", file_meta.name), &content) {
                    error!("Failed to write file '{}': {}", file_meta.name, e);
                    continue; // Skip updating metadata if writing fails.
                }

                // Create a new metadata entry for the processed file.
                let new_metadata = Metadata {
                    file_name: file_meta.name.clone(),
                    file_size: content.len(),
                    hyperlink_count: Self::count_hyperlinks(&content),
                    sha1: file_meta.sha.clone(),
                    last_modified: Utc::now(),
                    perplexity_link: String::new(),
                    last_perplexity_process: None,
                    topic_counts: HashMap::new(),
                };

                // Update the local metadata map with the new metadata.
                metadata_map.insert(file_meta.name.clone(), new_metadata.clone());

                // Add the processed file to the list for further processing.
                processed_files.push(ProcessedFile {
                    file_name: file_meta.name.clone(),
                    content,
                    is_public,
                    metadata: new_metadata,
                });

                debug!("Processed and updated file: {}", file_meta.name);
            } else {
                debug!("File '{}' is not public. Skipping.", file_meta.name);
            }
        }

        debug!("Processed {} files after comparison", processed_files.len());
        Ok(processed_files)
    }

    /// Loads existing metadata from the local store or creates a new metadata file if it doesn't exist.
    pub async fn load_or_create_metadata() -> Result<HashMap<String, Metadata>, Box<dyn StdError + Send + Sync>> {
        if Path::new(METADATA_PATH).exists() {
            let metadata_content = fs::read_to_string(METADATA_PATH)?;
            let metadata: HashMap<String, Metadata> = serde_json::from_str(&metadata_content)?;
            Ok(metadata)
        } else {
            debug!("metadata.json not found. Creating a new one.");
            let empty_metadata = HashMap::new();
            Self::save_metadata(&empty_metadata).await?;
            Ok(empty_metadata)
        }
    }

    /// Saves the updated metadata map to the local metadata file.
    pub async fn save_metadata(metadata_map: &HashMap<String, Metadata>) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let metadata_path = METADATA_PATH;
        
        if let Some(parent_dir) = Path::new(metadata_path).parent() {
            fs::create_dir_all(parent_dir)?;
            debug!("Ensured directory exists: {}", parent_dir.display());
        }

        let updated_content = serde_json::to_string_pretty(metadata_map)?;
        fs::write(metadata_path, updated_content)?;
        debug!("Updated metadata file at: {}", metadata_path);
        Ok(())
    }

    /// Updates the metadata file with new entries from the provided metadata map.
    pub async fn update_metadata(metadata_map: &HashMap<String, Metadata>) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let existing_metadata = Self::load_or_create_metadata().await?;
        let mut updated_metadata = existing_metadata;

        for (key, value) in metadata_map {
            updated_metadata.insert(key.clone(), value.clone());
        }

        Self::save_metadata(&updated_metadata).await?;
        info!("Updated metadata.json file at {}", METADATA_PATH);

        Ok(())
    }

    /// Counts the number of hyperlinks in the provided content using a regex pattern.
    fn count_hyperlinks(content: &str) -> usize {
        let re = Regex::new(r"\[.*?\]\(.*?\)").unwrap();
        re.find_iter(content).count()
    }
}
