use clap::Parser;
use serde::Deserialize;
use sonata_piper::PiperSynthesisConfig;
use sonata_synth::{
    AudioOutputConfig, AudioSamples, SonataModel, SonataResult, SonataSpeechSynthesizer,
};
use std::fs::File;
use std::io::{self, prelude::*};
use std::path::PathBuf;

static INIT_ORT_ENVIRONMENT: std::sync::Once = std::sync::Once::new();

#[derive(Clone, Default, Deserialize)]
enum SynthesisMode {
    #[default]
    Lazy,
    Parallel,
    Realtime,
}

impl<'s> From<&'s str> for SynthesisMode {
    fn from(other: &'s str) -> Self {
        match other.to_lowercase().as_str() {
            "lazy" => Self::Lazy,
            "parallel" => Self::Parallel,
            "realtime" => Self::Realtime,
            _ => panic!("Unknown synthesis mode: `{}`", other),
        }
    }
}

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Model config
    config: PathBuf,
    /// Input text file (default `stdin`)
    #[arg(short = 'f', long, value_name = "INPUT_FILE")]
    input_file: Option<PathBuf>,
    /// Output file (default `stdout`)
    #[arg(short, long, value_name = "OUTPUT_FILE")]
    output_file: Option<PathBuf>,
    /// Synthesis mode (default `Lazy`)
    #[arg(long)]
    mode: Option<SynthesisMode>,
    /// Speaker ID for multi-speaker models (default `0`)
    #[arg(long)]
    speaker_id: Option<u32>,
    /// Piper length scale (default `model_default from config file`)
    #[arg(long)]
    length_scale: Option<f32>,
    /// Piper noise scale (default `model_default from config file`)
    #[arg(long)]
    noise_scale: Option<f32>,
    /// Piper noise width (default `model_default from config file`)
    #[arg(long)]
    noise_w: Option<f32>,
    /// Speaking rate [0 - 100] (default `50`)
    #[arg(long)]
    rate: Option<u8>,
    /// Speech pitch [0 - 100] (default `50`)
    #[arg(long)]
    pitch: Option<u8>,
    /// Speech volume [0 - 100] (default `75`)
    #[arg(long)]
    volume: Option<u8>,
    /// Extra silence (in milliseconds) to append to the end of each sentence (default `0`)
    #[arg(long)]
    silence: Option<u32>,
    /// Number of mel frames to stream for each chunk
    #[arg(long)]
    chunk_size: Option<usize>,
    /// Number of mel frames to use for padding current chunk (improves naturalness)
    #[arg(long)]
    chunk_padding: Option<usize>,
}

#[derive(Deserialize, Default)]
struct SynthesisRequest {
    text: String,
    mode: Option<SynthesisMode>,
    speaker_id: Option<u32>,
    length_scale: Option<f32>,
    noise_scale: Option<f32>,
    noise_w: Option<f32>,
    rate: Option<u8>,
    pitch: Option<u8>,
    volume: Option<u8>,
    appended_silence_ms: Option<u32>,
    chunk_size: Option<usize>,
    chunk_padding: Option<usize>,
}

impl SynthesisRequest {
    fn as_piper_synth_config(&self, default_config: &PiperSynthesisConfig) -> PiperSynthesisConfig {
        PiperSynthesisConfig {
            speaker: self.speaker_id.map(i64::from),
            length_scale: self.length_scale.unwrap_or(default_config.length_scale),
            noise_scale: self.noise_scale.unwrap_or(default_config.noise_scale),
            noise_w: self.noise_w.unwrap_or(default_config.noise_w),
        }
    }
    fn as_audio_output_config(&self) -> AudioOutputConfig {
        AudioOutputConfig {
            rate: self.rate,
            pitch: self.pitch,
            volume: self.volume,
            appended_silence_ms: self.appended_silence_ms,
        }
    }
}

fn enable_logging() {
    env_logger::Builder::from_env(env_logger::Env::default().filter_or("SONATA_LOG", "info"))
        .init();
}

fn get_synthesis_request_from_stdin() -> anyhow::Result<SynthesisRequest> {
    let mut input_buffer = String::new();
    let stdin = io::stdin();
    stdin.read_line(&mut input_buffer)?;
    let req: SynthesisRequest = serde_json::from_str(&input_buffer)?;
    Ok(req)
}

