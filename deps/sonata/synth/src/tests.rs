mod dev_utils;

use sonata_synth::SonataResult;

#[test]
fn test_lazy_stream() -> SonataResult<()> {
    let (synth, text, output_config) = dev_utils::gen_params("std");
    let stream = synth
        .synthesize_lazy(text, output_config)?
        .map(|ar| ar.map(|a| a.samples));
    dev_utils::iterate_stream(stream)
}

#[test]
fn test_parallel_stream() -> SonataResult<()> {
    let (synth, text, output_config) = dev_utils::gen_params("std");
    let stream = synth
        .synthesize_parallel(text, output_config)?
        .map(|ar| ar.map(|a| a.samples));
    dev_utils::iterate_stream(stream)
}

#[test]
fn test_realtime_stream() -> SonataResult<()> {
    let (synth, text, output_config) = dev_utils::gen_params("rt");
    let stream = synth.synthesize_streamed(text, output_config, 72, 3)?;
    dev_utils::iterate_stream(stream)
}
