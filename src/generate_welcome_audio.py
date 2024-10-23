import sys
import os
from piper import PiperVoice

def generate_welcome_audio():
    # Load model and config paths from environment variables
    model_path = os.environ.get('PIPER_MODEL_PATH', '/app/data/piper/en_GB-northern_english_male-medium.onnx')
    config_path = os.environ.get('PIPER_CONFIG_PATH', '/app/data/piper/en_GB-northern_english_male-medium.onnx.json')
    
    voice = PiperVoice.load(model_path, config_path=config_path)
    text = "Welcome to the WebXR Graph Visualization. Your virtual environment is now ready."
    audio = voice.synthesize(text)
    sys.stdout.buffer.write(audio.tobytes())

if __name__ == "__main__":
    generate_welcome_audio()
