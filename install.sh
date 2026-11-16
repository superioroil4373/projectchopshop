#!/bin/bash
echo "⚡️ Installing ChopShop Background Daemon..."

PLIST_NAME="com.chopshop.daemon.plist"
LOCAL_DIR="$HOME/.chopshop_local"

# 1. Create hidden local directory
mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"

# 2. Handle the environment variables (Ask user to provide their own GCP key)
if [ ! -f "$LOCAL_DIR/chopshop-daemon-key.json" ]; then
    echo "⚠️  Action Required: Please place your GCP Service Account JSON in $LOCAL_DIR/chopshop-daemon-key.json"
fi

# 3. Install the Binary
echo "-> Installing daemon executable..."
if [ -f "chopshop-daemon" ]; then
    cp chopshop-daemon "$LOCAL_DIR/"
    chmod +x "$LOCAL_DIR/chopshop-daemon"
else
    echo "⚠️  Binary not found! Please compile daemon_core.js using pkg first."
    exit 1
fi

# 4. Generate the launchd Background Service (.plist)
echo "-> Configuring macOS background service..."
cat << INNER_EOF > "$HOME/Library/LaunchAgents/$PLIST_NAME"
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
INNER_EOF

# 5. Load and start the service invisibly
echo "-> Starting service..."
launchctl unload "$HOME/Library/LaunchAgents/$PLIST_NAME" 2>/dev/null
launchctl load "$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "✅ ChopShop Daemon installed and running in the background!"
