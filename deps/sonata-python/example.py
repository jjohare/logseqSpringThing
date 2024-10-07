import os
from sonata import Sonata, PiperModel, AudioOutputConfig


MODEL_PATH = "../sonata/synth/models/rt/config.json"
SENTENCES = [
    "Technology is not inevitable.",
    "Powerful drivers must exist in order for people to keep pushing the envelope and continue demanding more and more from a particular field of knowledge.",
    "Cheaper Communications",
    "The first and most important driver is our demand for ever cheaper and easier communications.",
    "All of human society depends on communications.",
]


def main():
    os.environ["ORT_DYLIB_PATH"] = "../target/debug/onnxruntime.dll"
    os.environ["SONATA_ESPEAKNG_DATA_DIRECTORY"] = "../deps/windows/espeak-ng-build"

    piper_model = PiperModel(MODEL_PATH)
    synth = Sonata.with_piper(piper_model)

    synth.synthesize_to_file(
        "output.wav",
        "\n".join(SENTENCES),
        AudioOutputConfig(None, None, None, 0),
    )

    stream = synth.synthesize_streamed(
        "\n".join(SENTENCES),
        chunk_size=72,
        chunk_padding=3
    )
    for audio in stream:
        print(f"Chunk len in bytes: {len(audio)}")


if __name__ == "__main__":
    main()
