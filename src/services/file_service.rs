// file_service.rs

use crate::models::metadata::Metadata;
use crate::config::Settings;
use serde::{Deserialize, Serialize};
use async_trait::async_trait;
use log::{info, debug, warn};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::fs;
use chrono::{Utc, Duration};
use std::sync::Arc;
use tokio::sync::RwLock;
use reqwest::{Client, StatusCode, header};
use base64::{Engine as _, engine::general_purpose};
use thiserror::Error;

const METADATA_PATH: &str = "/app/data/markdown/metadata.json";
const CACHE_DURATION: i64 = 3600; // Cache duration in seconds (1 hour)

#[derive(Error, Debug)]
pub enum FileServiceError {
    #[error("GitHub API error: {0}")]
    GitHubApiError(String),
    #[error("Rate limit exceeded")]
    RateLimitExceeded,
    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Base64 decoding error: {0}")]
    Base64Error(#[from] base64::DecodeError),
}

/// Structure representing a file's metadata from GitHub.
#[derive(Serialize, Deserialize, Clone)]
pub struct GithubFileMetadata {
    pub name: String,
    pub sha: String,
}

/// Structure representing a processed file.
#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessedFile {
    pub file_name: String,
    pub content: String,
    pub is_public: bool,
    pub metadata: Metadata,
}

/// Trait defining the necessary GitHub service methods.
#[async_trait]
pub trait GitHubService: Send + Sync {
    async fn fetch_file_metadata(&self) -> Result<Vec<GithubFileMetadata>, FileServiceError>;
    async fn fetch_file_content_by_sha(&self, sha: &str) -> Result<String, FileServiceError>;
}

/// Service responsible for interacting with GitHub and processing files.
pub struct FileService;

