# <img src="icon.png" width="62" valign="middle" alt="ChopShop Logo"> ChopShop: Headless Template Injector

> **Automated, Zero-UI Data Injection and Rendering for Video Design Systems**

`ChopShop` is a lightweight, headless macOS background service that powers automated template injection. It listens securely to network-based JSON queue payloads, dynamically injecting text, variables, and assets straight into native After Effects `.aep` project files without bothering the local editor.

This repository hosts the background daemon (`daemon_core.js`), local bootstrapper (`bootstrap.js`), and render engine (`chopshop.js`). Together they safely handle:
- 🔄 Background queue polling from Cloudflare KV & Slack API
- 🔒 Secure, in-memory payload isolation to fight command exploits
- 📦 Automatic project/dependency workspace sandboxing (no sync collisions)
- 🖥️ Background After Effects rendering (`aerender` / macOS script bridges)

*Note: Companion front-end Panels (Premiere, After Effects, Slack UI) are managed in separate, internal repositories.*

---

## 🚀 Setup & Installation

### 📋 Prerequisites
- **macOS** with Node.js installed (`node -v` 18+)
- **Adobe After Effects** installed in `/Applications`
- Access to your design system's Cloudflare Worker / API endpoint

---

### 📥 1. Create the Local Environment
Clone this repository to your computer, navigate to the folder in Terminal, and run our simple setup script:

```bash
chmod +x install.sh
./install.sh
```
*This safely configures `~/.chopshop_local/` (using 0700 permissions) and clones the bootstrap loader.*

---

### ⚙️ 2. Configure Your Variables
Navigate to your local hidden config directory and link the app to your endpoint:
1. Run `open ~/.chopshop_local` in Terminal.
2. Open `.env` in any code or text editor.
3. Replace the fallback URL with your system's `WORKER_URL`.

```env
WORKER_URL=[https://your-unique-subdomain.workers.dev](https://your-unique-subdomain.workers.dev)
CHOPSHOP_ROOT=/Users/yourname/Documents/Templates_Shared
```

---

### 🔨 3. Create the Local Background App
Since this is an automated, headless tool, compiling it through Automator is the easiest way to avoid gatekeeper or quarantine blocks:

1. Open **Automator** (`/Applications/Automator.app`).
2. Choose **Application** for the new document type.
3. Search for **Run Shell Script** on the left and drag it into the right-hand panel.
4. Replace `cat` in the input field with the execution line below:

   ```bash
   /usr/local/bin/node ~/.chopshop_local/bootstrap.js
   ```

5. Go to **File > Save**, name the app `ChopShop`, and place it inside your standard `/Applications` directory.

---

### 🕵️ 4. Optional: Silently Hide the Icon (Recommended)
To prevent the application from bouncing in your Dock while it's scanning the queue:
1. Right-click your new `ChopShop.app` in your Applications folder and click **Show Package Contents**.
2. Open `Contents/Info.plist` with a text editor.
3. Insert this key/value pair right above the final `</dict>` tag at the bottom of the file:

   ```xml
   <key>LSUIElement</key>
   <true/>
   ```

4. Save and launch your background engine!
