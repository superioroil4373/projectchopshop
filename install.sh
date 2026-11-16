#!/bin/bash
set -e

# --- FILL IN YOUR PRODUCTION VALUES BEFORE BUILDING THE .PKG ---
PROD_GCP_PROJECT_ID="your-actual-gcp-project-id"
PROD_WORKER_URL="https://your-actual-worker.workers.dev"
PROD_CHOPSHOP_ROOT="$HOME/Library/CloudStorage/Box-Box/ChopShop_Templates"
# ---------------------------------------------------------------

cd "$(dirname "$0")"

PLIST_NAME="com.chopshop.daemon.plist"
LOCAL_DIR="$HOME/.chopshop_local"

# 1. Create hidden user-space directory
mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"

# 2. Copy GCP Service Account Key
if [ -f "chopshop-daemon-key.json" ]; then
    cp "chopshop-daemon-key.json" "$LOCAL_DIR/chopshop-daemon-key.json"
    chmod 600 "$LOCAL_DIR/chopshop-daemon-key.json"
fi

# 3. Detect Mac CPU architecture and install the matching binary
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    BIN_SOURCE="chopshop-daemon-macos-arm64"
else
    BIN_SOURCE="chopshop-daemon-macos-x64"
fi

if [ -f "$BIN_SOURCE" ]; then
    cp "$BIN_SOURCE" "$LOCAL_DIR/chopshop-daemon"
    chmod 700 "$LOCAL_DIR/chopshop-daemon"
fi

# 4. Generate launchd Background Service with injected environment variables
mkdir -p "$HOME/Library/LaunchAgents"
cat << EOF > "$HOME/Library/LaunchAgents/$PLIST_NAME"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.chopshop.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>$LOCAL_DIR/chopshop-daemon</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>GOOGLE_APPLICATION_CREDENTIALS</key>
        <string>$LOCAL_DIR/chopshop-daemon-key.json</string>
        <key>GCP_PROJECT_ID</key>
        <string>$PROD_GCP_PROJECT_ID</string>
        <key>WORKER_URL</key>
        <string>$PROD_WORKER_URL</string>
        <key>CHOPSHOP_ROOT</key>
        <string>$PROD_CHOPSHOP_ROOT</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/chopshop-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/chopshop-daemon.err</string>
</dict>
</plist>
EOF

# 5. Load and start the background service
launchctl bootout "gui/$(id -u)/com.chopshop.daemon" 2>/dev/null || launchctl unload "$HOME/Library/LaunchAgents/$PLIST_NAME" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$PLIST_NAME" 2>/dev/null || launchctl load "$HOME/Library/LaunchAgents/$PLIST_NAME"

# 6. Show Machine Hash via macOS GUI Popup
MACHINE_HASH=$(ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { split($0, line, "\""); print line[4] }' | shasum -a 256 | awk '{print $1}')

osascript -e "set machineHash to \"$MACHINE_HASH\"" \
          -e "set dialogText to \"✅ ChopShop Daemon is installed and running!\" & return & return & \"Please send this Machine ID to your admin to activate your Mac:\" & return & return & machineHash" \
          -e "set dialogResult to display dialog dialogText buttons {\"Copy to Clipboard\", \"OK\"} default button \"Copy to Clipboard\" with title \"ChopShop Setup\"" \
          -e "if button returned of dialogResult is \"Copy to Clipboard\" then set the clipboard to machineHash"
