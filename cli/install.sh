#!/bin/bash
# Install the pb CLI tool to /usr/local/bin/
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_PATH="/usr/local/bin/pb"

echo "Installing pb CLI to $INSTALL_PATH..."
sudo cp "$SCRIPT_DIR/pb" "$INSTALL_PATH"
sudo chmod +x "$INSTALL_PATH"
echo "Done! Run 'pb --help' to get started."
