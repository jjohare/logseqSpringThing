use crate::models::metadata::Metadata;
use crate::config::Settings;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use async_trait::async_trait;
use log::{info, debug, error};
use regex::Regex;
use sha1::{Sha1, Digest};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use chrono::Utc;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Serialize, Deserialize, Clone)]
pub struct GithubFile {
    pub name: String,
    pub content: String,
    pub sha: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProcessedFile {
    pub file_name: String,
    pub content: String,
}

#[async_trait]
pub trait GitHubService: Send + Sync {
    async fn fetch_files(&self) -> Result<Vec<GithubFile>, Box<dyn std::error::Error + Send + Sync>>;
}

pub struct RealGitHubService {
    client: Client,
    token: String,
    owner: String,
    repo: String,
    base_path: String,
}

impl RealGitHubService {
    pub async fn new(settings: Arc<RwLock<Settings>>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let settings = settings.read().await;
        let github_settings = &settings.github;
        if github_settings.github_access_token.is_empty() {
            return Err("GitHub access token is empty".into());
        }
        Ok(Self {
            client: Client::new(),
            token: github_settings.github_access_token.clone(),
            owner: github_settings.github_owner.clone(),
            repo: github_settings.github_repo.clone(),
            base_path: github_settings.github_directory.clone(),
        })
    }

    async fn fetch_directory_contents(&self, path: &str) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("https://api.github.com/repos/{}/{}/contents/{}", self.owner, self.repo, path);
        debug!("Fetching contents from GitHub: {}", url);

        let response = self.client.get(&url)
            .header("Authorization", format!("token {}", self.token))
            .header("User-Agent", "rust-github-api")
            .send()
            .await?;

        debug!("GitHub API response status: {}", response.status());

        let response_body = response.text().await?;
        debug!("GitHub API response body: {}", response_body);

        let contents: Vec<serde_json::Value> = serde_json::from_str(&response_body)
            .map_err(|e| {
                error!("Failed to parse GitHub API response: {}", e);
                format!("Failed to parse GitHub API response: {}. Response body: {}", e, response_body)
            })?;

        Ok(contents)
    }

    async fn fetch_file_content(&self, download_url: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let content = self.client.get(download_url)
            .header("Authorization", format!("token {}", self.token))
            .header("User-Agent", "rust-github-api")
            .send()
            .await?
            .text()
            .await?;
        Ok(content)
    }
}

#[async_trait]
impl GitHubService for RealGitHubService {
    async fn fetch_files(&self) -> Result<Vec<GithubFile>, Box<dyn std::error::Error + Send + Sync>> {
        let mut github_files = Vec::new();
        
        let contents = self.fetch_directory_contents(&self.base_path).await?;
    
        for item in contents {
            let name = item["name"].as_str().unwrap_or("");
            let item_type = item["type"].as_str().unwrap_or("");
    
            if item_type == "file" && name.ends_with(".md") {
                if let Some(download_url) = item["download_url"].as_str() {
                    debug!("Fetching content for file: {}", name);
                    let content = self.fetch_file_content(download_url).await?;
                    let sha = item["sha"].as_str().unwrap_or("").to_string();
    
                    github_files.push(GithubFile {
                        name: name.to_string(),
                        content,
                        sha,
                    });
                    debug!("Added file to github_files: {}", name);
                }
            } else {
                debug!("Skipping non-markdown file or directory: {}", name);
            }
        }
    
        debug!("Fetched {} markdown files from GitHub", github_files.len());
        Ok(github_files)
    }
}

pub struct FileService;

impl FileService {
    pub async fn fetch_and_process_files(
        github_service: &dyn GitHubService,
        settings: Arc<RwLock<Settings>>,
    ) -> Result<Vec<ProcessedFile>, Box<dyn std::error::Error + Send + Sync>> {
        let github_files = github_service.fetch_files().await?;
        debug!("Fetched {} files from GitHub", github_files.len());

        let mut metadata_map = HashMap::new();
        for file in &github_files {
            metadata_map.insert(file.name.clone(), Metadata {
                file_name: file.name.clone(),
                file_size: file.content.len(),
                hyperlink_count: Self::count_hyperlinks(&file.content),
                sha1: file.sha.clone(),
                last_modified: Utc::now(),
                perplexity_link: String::new(),
                last_perplexity_process: None,
                topic_counts: HashMap::new(),
            });
        }
        
        let processed_files = Self::process_files(github_files, settings, &mut metadata_map).await?;
        debug!("Processed {} files", processed_files.len());

        Self::save_metadata(&metadata_map)?;

        Ok(processed_files)
    }

