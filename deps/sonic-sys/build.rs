use std::env;
use std::path::PathBuf;

fn main() {
    println!("cargo::rerun-if-changed=build.rs");
    println!("cargo::rerun-if-env-changed=SYSTEM_SONIC_PREFIX");

    let mut bindings = bindgen::Builder::default()
        .parse_callbacks(Box::new(bindgen::CargoCallbacks));

    match env::var("SYSTEM_SONIC_PREFIX") {
        Ok(prefix) => {
            println!("cargo:rustc-link-lib=sonic");
            bindings = bindings.header(format!("{prefix}/include/sonic.h"));
        }
        Err(_) => {
            println!("cargo:rustc-link-lib=static=libsonic");
            println!("cargo:rerun-if-changed=../deps/sonic/sonic.h");
            println!("cargo:rerun-if-changed=../deps/sonic/sonic.c");

            bindings = bindings.header("../deps/sonic/sonic.h");

            cc::Build::new()
                .file("../deps/sonic/sonic.c")
                .include("../deps/sonic/sonic.h")
                .compile("libsonic");
        }
    }

    // Write the bindings to the $OUT_DIR/bindings.rs file.
    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings.generate().expect("Unable to generate bindings")
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}
