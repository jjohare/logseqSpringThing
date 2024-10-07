mod dev_utils;
use sonata_synth::{AudioOutputConfig, SonataSpeechSynthesizer};

fn main() {
    dev_utils::init();
    divan::main();
}

fn provide_params(
    kind: &'static str,
) -> impl Fn() -> (SonataSpeechSynthesizer, String, Option<AudioOutputConfig>) {
    move || dev_utils::gen_params(kind)
}

#[divan::bench_group(sample_count = 20, sample_size = 10)]
mod speech_streams {
    use super::*;
    use divan::{black_box, Bencher};

    #[divan::bench(threads = 4)]
    fn bench_lazy_stream(bencher: Bencher) {
        bencher.with_inputs(provide_params("std")).bench_local_refs(
            |(synth, text, output_config)| {
                let stream = synth
                    .synthesize_lazy(text.clone(), output_config.clone())
                    .unwrap()
                    .map(|res| res.map(|a| a.samples));
                dev_utils::iterate_stream(black_box(stream)).unwrap();
            },
        );
    }

    #[divan::bench]
    fn bench_parallel_stream(bencher: Bencher) {
        bencher.with_inputs(provide_params("std")).bench_local_refs(
            |(synth, text, output_config)| {
                let stream = synth
                    .synthesize_parallel(text.clone(), output_config.clone())
                    .unwrap()
                    .map(|res| res.map(|a| a.samples));
                dev_utils::iterate_stream(black_box(stream)).unwrap();
            },
        );
    }

    #[divan::bench]
    fn bench_realtime_stream(bencher: Bencher) {
        bencher.with_inputs(provide_params("rt")).bench_local_refs(
            |(synth, text, output_config)| {
                let stream = synth
                    .synthesize_streamed(text.clone(), output_config.clone(), 72, 3)
                    .unwrap();
                dev_utils::iterate_stream(black_box(stream)).unwrap();
            },
        );
    }
    #[divan::bench]
    fn bench_lazy_stream_latency(bencher: Bencher) {
        bencher.with_inputs(provide_params("std")).bench_local_refs(
            |(synth, text, output_config)| {
                let mut stream = black_box(
                    synth
                        .synthesize_lazy(text.clone(), output_config.clone())
                        .unwrap(),
                );
                let audio = stream.next().unwrap().unwrap();
                audio.as_wave_bytes().len();
            },
        );
    }
    #[divan::bench]
    fn bench_parallel_stream_latency(bencher: Bencher) {
        bencher.with_inputs(provide_params("std")).bench_local_refs(
            |(synth, text, output_config)| {
                let mut stream = black_box(
                    synth
                        .synthesize_parallel(text.clone(), output_config.clone())
                        .unwrap(),
                );
                let audio = stream.next().unwrap().unwrap();
                audio.as_wave_bytes().len();
            },
        );
    }
    #[divan::bench]
    fn bench_realtime_stream_latency(bencher: Bencher) {
        bencher.with_inputs(provide_params("rt")).bench_local_refs(
            |(synth, text, output_config)| {
                let mut stream = black_box(
                    synth
                        .synthesize_streamed(text.clone(), output_config.clone(), 72, 3)
                        .unwrap(),
                );
                let audio = stream.next().unwrap().unwrap();
                audio.as_wave_bytes().len();
            },
        );
    }
}