/// Implementation of GitHubService for FileService
pub struct GitHubServiceImpl {
    client: Client,
    settings: Arc<RwLock<Settings>>,
    cache: Arc<RwLock<HashMap<String, (String, chrono::DateTime<Utc>)>>>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GithubContent {
    name: String,
    path: String,
    sha: String,
    #[serde(rename = "type")]
    content_type: String,
    content: Option<String>,
    size: usize,
}

impl GitHubServiceImpl {
    pub fn new(settings: Arc<RwLock<Settings>>) -> Self {
        GitHubServiceImpl {
            client: Client::new(),
            settings,
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn handle_rate_limit(&self, headers: &header::HeaderMap) -> Result<(), FileServiceError> {
        if let Some(remaining) = headers.get("X-RateLimit-Remaining") {
            if remaining.to_str().unwrap_or("0") == "0" {
                if let Some(reset) = headers.get("X-RateLimit-Reset") {
                    let reset = reset.to_str().unwrap_or("0").parse::<i64>().unwrap_or(0);
                    let now = Utc::now().timestamp();
                    if reset > now {
                        let wait_time = reset - now;
                        warn!("Rate limit exceeded. Waiting for {} seconds", wait_time);
                        tokio::time::sleep(tokio::time::Duration::from_secs(wait_time as u64)).await;
                    }
                }
            }
        }
        Ok(())
    }
}

#[async_trait]
impl GitHubService for GitHubServiceImpl {
    async fn fetch_file_metadata(&self) -> Result<Vec<GithubFileMetadata>, FileServiceError> {
        let settings = self.settings.read().await;
        let mut all_metadata = Vec::new();
        let mut page = 1;

        loop {
            let url = format!(
                "https://api.github.com/repos/{}/{}/contents/{}?page={}&per_page=100",
                settings.github.github_owner,
                settings.github.github_repo,
                settings.github.github_directory,
                page
            );

            let response = self.client.get(&url).send().await?;
            self.handle_rate_limit(response.headers()).await?;

            if response.status() == StatusCode::OK {
                let content: Vec<GithubContent> = response.json().await?;
                let page_metadata: Vec<GithubFileMetadata> = content.into_iter()
                    .filter(|item| item.content_type == "file")
                    .map(|item| GithubFileMetadata {
                        name: item.path,
                        sha: item.sha,
                    })
                    .collect();

                if page_metadata.is_empty() {
                    break;
                }

                all_metadata.extend(page_metadata);
                page += 1;
            } else {
                return Err(FileServiceError::GitHubApiError(format!("Error fetching file metadata: {}", response.status())));
            }
        }

        Ok(all_metadata)
    }

    async fn fetch_file_content_by_sha(&self, sha: &str) -> Result<String, FileServiceError> {
        let mut cache = self.cache.write().await;
        if let Some((content, timestamp)) = cache.get(sha) {
            if Utc::now() - *timestamp < Duration::seconds(CACHE_DURATION) {
                return Ok(content.clone());
            }
        }

        let settings = self.settings.read().await;
        let url = format!("https://api.github.com/repos/{}/{}/git/blobs/{}", settings.github.github_owner, settings.github.github_repo, sha);
        let response = self.client.get(&url).send().await?;
        self.handle_rate_limit(response.headers()).await?;

        if response.status() == StatusCode::OK {
            let content: GithubContent = response.json().await?;
            let decoded_content = general_purpose::STANDARD.decode(&content.content.unwrap_or_default())?;
            let content_string = String::from_utf8(decoded_content)
                .map_err(|e| FileServiceError::GitHubApiError(format!("Error decoding content: {}", e)))?;
            
            cache.insert(sha.to_string(), (content_string.clone(), Utc::now()));
            Ok(content_string)
        } else {
            Err(FileServiceError::GitHubApiError(format!("Error fetching file content: {}", response.status())))
        }
    }
}

impl FileService {
    pub fn new() -> Self {
        FileService
    }

    pub async fn fetch_and_process_files(
        github_service: &dyn GitHubService,
        _settings: Arc<RwLock<Settings>>,
        metadata_map: &mut HashMap<String, Metadata>,
    ) -> Result<Vec<ProcessedFile>, FileServiceError> {
        let github_files_metadata = github_service.fetch_file_metadata().await?;
        debug!("Fetched {} file metadata from GitHub", github_files_metadata.len());

        let mut processed_files = Vec::new();
        let local_metadata = metadata_map.clone();
        let github_file_names: HashSet<String> = github_files_metadata.iter().map(|f| f.name.clone()).collect();
        
        let removed_files: Vec<String> = local_metadata.keys()
            .filter(|name| !github_file_names.contains(*name))
            .cloned()
            .collect();
        
        for removed_file in removed_files {
            info!("Removing file not present on GitHub: {}", removed_file);
            metadata_map.remove(&removed_file);
        }

        for file_meta in github_files_metadata {
            let local_meta = metadata_map.get(&file_meta.name);
            if let Some(local_meta) = local_meta {
                if local_meta.sha1 == file_meta.sha {
                    debug!("File '{}' is up-to-date. Skipping.", file_meta.name);
                    continue;
                } else {
                    info!("File '{}' has been updated. Fetching new content.", file_meta.name);
                }
            } else {
                info!("New file detected: '{}'. Fetching content.", file_meta.name);
            }

            let content = github_service.fetch_file_content_by_sha(&file_meta.sha).await?;

            let is_public = content.starts_with("public:: true");

            if is_public {
                fs::write(format!("/app/data/markdown/{}", file_meta.name), &content)?;

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

                metadata_map.insert(file_meta.name.clone(), new_metadata.clone());

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

    pub async fn load_or_create_metadata() -> Result<HashMap<String, Metadata>, FileServiceError> {
        if std::path::Path::new(METADATA_PATH).exists() {
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

    pub async fn save_metadata(metadata_map: &HashMap<String, Metadata>) -> Result<(), FileServiceError> {
        let metadata_path = METADATA_PATH;
        
        if let Some(parent_dir) = std::path::Path::new(metadata_path).parent() {
            fs::create_dir_all(parent_dir)?;
            debug!("Ensured directory exists: {}", parent_dir.display());
        }

        let updated_content = serde_json::to_string_pretty(metadata_map)?;
        fs::write(metadata_path, updated_content)?;
        debug!("Updated metadata file at: {}", metadata_path);
        Ok(())
    }

    pub async fn update_metadata(metadata_map: &HashMap<String, Metadata>) -> Result<(), FileServiceError> {
        let existing_metadata = Self::load_or_create_metadata().await?;
        let mut updated_metadata = existing_metadata;

        for (key, value) in metadata_map {
            updated_metadata.insert(key.clone(), value.clone());
        }

        Self::save_metadata(&updated_metadata).await?;
        info!("Updated metadata.json file at {}", METADATA_PATH);

        Ok(())
    }

    fn count_hyperlinks(content: &str) -> usize {
        let re = Regex::new(r"\[.*?\]\(.*?\)").unwrap();
        re.find_iter(content).count()
    }
}
