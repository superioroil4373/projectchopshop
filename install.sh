#!/bin/bash
echo "🎬 Installing ChopShop Local Environment..."

# 1. Create the secure hidden directory
ENGINE_DIR="$HOME/.chopshop_local"
mkdir -p "$ENGINE_DIR"
chmod 700 "$ENGINE_DIR"

# 2. Copy the bootstrapper 
cp src/bootstrap.js "$ENGINE_DIR/bootstrap.js"
chmod 600 "$ENGINE_DIR/bootstrap.js"

# 3. Handle the environment variables
if [ ! -f "$ENGINE_DIR/.env" ]; then
    cp .env.example "$ENGINE_DIR/.env"
    echo "✅ Created .env template in $ENGINE_DIR/.env"
    echo "⚠️  Action Required: Please open $ENGINE_DIR/.env and add your WORKER_URL."
else
    echo "✅ Existing .env found, skipping template copy."
fi

echo "🚀 Install complete! Follow the README to create your Automator app."
