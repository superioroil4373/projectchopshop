# ChopShop: Automated After Effects Rendering Pipeline

## Setup Instructions

### 1. Install the Local Engine
Clone this repository to your Mac, open Terminal in the folder, and run the install script:

```bash
chmod +x install.sh
./install.sh
```

*This creates a hidden `~/.chopshop_local` folder on your Mac and copies the necessary bootstrapper into it.*

### 2. Configure Environment Variables
Navigate to the hidden folder and update your configuration:
1. In Terminal, run: `open ~/.chopshop_local`
2. Open the `.env` file in any text editor.
3. Replace the placeholder URL with your actual Cloudflare Worker URL.

### 3. Build the macOS App (Gatekeeper-Safe)
To run ChopShop securely in the background without triggering macOS security warnings, compile it locally using Automator:
1. Open the **Automator** app on your Mac (in `/Applications`).
2. Click **New Document** and select **Application**.
3. In the search bar on the top left, type `Run Shell Script` and drag that action into the main workflow window on the right.
4. Paste the following command into the text box (adjust the path if you use Homebrew or NVM for Node):

   ```bash
   /usr/local/bin/node ~/.chopshop_local/bootstrap.js
   ```

5. Go to **File > Save**, name it `ChopShop`, and save it to your `Applications` folder.

### 4. (Optional) Run Silently in the Background
To prevent the app from showing a bouncing icon in your Dock while it renders:
1. Right-click your new `ChopShop.app` in Finder and select **Show Package Contents**.
2. Open `Contents/Info.plist` in a text editor.
3. Just above the bottom `</dict>` tag, paste these two lines:

   ```xml
   <key>LSUIElement</key>
   <true/>
   ```

4. Save the file and launch ChopShop!
