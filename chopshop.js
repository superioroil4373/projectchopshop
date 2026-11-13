const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');
const readline = require('readline');

const baseChopShop    = process.env.CHOPSHOP_ROOT || path.join(__dirname, '..'); 
const layoutsFolder   = path.join(baseChopShop, 'render_layouts');
const graphicsLibrary = path.join(baseChopShop, 'graphics');
const textInputFile   = path.join(baseChopShop, 'Workspace', 'input.txt'); 

// SANITIZED: Removed specific CF Workers URL
const WORKER_URL = process.env.WORKER_URL || "https://your-worker-url.workers.dev";
let aeFolderVersion = "Adobe After Effects 2026"; 

try {
    const appsDir = '/Applications';
    if (fs.existsSync(appsDir)) {
        const apps = fs.readdirSync(appsDir);
        const aeFolders = apps.filter(app => app.startsWith('Adobe After Effects'));
        if (aeFolders.length > 0) aeFolderVersion = aeFolders.sort().reverse()[0];
    }
} catch (e) {
    console.warn("[System] Failed to scan /Applications for AE versions:", e.message);
}

function sanitizeName(str) {
    return String(str || "").replace(/[^a-zA-Z0-9-_ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function pushTelemetry(payload) {
    if (!WORKER_URL) return;
    try {
        await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.warn("[Network Error] Telemetry push failed:", e.message);
    }
}

async function updateSlack(userId, statusText) {
    if (!userId || !WORKER_URL) return;
    try {
        await fetch(`${WORKER_URL}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId, text: statusText })
        });
    } catch (e) {
        console.warn("[Network Error] Slack notification failed:", e.message);
    }
}

function findTemplatesRecursively(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        const nameLower = file.toLowerCase();

        if (stat.isDirectory()) {
            if (!nameLower.includes('auto-save') && !nameLower.includes('autosave') && !file.startsWith('.')) {
                fileList = findTemplatesRecursively(filePath, fileList);
            }
        } else if (file.endsWith('.aep')) {
            if (!file.startsWith('.') && !file.startsWith('._') && !nameLower.includes('auto-save') && !nameLower.includes('backup')) {
                fileList.push({ name: file, fullPath: filePath });
            }
        }
    });
    return fileList;
}

async function run() {
    const templates = findTemplatesRecursively(layoutsFolder);
    if (templates.length === 0) {
        console.error(`[ChopShop] No .aep project files found in: ${layoutsFolder}`);
        process.exit(1);
    }

    if (process.env.CHOPSHOP_PAYLOAD) {
        try {
            const payload = JSON.parse(process.env.CHOPSHOP_PAYLOAD);
            
            const autoCategory = String(payload.category || payload.template || "");
            if (!autoCategory) {
                console.error("[Error] Payload missing category/template definition.");
                process.exit(1);
            }

            const selectedTemplate = templates.find(t => t.name.toLowerCase().includes(autoCategory.toLowerCase()));
            if (!selectedTemplate) {
                console.error(`[Error] No template found matching category: ${autoCategory}`);
                process.exit(1);
            }

            const slackUserToDM = payload.slackUserId || null;
            await executePipeline(selectedTemplate, payload.ip, payload.textMap, slackUserToDM);
            return;
        } catch (e) {
            console.error("[Error] Failed to parse secure memory payload:", e.message);
            process.exit(1);
        }
    }

    console.log("\n=============================================");
    console.log("        CHOPSHOP ULTIMATE GRAPHICS ENGINE     ");
    console.log("=============================================\n");
    templates.forEach((tmpl, idx) => console.log(`[${idx + 1}] ${tmpl.name}`));
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nSelect a layout number to render: ', (answer) => {
        const choice = parseInt(answer) - 1;
        if (isNaN(choice) || choice < 0 || choice >= templates.length) {
            console.log("Invalid selection. Exiting.");
            rl.close();
            process.exit(1);
        }
        
        const selectedTemplate = templates[choice];
        rl.question('Enter Project / IP Name: ', (ipAnswer) => {
            rl.question('Enter Headline Text (or leave blank to use IP Name): ', async (textAnswer) => {
                rl.close();
                const text = textAnswer.trim() ? textAnswer : ipAnswer;
                await executePipeline(selectedTemplate, ipAnswer, { "DynamicText": text }, null);
            });
        });
    });
}

async function executePipeline(templateObj, cliIP = null, customTextMap = null, slackUserId = null) {
    let textMap = {};
    let ipClean = "Untitled_Project";

    if (customTextMap && Object.keys(customTextMap).length > 0) {
        textMap = customTextMap;
        if (cliIP) ipClean = sanitizeName(cliIP);
    } else if (cliIP) {
        ipClean = sanitizeName(cliIP);
        textMap["DynamicText"] = cliIP;
    } else if (fs.existsSync(textInputFile)) {
        const rawText = fs.readFileSync(textInputFile, 'utf8').trim();
        if (rawText) {
            if (rawText.indexOf('[') === -1) {
                ipClean = sanitizeName(rawText);
                textMap["DynamicText"] = rawText;
            } else {
                const lines = rawText.split(/\r?\n/);
                let currentTag = null;
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                        currentTag = trimmed.slice(1, -1).trim();
                        textMap[currentTag] = [];
                    } else if (currentTag) {
                        textMap[currentTag].push(line);
                    }
                });
                for (let tag in textMap) textMap[tag] = textMap[tag].join('\n').trim();
                const rawIP = textMap["IPName"] || "Untitled_Project";
                ipClean = sanitizeName(rawIP);
                delete textMap["IPName"];
            }
        }
    } else {
        textMap["DynamicText"] = "Default Headline";
    }

    const baseName = templateObj.name.replace('.aep', '');
    const parts = baseName.split('_');
    const client = sanitizeName(parts[0] || "Unknown");           
    const category = sanitizeName(parts[1] || "Unknown");         
    const platformTemplate = sanitizeName(parts.slice(2, parts.length - 1).join('_') || "Template"); 

    const jobId = crypto.randomUUID().substring(0, 8);
    const sandboxDir = path.join(os.tmpdir(), `chopshop_${jobId}`);
    fs.mkdirSync(sandboxDir, { recursive: true });

    const localAepCopy   = path.join(sandboxDir, templateObj.name);
    const generatedJsx   = path.join(sandboxDir, 'active_job.jsx');
    const errorLogPath   = path.join(sandboxDir, 'chopshop_error.log');
    const metricsLogPath = path.join(sandboxDir, 'chopshop_metrics.txt');

    fs.copyFileSync(templateObj.fullPath, localAepCopy);

    const templateDir = path.dirname(templateObj.fullPath);
    const items = fs.readdirSync(templateDir);
    items.forEach(item => {
        const itemPath = path.join(templateDir, item);
        const destPath = path.join(sandboxDir, item);
        if (itemPath !== templateObj.fullPath) {
            try {
                if (fs.statSync(itemPath).isDirectory()) {
                    fs.symlinkSync(itemPath, destPath, 'dir');
                } else {
                    fs.symlinkSync(itemPath, destPath, 'file');
                }
            } catch(e) {
                console.error(`[Sandbox Warning] Failed to symlink asset ${item}:`, e.message);
            }
        }
    });

    const escapedSandboxAep  = localAepCopy.replace(/\\/g, '\\\\');
    const escapedGraphicsLib = graphicsLibrary.replace(/\\/g, '\\\\');
    const escapedErrorLog    = errorLogPath.replace(/\\/g, '\\\\');
    const escapedMetricsLog  = metricsLogPath.replace(/\\/g, '\\\\');
    
    const safeLayerData = JSON.stringify(textMap);

    const jsxCode = `
    (function() {
        try {
            var projectFile = new File("${escapedSandboxAep}");
            if (!projectFile.exists) throw new Error("Sandbox project file missing.");
            app.open(projectFile);

            var layersToUpdate = ${safeLayerData};
            
            var crawlAndSetText = function(currentComp, layerMap) {
                var localSuccess = false;
                for (var prop in layerMap) {
                    var txtLayer = currentComp.layer(prop);
                    if (txtLayer && txtLayer.property("Source Text")) {
                        txtLayer.property("Source Text").setValue(layerMap[prop]);
                        localSuccess = true;
                    }
                }
                for (var j = 1; j <= currentComp.numLayers; j++) {
                    var checkLayer = currentComp.layer(j);
                    if (checkLayer.source && checkLayer.source instanceof CompItem) {
                        if (crawlAndSetText(checkLayer.source, layerMap)) localSuccess = true;
                    }
                }
                return localSuccess;
            };

            var compFoundCount = 0;
            for (var i = 1; i <= app.project.renderQueue.numItems; i++) {
                var rqItem = app.project.renderQueue.item(i);
                var item = rqItem.comp;
                
                if (item && item.name.indexOf("CHOP_") === 0) {
                    compFoundCount++;
                    var dimensions = item.name.replace("CHOP_", "").toLowerCase();
                    crawlAndSetText(item, layersToUpdate);

                    var targetFolderPath = "${escapedGraphicsLib}/${client}/${category}/${ipClean}/" + dimensions;
                    var targetFolder = new Folder(targetFolderPath);
                    if (!targetFolder.exists) targetFolder.create();

                    var outputFileName = "${client}_${category}_${platformTemplate}_${ipClean}_" + dimensions + ".mov";
                    rqItem.outputModule(1).file = new File(targetFolderPath + "/" + outputFileName);
                    rqItem.render = true; 
                } else {
                    rqItem.render = false; 
                }
            }

            if (compFoundCount === 0) throw new Error("No compositions starting with 'CHOP_' found in Render Queue.");

            var logMetrics = new File("${escapedMetricsLog}");
            logMetrics.open("w"); logMetrics.write(compFoundCount); logMetrics.close();

            app.project.save();
            app.quit();
        } catch (err) {
            var log = new File("${escapedErrorLog}");
            log.open("w"); log.write(err.toString()); log.close();
            app.quit();
        }
    })();
    `;

    fs.writeFileSync(generatedJsx, jsxCode, 'utf8');

    const aePath = `/Applications/${aeFolderVersion}/aerender`;
    const injectCommand = `osascript -e 'tell application "${aeFolderVersion}" to DoScriptFile "${generatedJsx}"'`;
    
    let engineFailed = false;

    try {
        await updateSlack(slackUserId, `⚙️ Render started for *${ipClean}*. Please wait, this should take around 40 seconds.`);
        await pushTelemetry({ action: 'analytics', username: os.userInfo().username, client: client, ip: ipClean, count: 0, time: "STARTED" });

        execSync(injectCommand);
        if (fs.existsSync(errorLogPath)) {
            const runtimeError = fs.readFileSync(errorLogPath, 'utf8');
            throw new Error(`AE Script Execution Failed: ${runtimeError}`);
        }

        const startTime = Date.now();
        execFileSync(aePath, ['-project', localAepCopy], { stdio: 'inherit' });
        const renderTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        
        let renderCount = 1;
        if (fs.existsSync(metricsLogPath)) renderCount = parseInt(fs.readFileSync(metricsLogPath, 'utf8')) || 1;

        await pushTelemetry({ action: 'analytics', username: os.userInfo().username, client: client, ip: ipClean, count: renderCount, time: renderTimeSeconds });

        const successText = `✅ **${ipClean}* render complete!* (${renderTimeSeconds}s)\nThank you for using ChopShop! 🎬`;
        
        await updateSlack(slackUserId, successText);
        console.log(`\n[ChopShop] Success! Multi-size assets deployed to /graphics/${client}/${category}/${ipClean}/`);
        process.exit(0);

    } catch (err) {
        engineFailed = true;
        await updateSlack(slackUserId, `❌ *ChopShop Error:* Render failed for \`${ipClean}\`. Please check your After Effects formatting or try again.`);
        console.error("\n[ChopShop] Engine failed:", err.message);
        process.exit(1);
    } finally {
        if (fs.existsSync(sandboxDir)) {
            if (engineFailed && fs.existsSync(errorLogPath)) {
                const localErrorLog = path.join(os.homedir(), '.chopshop_local', `error_${jobId}.log`);
                fs.copyFileSync(errorLogPath, localErrorLog);
                console.error(`[ChopShop] Saved crash log to ${localErrorLog}`);
            }
            fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
    }
}

run();
