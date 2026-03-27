#!/bin/bash
set -e

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm use 24
bun install
bun run build
bun run --cwd apps/server dev -- --host 192.168.0.21 --port 3773 --no-browser