fn process_synthesis_request(
    args: &Cli,
    synth: &SonataSpeechSynthesizer,
    default_synth_config: &PiperSynthesisConfig,
    req: SynthesisRequest,
) -> anyhow::Result<()> {
    synth.set_fallback_synthesis_config(&req.as_piper_synth_config(default_synth_config))?;
    let output_config = Some(req.as_audio_output_config());
    if let Some(output_file) = args.output_file.as_ref() {
        if req.mode.is_some() {
            log::warn!("Synthesis mode has no effect when output-file is set");
        }
        synth.synthesize_to_file(output_file, req.text, output_config)?;
        return Ok(());
    }
    match req.mode.unwrap_or_default() {
        SynthesisMode::Lazy => {
            let stream = synth
                .synthesize_lazy(req.text, false, output_config)?
                .map(|res| res.map(|aud| aud.samples));
            consume_stream(stream)?
        }
        SynthesisMode::Parallel => {
            let stream = synth
                .synthesize_parallel(req.text, false, output_config)?
                .map(|res| res.map(|aud| aud.samples));
            consume_stream(stream)?
        }
        SynthesisMode::Realtime => {
            let stream = synth.synthesize_streamed(
                req.text,
                false,
                output_config,
                req.chunk_size.unwrap_or(100),
                req.chunk_padding.unwrap_or(3),
            )?;
            consume_stream(stream)?
        }
    };
    Ok(())
}

fn write_to_stdout(data: &[u8]) -> anyhow::Result<()> {
    let mut stdout = io::stdout().lock();
    stdout.write_all(data)?;
    stdout.flush()?;
    Ok(())
}

#[inline(always)]
fn consume_stream(stream: impl Iterator<Item = SonataResult<AudioSamples>>) -> anyhow::Result<()> {
    for result in stream {
        let audio = result?;
        let wav_bytes = audio.as_wave_bytes();
        write_to_stdout(&wav_bytes)?;
    }
    Ok(())
}

fn init_ort_environment() {
    INIT_ORT_ENVIRONMENT.call_once(|| {
        let execution_providers = [
            #[cfg(feature = "cuda")]
            ort::ExecutionProviderDispatch::CUDA(Default::default()),
            ort::ExecutionProviderDispatch::CPU(Default::default()),
        ];
        ort::init()
            .with_name("sonata")
            .with_execution_providers(execution_providers)
            .commit()
            .expect("Failed to initialize onnxruntime");
    });
}

fn main() -> anyhow::Result<()> {
    enable_logging();
    init_ort_environment();

    let mut args = Cli::parse();

    let synth = {
        let voice = sonata_piper::from_config_path(&args.config)?;
        SonataSpeechSynthesizer::new(voice)?
    };
    log::info!("Using model config: `{}`", args.config.display());
    let default_synth_config: PiperSynthesisConfig = *synth
        .get_default_synthesis_config()?
        .downcast()
        .expect("Invalid default synthesis config. Expected Piper config.");
    if let Some(ref input_filename) = args.input_file {
        let mut input_buffer = String::new();
        let mut file = File::open(input_filename)?;
        file.read_to_string(&mut input_buffer)?;
        let req = SynthesisRequest {
            text: input_buffer,
            mode: args.mode.clone(),
            speaker_id: args.speaker_id,
            length_scale: args.length_scale,
            noise_scale: args.noise_scale,
            noise_w: args.noise_w,
            rate: args.rate,
            volume: args.volume,
            pitch: args.pitch,
            appended_silence_ms: args.silence,
            chunk_size: args.chunk_size,
            chunk_padding: args.chunk_padding,
        };
        process_synthesis_request(&args, &synth, &default_synth_config, req)?;
    } else {
        for i in 0.. {
            args.output_file = args.output_file.map(|file| {
                let enumerated_filename = format!(
                    "{}-{}.{}",
                    file.file_stem()
                        .expect("Invalid output file name")
                        .to_string_lossy(),
                    i + 1,
                    file.extension()
                        .expect("Invalid output file name")
                        .to_string_lossy()
                );
                file.with_file_name(enumerated_filename)
            });
            match get_synthesis_request_from_stdin() {
                Ok(req) => {
                    process_synthesis_request(&args, &synth, &default_synth_config, req)?;
                    if let Some(ref file) = args.output_file {
                        log::info!("Wrote output to file: {}", file.display());
                    }
                }
                Err(e) => log::error!("Invalid json input. Error: {}", e.to_string()),
            };
        }
    }
    Ok(())
}
