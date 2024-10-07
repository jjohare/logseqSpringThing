use anyhow::Result;
use clap::Parser;
use std::fs::File;
use std::io::{self, prelude::*};
use std::path::PathBuf;

fn main() -> Result<()> {
    let mut args = Cli::parse();
    let language = args.language.clone().unwrap();

    if args.input_file.is_some() || args.output_file.is_some() {
        if args.interactive {
            anyhow::bail!(
                "Interactive mode is not available when `--input-file` or `--output-file` is passed"
            )
        }
    } else {
        args.interactive = true;
    }

    let mut input_text = get_input_text(&args)?;
    if args.interactive {
        loop {
            if !input_text.trim().is_empty() {
                tqsm_main(&language, &args, std::mem::take(&mut input_text))?;
            }
            input_text = get_input_text(&args)?;
        }
    } else {
        tqsm_main(&language, &args, input_text)?;
    }

    Ok(())
}

fn tqsm_main(language: &str, args: &Cli, input_text: String) -> anyhow::Result<()> {
    let mut sentences: String = String::new();
    if args.input_file.is_none() {
        let input = input_text;
        let sents = libtqsm::segment(language, &input)?.join("\r\n");
        sentences.push_str(&sents);
        sentences.push_str("\r\n");
    } else {
        let mut line_sentences = String::new();
        for input_line in input_text.lines() {
            let sents = libtqsm::segment(language, input_line)?.join("\r\n");
            if args.output_file.is_none() {
                write_to_stdout(&sents)?;
            } else {
                line_sentences.push_str(&sents);
                line_sentences.push_str("\r\n");
            }
        }
        sentences.push_str(&line_sentences);
    }

    if let Some(ref output_filename) = args.output_file {
        let mut file = File::create(output_filename)?;
        file.write_all(sentences.as_bytes())?;
    } else {
        write_to_stdout(&sentences)?
    }

    Ok(())
}

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Input file (default `stdin`)
    #[arg(short = 'f', long, value_name = "INPUT_FILE")]
    input_file: Option<PathBuf>,
    /// Output file (default `stdout`)
    #[arg(short, long, value_name = "OUTPUT_FILE")]
    output_file: Option<PathBuf>,
    /// Language  (default `en`)
    #[arg(short, long, value_name = "LANG", default_value = "en")]
    language: Option<String>,
    /// Use interactive mode (useful for testing)
    #[arg(short, long)]
    interactive: bool,
}

fn write_to_stdout(text: &str) -> anyhow::Result<()> {
    let mut stdout = io::stdout().lock();
    stdout.write_all(text.as_bytes())?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}

fn get_input_text(args: &Cli) -> anyhow::Result<String> {
    let mut input_buffer = String::new();
    if let Some(ref input_filename) = args.input_file {
        let mut file = File::open(input_filename)?;
        file.read_to_string(&mut input_buffer)?;
    } else {
        let stdin = io::stdin();
        stdin.read_line(&mut input_buffer)?;
    }

    Ok(input_buffer)
}
