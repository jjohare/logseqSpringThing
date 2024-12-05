#!/bin/bash

# Path to the export repository relative to this script
EXPORT_REPO="../export-repository-to-prompt-for-llm"

# Activate virtual environment and ensure we deactivate it even if script fails
activate_venv() {
    source "$EXPORT_REPO/venv/bin/activate"
}

# Export both directories and combine them
export_and_combine() {
    # Export server (src) code
    python "$EXPORT_REPO/export-repository-to-file.py" "./src"
    mv output.txt server.txt

    # Export client code
    python "$EXPORT_REPO/export-repository-to-file.py" "./client"
    mv output.txt client.txt

    # Combine files and cleanup
    cat client.txt >> server.txt
    mv server.txt codebase.txt
    rm client.txt
}

# Main execution
if [ ! -d "$EXPORT_REPO" ]; then
    echo "Error: Export repository not found at $EXPORT_REPO"
    exit 1
fi

if [ ! -d "$EXPORT_REPO/venv" ]; then
    echo "Error: Virtual environment not found at $EXPORT_REPO/venv"
    exit 1
fi

# Execute the export process
activate_venv
export_and_combine
deactivate

echo "Successfully generated codebase.txt"
