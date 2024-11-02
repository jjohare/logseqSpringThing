use std::io;
use regex::Regex;
use serde::{Serialize, Deserialize};
use reqwest::Client;
use tokio::time::{sleep, Duration};
use tokio::sync::Semaphore;
use log::error;
use thiserror::Error;
use lazy_static::lazy_static;
use std::env;
use pulldown_cmark::{Parser, Event, Tag};
use async_trait::async_trait;
use config::ConfigError;

use crate::config::Settings;
use crate::services::file_service::ProcessedFile;

#[derive(Error, Debug)]
pub enum PerplexityError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("HTTP request error: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("API error: {0}")]
    Api(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Environment variable error: {0}")]
    EnvVar(#[from] env::VarError),
    #[error("Configuration error: {0}")]
    Config(#[from] ConfigError),
}

lazy_static! {
    static ref API_CLIENT: Client = Client::builder()
        .timeout(Duration::from_secs(
            env::var("API_CLIENT_TIMEOUT")
                .unwrap_or_else(|_| "30".to_string())
                .parse()
                .expect("API_CLIENT_TIMEOUT must be a valid u64")
        ))
        .build()
        .expect("Failed to build API client");

    static ref REQUEST_SEMAPHORE: Semaphore = Semaphore::new(
        env::var("MAX_CONCURRENT_REQUESTS")
            .unwrap_or_else(|_| "5".to_string())
            .parse::<usize>()
            .expect("MAX_CONCURRENT_REQUESTS must be a valid usize")
    );
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PerplexityRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub return_citations: Option<bool>,
    pub stream: Option<bool>,
    pub presence_penalty: Option<f32>,
    pub frequency_penalty: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct PerplexityResponse {
    pub id: Option<String>,
    pub model: Option<String>,
    pub object: Option<String>,
    pub created: Option<u64>,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    #[serde(default)]
    pub index: u32,
    pub finish_reason: Option<String>,
    pub message: Message,
    pub delta: Option<Delta>,
}

#[derive(Debug, Deserialize)]
pub struct Delta {
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[async_trait]
pub trait ApiClient: Send + Sync {
    async fn post_json(
        &self,
        url: &str,
        body: &PerplexityRequest,
        perplexity_api_key: &str,
    ) -> Result<String, PerplexityError>;
}

pub struct ApiClientImpl {
    client: Client,
}

impl ApiClientImpl {
    /// Creates a new instance of `ApiClientImpl`.
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }
}

#[async_trait]
impl ApiClient for ApiClientImpl {
    async fn post_json(
        &self,
        url: &str,
        body: &PerplexityRequest,
        perplexity_api_key: &str,
    ) -> Result<String, PerplexityError> {
        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", perplexity_api_key))
            .json(body)
            .send()
            .await?
            .text()
            .await?;
        Ok(response)
    }
}

/// Processes Markdown content by enhancing it using the Perplexity API.
///
/// # Arguments
///
/// * `file_content` - The original Markdown content.
/// * `settings` - Application settings containing prompts and topics.
/// * `api_client` - An instance implementing the `ApiClient` trait.
///
/// # Returns
///
/// A `Result` containing the processed Markdown content or an error.
pub async fn process_markdown(file_content: &str, _settings: &Settings, _api_client: &dyn ApiClient) -> Result<String, PerplexityError> {
    // TEMPORARY DISABLE: Perplexity processing is currently disabled.
    // The function now returns the original content without any processing.
    // To re-enable, remove this comment and restore the original implementation.
    Ok(file_content.to_string())
}

/// Sends a request to the Perplexity API and retrieves the response.
///
/// # Arguments
///
/// * `prompt` - The system prompt for the AI.
/// * `context` - Relevant context extracted from the Markdown content.
/// * `topics` - List of relevant topics.
/// * `api_client` - An instance implementing the `ApiClient` trait.
/// * `perplexity_settings` - Configuration settings for the Perplexity API.
///
/// # Returns
///
/// A `Result` containing the AI's response or an error.
pub async fn call_perplexity_api(
    prompt: &str,
    context: &[String],
    topics: &[String],
    api_client: &dyn ApiClient,
    perplexity_settings: &crate::config::PerplexitySettings,
) -> Result<String, PerplexityError> {
    let _permit = REQUEST_SEMAPHORE.acquire().await.unwrap();

    let max_retries: u32 = env::var("MAX_RETRIES").unwrap_or_else(|_| "3".to_string()).parse().unwrap_or(3);
    let retry_delay: u64 = env::var("RETRY_DELAY").unwrap_or_else(|_| "5".to_string()).parse().unwrap_or(5);

    let system_message = format!(
        "{}\nRelevant category topics are: {}.",
        prompt.trim(),
        topics.join(", ")
    );

    let request = PerplexityRequest {
        model: perplexity_settings.perplexity_model.clone(),
        messages: vec![
            Message {
                role: "system".to_string(),
                content: system_message,
            },
            Message {
                role: "user".to_string(),
                content: format!(
                    "Context:\n{}",
                    context.join("\n")
                ),
            },
        ],
        max_tokens: Some(perplexity_settings.perplexity_max_tokens),
        temperature: Some(perplexity_settings.perplexity_temperature),
        top_p: Some(perplexity_settings.perplexity_top_p),
        return_citations: Some(false),
        stream: Some(false),
        presence_penalty: Some(perplexity_settings.perplexity_presence_penalty),
        frequency_penalty: Some(perplexity_settings.perplexity_frequency_penalty),
    };

    for attempt in 1..=max_retries {
        match api_client.post_json(&perplexity_settings.perplexity_api_base_url, &request, &perplexity_settings.perplexity_api_key).await {
            Ok(response_text) => {
                return parse_perplexity_response(&response_text);
            }
            Err(e) => {
                error!("API request encountered an error: {} on attempt {} of {}", e, attempt, max_retries);
                if attempt < max_retries {
                    sleep(Duration::from_secs(retry_delay)).await;
                    continue;
                } else {
                    return Err(e);
                }
            }
        }
    }

    Err(PerplexityError::Api("Max retries reached, API request failed".to_string()))
}

/// Parses the response from the Perplexity API.
///
/// # Arguments
///
/// * `response_text` - The raw response text from the API.
///
/// # Returns
///
/// A `Result` containing the AI's response content or an error.
fn parse_perplexity_response(response_text: &str) -> Result<String, PerplexityError> {
    match serde_json::from_str::<PerplexityResponse>(response_text) {
        Ok(parsed_response) => {
            if let Some(message) = parsed_response.choices.first().map(|choice| &choice.message) {
                Ok(message.content.clone())
            } else {
                Err(PerplexityError::Api("No content in API response".to_string()))
            }
        }
        Err(e) => {
            error!("Failed to parse API response: {}", e);
            error!("Raw response: {}", response_text);
            Err(PerplexityError::Serialization(e))
        }
    }
}

/// Splits the Markdown content into meaningful blocks based on headings and list items.
///
/// # Arguments
///
/// * `content` - The full Markdown content.
///
/// # Returns
///
/// A vector of Markdown blocks as strings.
fn split_markdown_blocks(content: &str) -> Vec<String> {
    let parser = Parser::new(content);
    let mut blocks = Vec::new();
    let mut current_block = String::new();

    for event in parser {
        match event {
            Event::Start(tag) => match tag {
                Tag::Heading(_, _, _) | Tag::Item => {
                    if !current_block.is_empty() {
                        blocks.push(current_block.clone());
                        current_block.clear();
                    }
                },
                _ => {},
            },
            Event::Text(text) => {
                current_block.push_str(&text);
            },
            Event::End(tag) => match tag {
                Tag::Paragraph | Tag::Heading(_, _, _) | Tag::Item => {
                    if !current_block.is_empty() {
                        blocks.push(current_block.clone());
                        current_block.clear();
                    }
                },
                _ => {},
            },
            _ => {},
        }
    }

    if !current_block.is_empty() {
        blocks.push(current_block);
    }

    blocks
}

/// Selects relevant context blocks for processing.
///
/// Currently, this function returns the active block, but can be enhanced to include surrounding context.
///
/// # Arguments
///
/// * `_content` - The full Markdown content.
/// * `active_block` - The block currently being processed.
///
/// # Returns
///
/// A vector of context blocks as strings.
pub fn select_context_blocks(_content: &str, active_block: &str) -> Vec<String> {
    vec![active_block.to_string()]
}

/// Cleans LogSeq-style links by removing double brackets.
///
/// # Arguments
///
/// * `input` - The input string containing LogSeq links.
///
/// # Returns
///
/// A new string with double brackets removed.
pub fn clean_logseq_links(input: &str) -> String {
    let re = Regex::new(r"\[\[(.*?)\]\]").unwrap();
    re.replace_all(input, "$1").to_string()
}

/// Processes a single Markdown block by appending AI-generated content.
///
/// # Arguments
///
/// * `input` - The original Markdown block.
/// * `prompt` - The system prompt for the AI.
/// * `topics` - List of relevant topics.
/// * `api_response` - The AI-generated response.
///
/// # Returns
///
/// A new string containing the processed Markdown block.
pub fn process_markdown_block(input: &str, prompt: &str, topics: &[String], api_response: &str) -> String {
    let cleaned_input = clean_logseq_links(input);

    format!(
        "- ```\n{}```\nPrompt: {}\nTopics: {}\nResponse: {}",
        cleaned_input.trim_start_matches("- ").trim_end(),
        prompt,
        topics.join(", "),
        api_response
    )
}

#[async_trait]
pub trait PerplexityService: Send + Sync {
    /// Processes a file's content using the Perplexity API.
    ///
    /// # Arguments
    ///
    /// * `file_content` - The original Markdown content.
    /// * `settings` - Application settings.
    /// * `api_client` - An instance implementing the `ApiClient` trait.
    ///
    /// # Returns
    ///
    /// A `Result` containing the processed file or an error.
    async fn process_file(&self, file_content: String, settings: &Settings, api_client: &dyn ApiClient) -> Result<ProcessedFile, PerplexityError>;
}

/// Implementation of the PerplexityService.
pub struct PerplexityServiceImpl;

impl PerplexityServiceImpl {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl PerplexityService for PerplexityServiceImpl {
    async fn process_file(&self, file_content: String, settings: &Settings, api_client: &dyn ApiClient) -> Result<ProcessedFile, PerplexityError> {
        let processed_content = process_markdown(&file_content, settings, api_client).await?;
        Ok(ProcessedFile {
            file_name: "processed.md".to_string(),
            content: processed_content,
            is_public: true, // or true, depending on your requirements
            metadata: Default::default(), // or provide appropriate metadata
        })
    }
}