use crate::models::metadata::Metadata;
use crate::config::Settings;
use serde::{Deserialize, Serialize};
use reqwest::{Client, header::{HeaderMap, HeaderValue, IF_NONE_MATCH, ETAG}};
use async_trait::async_trait;
use log::{info, debug, error, warn};
use regex::Regex;
use sha1::{Sha1, Digest};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use chrono::{Utc, DateTime};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::error::Error as StdError;
use futures::stream::{self, StreamExt};
use std::time::Duration;
use tokio::time::sleep;

const METADATA_PATH: &str = "data/markdown/metadata.json";
const MARKDOWN_DIR: &str = "data/markdown";
const CACHE_DURATION: Duration = Duration::from_secs(300); // 5 minutes
const MAX_CONCURRENT_DOWNLOADS: usize = 5;
const GITHUB_API_DELAY: Duration = Duration::from_millis(100); // Rate limiting delay

#[derive(Serialize, Deserialize, Clone)]
pub struct GithubFile {
    pub name: String,
    pub content: String,
    pub sha: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GithubFileMetadata {
    pub name: String,
    pub sha: String,
    pub download_url: String,
    #[serde(skip)]
    pub etag: Option<String>,
    #[serde(with = "chrono::serde::ts_seconds_option")]
    pub last_checked: Option<DateTime<Utc>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessedFile {
    pub file_name: String,
    pub content: String,
    pub is_public: bool,
    pub metadata: Metadata,
}

#[derive(Debug, Serialize, Deserialize)]
struct TreeResponse {
    sha: String,
    tree: Vec<TreeItem>,
    truncated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct TreeItem {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    item_type: String,
    sha: String,
    url: Option<String>,
}

#[async_trait]
pub trait GitHubService: Send + Sync {
    async fn fetch_file_metadata(&self) -> Result<Vec<GithubFileMetadata>, Box<dyn StdError + Send + Sync>>;
    async fn get_download_url(&self, file_name: &str) -> Result<Option<String>, Box<dyn StdError + Send + Sync>>;
    async fn fetch_file_content(&self, download_url: &str) -> Result<String, Box<dyn StdError + Send + Sync>>;
}

pub struct RealGitHubService {
    client: Client,
    token: String,
    owner: String,
    repo: String,
    base_path: String,
    metadata_cache: Arc<RwLock<HashMap<String, GithubFileMetadata>>>,
}

impl RealGitHubService {
    pub async fn new(settings: Arc<RwLock<Settings>>) -> Result<Self, Box<dyn StdError + Send + Sync>> {
        let settings = settings.read().await;
        let github_settings = &settings.github;
        if github_settings.github_access_token.is_empty() {
            return Err("GitHub access token is empty".into());
        }

        let mut headers = HeaderMap::new();
        headers.insert("User-Agent", HeaderValue::from_static("rust-github-api"));
        
        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()?;

        Ok(Self {
            client,
            token: github_settings.github_access_token.clone(),
            owner: github_settings.github_owner.clone(),
            repo: github_settings.github_repo.clone(),
            base_path: github_settings.github_directory.clone(),
            metadata_cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    async fn fetch_directory_contents(&self) -> Result<Vec<GithubFileMetadata>, Box<dyn StdError + Send + Sync>> {
        // First, check the cache
        {
            let cache = self.metadata_cache.read().await;
            let now = Utc::now();
            
            // If cache is fresh and not empty, use it
            if !cache.is_empty() {
                if let Some(first_item) = cache.values().next() {
                    if let Some(last_checked) = first_item.last_checked {
                        if (now - last_checked) < chrono::Duration::from_std(CACHE_DURATION).unwrap() {
                            debug!("Using cached metadata for files");
                            return Ok(cache.values().cloned().collect());
                        }
                    }
                }
            }
        }

        // Cache is stale or empty, fetch from GitHub
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            self.owner, self.repo, self.base_path
        );

        let response = self.client.get(&url)
            .header("Authorization", format!("token {}", self.token))
            .send()
            .await?;

        let contents: Vec<serde_json::Value> = response.json().await?;
        
        let markdown_files: Vec<GithubFileMetadata> = contents.into_iter()
            .filter(|item| {
                let is_file = item["type"].as_str().unwrap_or("") == "file";
                let name = item["name"].as_str().unwrap_or("");
                is_file && name.ends_with(".md")
            })
            .map(|item| {
                GithubFileMetadata {
                    name: item["name"].as_str().unwrap_or("").to_string(),
                    sha: item["sha"].as_str().unwrap_or("").to_string(),
                    download_url: item["download_url"].as_str().unwrap_or("").to_string(),
                    etag: None,
                    last_checked: Some(Utc::now()),
                }
            })
            .collect();

        // Update cache
        {
            let mut cache = self.metadata_cache.write().await;
            cache.clear();
            for metadata in &markdown_files {
                cache.insert(metadata.name.clone(), metadata.clone());
            }
        }

        debug!("Found {} markdown files in target directory", markdown_files.len());
        Ok(markdown_files)
    }

    async fn fetch_file_content(&self, download_url: &str) -> Result<String, Box<dyn StdError + Send + Sync>> {
        let mut headers = HeaderMap::new();
        headers.insert("Authorization", HeaderValue::from_str(&format!("token {}", self.token))?);

        // Get cached ETag if available
        let etag = {
            let cache = self.metadata_cache.read().await;
            cache.values()
                .find(|m| m.download_url == download_url)
                .and_then(|m| m.etag.clone())
        };

        if let Some(etag) = etag {
            headers.insert(IF_NONE_MATCH, HeaderValue::from_str(&etag)?);
        }

        let response = self.client.get(download_url)
            .headers(headers)
            .send()
            .await?;

        // Update ETag in cache if provided
        if let Some(new_etag) = response.headers().get(ETAG) {
            let mut cache = self.metadata_cache.write().await;
            if let Some(metadata) = cache.values_mut().find(|m| m.download_url == download_url) {
                metadata.etag = Some(new_etag.to_str()?.to_string());
            }
        }

        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            // Use cached content
            let path = format!("{}/{}", MARKDOWN_DIR, download_url.split('/').last().unwrap_or(""));
            if let Ok(content) = fs::read_to_string(&path) {
                return Ok(content);
            }
        }

        let content = response.text().await?;
        Ok(content)
    }

    pub async fn fetch_file_metadata(&self) -> Result<Vec<GithubFileMetadata>, Box<dyn StdError + Send + Sync>> {
        self.fetch_directory_contents().await
    }

    async fn get_download_url(&self, file_name: &str) -> Result<Option<String>, Box<dyn StdError + Send + Sync>> {
        // Check cache first
        {
            let cache = self.metadata_cache.read().await;
            if let Some(metadata) = cache.get(file_name) {
                return Ok(Some(metadata.download_url.clone()));
            }
        }

        let url = format!("https://api.github.com/repos/{}/{}/contents/{}/{}", 
            self.owner, self.repo, self.base_path, file_name);

        let response = self.client.get(&url)
            .header("Authorization", format!("token {}", self.token))
            .send()
            .await?;

        if response.status().is_success() {
            let json: serde_json::Value = response.json().await?;
            Ok(json["download_url"].as_str().map(|s| s.to_string()))
        } else {
            Ok(None)
        }
    }
}

#[async_trait]
impl GitHubService for RealGitHubService {
    async fn fetch_file_metadata(&self) -> Result<Vec<GithubFileMetadata>, Box<dyn StdError + Send + Sync>> {
        self.fetch_file_metadata().await
    }

    async fn get_download_url(&self, file_name: &str) -> Result<Option<String>, Box<dyn StdError + Send + Sync>> {
        self.get_download_url(file_name).await
    }

    async fn fetch_file_content(&self, download_url: &str) -> Result<String, Box<dyn StdError + Send + Sync>> {
        self.fetch_file_content(download_url).await
    }
}

pub struct FileService;

impl FileService {
    /// Check if we have a valid local setup
    fn has_valid_local_setup() -> bool {
        // Check if metadata.json exists and is not empty
        if let Ok(metadata_content) = fs::read_to_string(METADATA_PATH) {
            if metadata_content.trim().is_empty() {
                return false;
            }
            
            // Try to parse metadata to ensure it's valid
            if let Ok(metadata_map) = serde_json::from_str::<HashMap<String, Metadata>>(&metadata_content) {
                if metadata_map.is_empty() {
                    return false;
                }
                
                // Check if the markdown files referenced in metadata actually exist
                for (filename, _) in metadata_map {
                    let file_path = format!("{}/{}", MARKDOWN_DIR, filename);
                    if !Path::new(&file_path).exists() {
                        return false;
                    }
                }
                
                return true;
            }
        }
        false
    }

    /// Initialize the local markdown directory and metadata structure.
    pub async fn initialize_local_storage(
        github_service: &dyn GitHubService,
        settings: Arc<RwLock<Settings>>,
    ) -> Result<(), Box<dyn StdError + Send + Sync>> {
        info!("Checking local storage status");
        
        // Ensure directories exist
        Self::ensure_directories()?;

        // Check if we have a valid local setup
        if Self::has_valid_local_setup() {
            info!("Valid local setup found. Skipping initialization.");
            return Ok(());
        }

        info!("Initializing local storage with files from GitHub");

        // Get topics from settings
        let settings = settings.read().await;
        let topics = settings.topics.clone();

        // Step 1: Get all markdown files from GitHub
        let github_files = github_service.fetch_file_metadata().await?;
        info!("Found {} markdown files in GitHub", github_files.len());

        let mut metadata_map = HashMap::new();
        let mut processed_count = 0;
        let mut total_files = 0;

        // Step 2: Download and process each file
        for file_meta in github_files {
            total_files += 1;
            
            // Download file content
            match github_service.fetch_file_content(&file_meta.download_url).await {
                Ok(content) => {
                    // Check if file starts with "public:: true"
                    let first_line = content.lines().next().unwrap_or("").trim();
                    if first_line != "public:: true" {
                        debug!("Skipping non-public file: {}", file_meta.name);
                        continue;
                    }

                    let file_path = format!("{}/{}", MARKDOWN_DIR, file_meta.name);
                    
                    // Calculate SHA1 of content
                    let local_sha1 = Self::calculate_sha1(&content);
                    
                    // Save file content
                    fs::write(&file_path, &content)?;
                    processed_count += 1;

                    // Extract topics from content
                    let topic_counts = Self::extract_topics(&content, &topics);

                    // Create metadata entry
                    let metadata = Metadata {
                        file_name: file_meta.name.clone(),
                        file_size: content.len(),
                        hyperlink_count: Self::count_hyperlinks(&content),
                        sha1: local_sha1,
                        last_modified: Utc::now(),
                        perplexity_link: String::new(),
                        last_perplexity_process: None,
                        topic_counts,
                    };

                    metadata_map.insert(file_meta.name.clone(), metadata);
                    info!("Processed public file: {}", file_meta.name);
                }
                Err(e) => {
                    error!("Failed to fetch content for {}: {}", file_meta.name, e);
                }
            }

            // Add delay for rate limiting
            sleep(GITHUB_API_DELAY).await;
        }

        // Step 3: Save metadata
        info!("Saving metadata for {} public files", metadata_map.len());
        Self::save_metadata(&metadata_map)?;

        info!("Initialization complete. Found {} total files, processed {} public files", 
            total_files, processed_count);

        Ok(())
    }

    /// Extract topics from content
    fn extract_topics(content: &str, topics: &[String]) -> HashMap<String, usize> {
        let mut topic_counts = HashMap::new();
        
        // Convert content to lowercase for case-insensitive matching
        let content_lower = content.to_lowercase();
        
        for topic in topics {
            let topic_lower = topic.to_lowercase();
            let count = content_lower.matches(&topic_lower).count();
            if count > 0 {
                topic_counts.insert(topic.clone(), count);
            }
        }
        
        topic_counts
    }

    /// Ensures all required directories exist
    fn ensure_directories() -> Result<(), std::io::Error> {
        debug!("Ensuring required directories exist");
        fs::create_dir_all(MARKDOWN_DIR)?;
        if let Some(parent_dir) = Path::new(METADATA_PATH).parent() {
            fs::create_dir_all(parent_dir)?;
        }
        Ok(())
    }

    /// Handles incremental updates after initial setup
    pub async fn fetch_and_process_files(
        github_service: &dyn GitHubService,
        settings: Arc<RwLock<Settings>>,
        metadata_map: &mut HashMap<String, Metadata>,
    ) -> Result<Vec<ProcessedFile>, Box<dyn StdError + Send + Sync>> {
        // Ensure directories exist before any operations
        Self::ensure_directories()?;

        // Get topics from settings
        let settings = settings.read().await;
        let topics = settings.topics.clone();

        // Get metadata for markdown files in target directory
        let github_files_metadata = github_service.fetch_file_metadata().await?;
        debug!("Fetched metadata for {} markdown files", github_files_metadata.len());

        let mut processed_files = Vec::new();
        let local_metadata = metadata_map.clone();
        
        // Clean up removed files
        let github_file_names: HashSet<String> = github_files_metadata.iter()
            .map(|f| f.name.clone())
            .collect();
        
        let removed_files: Vec<String> = local_metadata.keys()
            .filter(|name| !github_file_names.contains(*name))
            .cloned()
            .collect();
        
        for removed_file in removed_files {
            info!("Removing file not present on GitHub: {}", removed_file);
            metadata_map.remove(&removed_file);
            // Also remove the local file if it exists
            let file_path = format!("{}/{}", MARKDOWN_DIR, removed_file);
            if Path::new(&file_path).exists() {
                if let Err(e) = fs::remove_file(&file_path) {
                    error!("Failed to remove file {}: {}", file_path, e);
                }
            }
        }

        // Process files in parallel with rate limiting
        let files_to_process: Vec<_> = github_files_metadata.into_iter()
            .filter(|file_meta| {
                let local_meta = metadata_map.get(&file_meta.name);
                local_meta.map_or(true, |local_meta| local_meta.sha1 != file_meta.sha)
            })
            .collect();

        let results = stream::iter(files_to_process)
            .map(|file_meta| {
                let github_service = github_service;
                let topics = topics.clone();
                async move {
                    // Add delay for rate limiting
                    sleep(GITHUB_API_DELAY).await;

                    // Download content
                    match github_service.fetch_file_content(&file_meta.download_url).await {
                        Ok(content) => {
                            // Check if file starts with "public:: true"
                            let first_line = content.lines().next().unwrap_or("").trim();
                            if first_line != "public:: true" {
                                debug!("Skipping non-public file: {}", file_meta.name);
                                return Ok(None);
                            }
                            
                            let file_path = format!("{}/{}", MARKDOWN_DIR, file_meta.name);
                            fs::write(&file_path, &content)?;
                            
                            // Extract topics from content
                            let topic_counts = Self::extract_topics(&content, &topics);

                            let new_metadata = Metadata {
                                file_name: file_meta.name.clone(),
                                file_size: content.len(),
                                hyperlink_count: Self::count_hyperlinks(&content),
                                sha1: file_meta.sha.clone(),
                                last_modified: Utc::now(),
                                perplexity_link: String::new(),
                                last_perplexity_process: None,
                                topic_counts,
                            };
                            
                            Ok(Some(ProcessedFile {
                                file_name: file_meta.name,
                                content,
                                is_public: true,
                                metadata: new_metadata,
                            }))
                        }
                        Err(e) => {
                            error!("Failed to fetch content: {}", e);
                            Err(e)
                        }
                    }
                }
            })
            .buffer_unordered(MAX_CONCURRENT_DOWNLOADS)
            .collect::<Vec<_>>()
            .await;

        // Process results
        for result in results {
            match result {
                Ok(Some(processed_file)) => {
                    let file_name = processed_file.file_name.clone();
                    metadata_map.insert(file_name.clone(), processed_file.metadata.clone());
                    processed_files.push(processed_file);
                    debug!("Successfully processed public file: {}", file_name);
                }
                Ok(None) => {} // Skip non-public files
                Err(e) => error!("Error processing file: {}", e),
            }
        }

        // Save updated metadata
        Self::save_metadata(metadata_map)?;
        debug!("Processed {} files after optimization", processed_files.len());
        Ok(processed_files)
    }

    pub fn load_or_create_metadata() -> Result<HashMap<String, Metadata>, Box<dyn StdError + Send + Sync>> {
        // Ensure directories exist before attempting to read/write metadata
        Self::ensure_directories()?;

        if Path::new(METADATA_PATH).exists() {
            let metadata_content = fs::read_to_string(METADATA_PATH)?;
            if metadata_content.trim().is_empty() {
                Ok(HashMap::new())
            } else {
                let metadata: HashMap<String, Metadata> = serde_json::from_str(&metadata_content)?;
                Ok(metadata)
            }
        } else {
            debug!("metadata.json not found. Creating a new one.");
            let empty_metadata = HashMap::new();
            Self::save_metadata(&empty_metadata)?;
            Ok(empty_metadata)
        }
    }

    pub fn save_metadata(metadata_map: &HashMap<String, Metadata>) -> Result<(), std::io::Error> {
        // Ensure directories exist before saving
        Self::ensure_directories()?;
        
        let updated_content = serde_json::to_string_pretty(metadata_map)?;
        fs::write(METADATA_PATH, updated_content)?;
        debug!("Updated metadata file at: {}", METADATA_PATH);
        Ok(())
    }

    pub fn update_metadata(metadata_map: &HashMap<String, Metadata>) -> Result<(), Box<dyn StdError + Send + Sync>> {
        // Ensure directories exist before updating
        Self::ensure_directories()?;

        let existing_metadata = Self::load_or_create_metadata()?;
        let mut updated_metadata = existing_metadata;

        for (key, value) in metadata_map {
            updated_metadata.insert(key.clone(), value.clone());
        }

        Self::save_metadata(&updated_metadata)?;
        info!("Updated metadata.json file at {}", METADATA_PATH);

        Ok(())
    }

    fn calculate_sha1(content: &str) -> String {
        let mut hasher = Sha1::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn count_hyperlinks(content: &str) -> usize {
        let re = Regex::new(r"\[.*?\]\(.*?\)").unwrap();
        re.find_iter(content).count()
    }
}
