use std::env;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    
    tonic_build::configure()
        .build_server(true)
        .file_descriptor_set_path(out_dir.join("sonata_tts_descriptor.bin"))
        .compile(&["src/sonata_tts.proto"], &["src"])?;

    println!("cargo:rerun-if-changed=src/sonata_tts.proto");

    // Build espeak-phonemizer
    println!("cargo:rerun-if-changed=src/sonata/espeak-phonemizer/src");
    println!("cargo:rustc-link-lib=static=espeak-ng");
    println!("cargo:rustc-link-lib=static=ucd");

    let espeak_ng_path = PathBuf::from("src/sonata/espeak-phonemizer/deps/espeak-ng");
    if espeak_ng_path.exists() {
        let build_dir = cmake::Config::new(espeak_ng_path)
            .define("USE_ASYNC", "OFF")
            .define("USE_MBROLA", "OFF")
            .define("USE_LIBSONIC", "OFF")
            .define("USE_LIBPCAUDIO", "OFF")
            .define("USE_KLATT", "OFF")
            .define("USE_SPEECHPLAYER", "OFF")
            .define("BUILD_SHARED_LIBS", "OFF")
            .build();

        println!(
            "cargo:rustc-link-search={}",
            build_dir.join("lib").display()
        );
    } else {
        println!("cargo:warning=espeak-ng directory not found at {:?}", espeak_ng_path);
    }

    Ok(())
}