    async fn process_files(
        github_files: Vec<GithubFile>,
        _settings: Arc<RwLock<Settings>>,
        metadata_map: &mut HashMap<String, Metadata>,
    ) -> Result<Vec<ProcessedFile>, Box<dyn std::error::Error + Send + Sync>> {
        let mut processed_files = Vec::new();
    
        for file in &github_files {
            if Self::should_process_file(file) {
                debug!("Processing file: {}", file.name);
                let stripped_content = Self::strip_double_brackets(&file.content);
                let processed_content = Self::process_against_topics(&stripped_content, metadata_map);
    
                let processed_file = ProcessedFile {
                    file_name: file.name.clone(),
                    content: processed_content.clone(),
                };
    
                let new_metadata = Metadata {
                    file_name: file.name.clone(),
                    file_size: file.content.len(),
                    hyperlink_count: Self::count_hyperlinks(&file.content),
                    sha1: file.sha.clone(),
                    last_modified: Utc::now(),
                    perplexity_link: String::new(),
                    last_perplexity_process: None,
                    topic_counts: Self::count_topics(&processed_content, metadata_map),
                };
    
                metadata_map.insert(file.name.clone(), new_metadata);
                processed_files.push(processed_file);
            } else {
                debug!("Skipping file: {}", file.name);
            }
        }
    
        Ok(processed_files)
    }
        
    fn count_topics(content: &str, metadata_map: &HashMap<String, Metadata>) -> HashMap<String, usize> {
        metadata_map.keys()
            .filter_map(|file_name| {
                let topic = file_name.trim_end_matches(".md");
                let count = content.matches(topic).count();
                if count > 0 {
                    Some((topic.to_string(), count))
                } else {
                    None
                }
            })
            .collect()
    }

    fn save_metadata(metadata_map: &HashMap<String, Metadata>) -> Result<(), std::io::Error> {
        let metadata_path = "/app/data/markdown/metadata.json";
        let metadata_without_content: HashMap<_, _> = metadata_map.iter()
            .map(|(key, value)| (key.clone(), Metadata {
                file_name: value.file_name.clone(),
                file_size: value.file_size,
                hyperlink_count: value.hyperlink_count,
                sha1: value.sha1.clone(),
                last_modified: value.last_modified,
                perplexity_link: value.perplexity_link.clone(),
                last_perplexity_process: value.last_perplexity_process,
                topic_counts: value.topic_counts.clone(),
            }))
            .collect();

        let updated_content = serde_json::to_string_pretty(&metadata_without_content)?;
        fs::write(metadata_path, updated_content)?;
        debug!("Updated metadata file at: {}", metadata_path);
        Ok(())
    }

    fn should_process_file(file: &GithubFile) -> bool {
        let first_line = file.content.lines().next().unwrap_or("").trim();
        first_line == "public:: true"
    }

    fn calculate_sha1(content: &str) -> String {
        let mut hasher = Sha1::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    fn load_local_metadata() -> Result<HashMap<String, Metadata>, Box<dyn std::error::Error + Send + Sync>> {
        let metadata_path = "/app/data/markdown/metadata.json";

        if Path::new(metadata_path).exists() {
            let metadata_content = fs::read_to_string(metadata_path)?;
            let metadata: HashMap<String, Metadata> = serde_json::from_str(&metadata_content)?;
            Ok(metadata)
        } else {
            Ok(HashMap::new())
        }
    }

    fn strip_double_brackets(content: &str) -> String {
        let re = Regex::new(r"\[\[(.*?)\]\]").unwrap();
        re.replace_all(content, "$1").to_string()
    }

    fn count_hyperlinks(content: &str) -> usize {
        let re = Regex::new(r"\[.*?\]\(.*?\)").unwrap();
        re.find_iter(content).count()
    }

    fn process_against_topics(content: &str, metadata_map: &HashMap<String, Metadata>) -> String {
        let mut processed_content = content.to_string();
        for topic in metadata_map.keys() {
            let topic_name = topic.trim_end_matches(".md");
            if content.contains(topic_name) {
                processed_content.push_str(&format!("\nRelated to topic: {}", topic_name));
            }
        }
        processed_content
    }

    pub fn save_file_metadata(metadata: Metadata) -> Result<(), std::io::Error> {
        info!("Saving metadata for file: {}", metadata.file_name);

        let markdown_path = format!("/app/data/markdown/{}", metadata.file_name);

        if let Some(parent) = Path::new(&markdown_path).parent() {
            fs::create_dir_all(parent)?;
            debug!("Ensured directory exists: {}", parent.display());
        }

        fs::write(&markdown_path, &metadata.perplexity_link)?;
        debug!("Written processed content to: {}", markdown_path);

        Self::update_metadata_file(&metadata)?;

        Ok(())
    }

    fn update_metadata_file(metadata: &Metadata) -> Result<(), std::io::Error> {
        let metadata_path = "/app/data/markdown/metadata.json";

        let mut metadata_map = if Path::new(metadata_path).exists() {
            let content = fs::read_to_string(metadata_path)?;
            serde_json::from_str::<HashMap<String, Metadata>>(&content)?
        } else {
            HashMap::new()
        };

        metadata_map.insert(metadata.file_name.clone(), metadata.clone());

        let updated_content = serde_json::to_string_pretty(&metadata_map)?;

        fs::write(metadata_path, updated_content)?;
        debug!("Updated metadata file at: {}", metadata_path);

        Ok(())
    }
}
