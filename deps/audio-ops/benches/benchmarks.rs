use audio_ops::RawAudioSamples;
use divan::Bencher;

fn main() {
    divan::main();
}

pub fn samples_generator() -> impl Fn() -> (RawAudioSamples, RawAudioSamples) {
    let data = Vec::from_iter((0..441000).map(|i| i as f32));
    move || (data.clone().into(), data.clone().into())
}

#[divan::bench]
fn bench_overlap_with(bencher: Bencher) {
    bencher
        .with_inputs(samples_generator())
        .bench_refs(|(s1, s2)| s1.overlap_with(s2));
}
