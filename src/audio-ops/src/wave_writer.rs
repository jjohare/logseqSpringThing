use riff_wave::WaveWriter;
use std::fmt;
use std::fs::File;
use std::io::prelude::*;
use std::path::Path;

#[derive(Debug)]
pub struct WaveWriterError(String);

impl std::error::Error for WaveWriterError {}

impl fmt::Display for WaveWriterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

pub fn write_wave_samples_to_buffer<'a, I, B>(
    buf: B,
    samples: I,
    sample_rate: u32,
    num_channels: u32,
    sample_width: u32,
) -> Result<(), WaveWriterError>
where
    I: Iterator<Item = &'a i16>,
    B: Seek + Write,
{
    let Ok(mut wave_writer) = WaveWriter::new(
        num_channels as u16,
        sample_rate,
        (sample_width * 8) as u16,
        buf,
    ) else {
        return Err(WaveWriterError(
            "Failed to initialize wave writer".to_string(),
        ));
    };
    let any_fail = samples
        .map(|i| wave_writer.write_sample_i16(*i))
        .any(|r| r.is_err());
    if any_fail {
        return Err(WaveWriterError("Failed to write wave samples".to_string()));
    }
    if wave_writer.sync_header().is_err() {
        return Err(WaveWriterError("Failed to update wave header".to_string()));
    }
    Ok(())
}

pub fn write_wave_samples_to_file<'a, I>(
    filename: &Path,
    samples: I,
    sample_rate: u32,
    num_channels: u32,
    sample_width: u32,
) -> Result<(), WaveWriterError>
where
    I: Iterator<Item = &'a i16>,
{
    let mut out: Vec<u8> = Vec::new();
    write_wave_samples_to_buffer(
        std::io::Cursor::new(&mut out),
        samples,
        sample_rate,
        num_channels,
        sample_width,
    )?;
    match File::create(filename) {
        Ok(mut file) => match file.write(out.as_slice()) {
            Ok(_) => Ok(()),
            Err(e) => {
                std::fs::remove_file(filename).ok();
                Err(WaveWriterError(format!(
                    "Failed to write wave bytes to file `{}`. Error: {}",
                    filename.display(),
                    e
                )))
            }
        },
        Err(e) => Err(WaveWriterError(format!(
            "Failed to create file `{}` for writing. Error: {}",
            filename.display(),
            e
        ))),
    }
}
