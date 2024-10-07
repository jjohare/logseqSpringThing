# Sonata

A cross-platform Rust engine for neural TTS models.


## Supported models

* [Piper](https://github.com/rhasspy/piper)


# Crates

- `espeak-phonemizer`: Converts text to `IPA` phonemes using a patched version of eSpeak-ng
- `sonata-model`: Handles model loading and inference using `onnxruntime` via `ort`
- `sonata-synth`: Wraps `SonataModel` and adds synthesized speech post-processing, including changing prosody. Also provides different modes of parallelism.
- `sonata-grpc`: [GRPC](https://grpc.io/) frontend for sonata
- `libsonata`: C-API binding to sonata
- `sonata-python`: Python bindings to `sonata-synth` using `pyo3`
- `sonic-sys`: Rust FFI bindings to [Sonic](https://github.com/waywardgeek/sonic): a `C` library for controlling various aspects of generated speech, such as rate, volume, and pitch

# A note on testing

Some packages, such as `espeak-phonemizer`, include tests. Running `cargo test` from the root of the workspace will likely fail, because `cargo` does not load `config` from sub packages when ran from the workspace root.

On Windows you need to add `espeak-ng.dll` to the library search path by modifying the **PATH** environment variable.

For example, to add `espeak-ng.dll` to your path when building for the `x86_64-pc-windows-msvc` target, run the following command before `cargo test`:

```cmd
set PATH=%PATH%;{repo_path}\deps\windows\espeak-ng-build\i686\bin
```

Replace `repo_path` with the absolute path to the repository.

Then `cd` to the package, and run `cargo test` from there.

# License

Copyright (c) 2023 Musharraf Omer. This code is licensed under the  MIT license.

