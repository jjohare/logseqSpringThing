use std::env;

fn main() {
    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-env-changed=USE_SYSTEM_ESPEAK");

    match env::var("USE_SYSTEM_ESPEAK") {
        Ok(_) => {
            println!("cargo:rustc-link-lib=espeak-ng");
        },
        Err(_) => {
            println!("cargo:rerun-if-changed=../deps/espeak-ng/src");
            println!("cargo:rustc-link-lib=static=espeak-ng");

            std::process::Command::new("sh")
                .arg("-c")
                .arg("cd ../deps/espeak-ng && ./autogen.sh")
                .output()
                .unwrap();

            let build_dir = autotools::Config::new("../deps/espeak-ng")
                .without("async", None)
                .without("mbrola", None)
                .without("sonic", None)
                .without("pcaudiolib", None)
                .without("klatt", None)
                .without("speechplayer", None)
                .without("speechplayer", None)
                .disable("shared", None)
                .insource(true)
                .build();

            println!(
                r"cargo:rustc-link-search={}",
                build_dir.join("lib").display()
            );
        }
    }
}
