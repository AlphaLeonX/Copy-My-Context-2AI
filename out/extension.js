"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
function activate(context) {
    const copyDisposable = vscode.commands.registerCommand('copyClaudeContext.copyAsAI', async () => {
        const text = await buildContextText();
        if (text) {
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage('AI context copied to clipboard.');
        }
    });
    const sendDisposable = vscode.commands.registerCommand('copyClaudeContext.sendToiTerm2', async () => {
        const text = await buildContextText();
        if (text) {
            await sendToiTerm2(text, true);
        }
    });
    const copyAndSendDisposable = vscode.commands.registerCommand('copyClaudeContext.copyAndSendToiTerm2', async () => {
        const text = await buildContextText();
        if (text) {
            await vscode.env.clipboard.writeText(text);
            await sendToiTerm2(text, false);
            vscode.window.showInformationMessage('AI context copied and sent to iTerm2.');
        }
    });
    context.subscriptions.push(copyDisposable, sendDisposable, copyAndSendDisposable);
}
async function buildContextText() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    const document = editor.document;
    const selection = editor.selection;
    if (selection.isEmpty)
        return;
    const relativePath = toPosixPath(vscode.workspace.asRelativePath(document.uri, false));
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const selectedCode = document.getText(selection);
    const language = document.languageId;
    const fileName = path.basename(document.fileName);
    const template = vscode.workspace
        .getConfiguration('copyClaudeContext')
        .get('template');
    return template
        .replace(/\{\{relativePath\}\}/g, relativePath)
        .replace(/\{\{fileName\}\}/g, fileName)
        .replace(/\{\{startLine\}\}/g, String(startLine))
        .replace(/\{\{endLine\}\}/g, String(endLine))
        .replace(/\{\{language\}\}/g, language)
        .replace(/\{\{selectedCode\}\}/g, selectedCode);
}
function toPosixPath(filePath) {
    return filePath.split(path.sep).join('/');
}
async function sendToiTerm2(text, restoreClipboard) {
    const config = vscode.workspace.getConfiguration('copyClaudeContext');
    const submitMode = config.get('iterm2SubmitMode');
    const targetMode = config.get('iterm2TargetMode');
    // Resolve which iTerm2 tab to target
    let windowId;
    let tabIndex;
    if (targetMode === 'chooseSession') {
        const targets = await listIterm2Tabs();
        if (targets.length === 0) {
            vscode.window.showErrorMessage('No iTerm2 tabs found. Make sure iTerm2 is running.');
            return;
        }
        if (targets.length === 1) {
            windowId = targets[0].windowId;
            tabIndex = targets[0].tabIndex;
        }
        else {
            const picked = await pickIterm2Target(targets);
            if (!picked)
                return;
            windowId = picked.windowId;
            tabIndex = picked.tabIndex;
        }
    }
    // Save current clipboard if we need to restore
    let savedClipboard = '';
    if (restoreClipboard) {
        try {
            savedClipboard = await readClipboard();
        }
        catch {
            // ignore
        }
    }
    // Write text to clipboard via pbcopy
    await writeClipboard(text);
    // Build and run AppleScript
    const enterBlock = submitMode === 'pasteAndEnter'
        ? '\ndelay 0.1\ntell application "System Events" to tell process "iTerm2" to keystroke return'
        : '';
    let script;
    if (windowId && tabIndex) {
        script = `tell application "iTerm2"
    activate
    delay 0.2
    tell window id ${windowId}
        select tab ${tabIndex}
    end tell
    delay 0.2
end tell
tell application "System Events" to tell process "iTerm2" to keystroke "v" using command down${enterBlock}`;
    }
    else {
        script = `tell application "iTerm2" to activate
delay 0.2
tell application "System Events" to tell process "iTerm2" to keystroke "v" using command down${enterBlock}`;
    }
    try {
        await execOsascript(script);
    }
    catch (e) {
        vscode.window.showErrorMessage(`Failed to send to iTerm2: ${e.message}`);
    }
    // Restore original clipboard after paste completes
    if (restoreClipboard) {
        await delay(400);
        try {
            await writeClipboard(savedClipboard);
        }
        catch {
            // ignore
        }
    }
}
async function pickIterm2Target(targets) {
    const groups = groupByWindow(targets);
    const singleWindow = groups.size === 1;
    // Single window — flat list, no separators needed
    if (singleWindow) {
        const [tabs] = groups.values();
        const items = tabs.map(t => ({
            label: t.tabName,
            description: `Tab ${t.tabIndex}`,
            target: t,
        }));
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Choose which iTerm2 tab to send to',
        });
        return picked?.target;
    }
    // Multiple windows — grouped with separators
    const items = [];
    for (const [windowId, tabs] of groups) {
        const winName = tabs[0].windowName || `Window ID ${windowId}`;
        items.push({
            label: winName,
            kind: vscode.QuickPickItemKind.Separator,
            target: tabs[0],
        });
        for (const t of tabs) {
            items.push({
                label: `  ${t.tabName}`,
                description: `Tab ${t.tabIndex}`,
                target: t,
            });
        }
    }
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose which iTerm2 tab to send to',
        matchOnDescription: true,
    });
    return picked?.target;
}
function groupByWindow(targets) {
    const map = new Map();
    for (const t of targets) {
        const group = map.get(t.windowId);
        if (group) {
            group.push(t);
        }
        else {
            map.set(t.windowId, [t]);
        }
    }
    return map;
}
async function listIterm2Tabs() {
    // Output format: tabName:::windowId:::tabIndex:::windowName
    // windowName is last so it can safely contain ":::" if needed
    const script = `tell application "iTerm2"
    set output to ""
    set wc to count of windows
    repeat with wi from 1 to wc
        set wid to id of window wi
        set wname to name of window wi
        if length of wname is 0 then
            set wname to wid as text
        end if
        set tc to count of tabs of window wi
        repeat with ti from 1 to tc
            set tname to name of current session of tab ti of window wi
            set output to output & tname & ":::" & wid & ":::" & ti & ":::" & wname & linefeed
        end repeat
    end repeat
    return output
end tell`;
    try {
        const stdout = await execOsascript(script, true);
        return stdout
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(line => {
            const parts = line.split(':::');
            return {
                tabName: parts[0] || 'Unknown',
                windowId: parts[1] || '',
                tabIndex: parseInt(parts[2], 10) || 1,
                windowName: parts.slice(3).join(':::') || '',
            };
        });
    }
    catch {
        return [];
    }
}
function readClipboard() {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)('pbpaste', [], { stdio: ['ignore', 'pipe', 'ignore'] });
        let stdout = '';
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        proc.on('close', (code) => {
            if (code === 0)
                resolve(stdout);
            else
                reject(new Error(`pbpaste exited with code ${code}`));
        });
        proc.on('error', reject);
    });
}
function writeClipboard(text) {
    return new Promise((resolve, reject) => {
        const proc = (0, child_process_1.spawn)('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
        proc.stdin.write(text);
        proc.stdin.end();
        proc.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`pbcopy exited with code ${code}`));
        });
        proc.on('error', reject);
    });
}
function execOsascript(script, captureStdout = false) {
    return new Promise((resolve, reject) => {
        const proc = captureStdout
            ? (0, child_process_1.spawn)('osascript', [], { stdio: ['pipe', 'pipe', 'pipe'] })
            : (0, child_process_1.spawn)('osascript', [], { stdio: ['pipe', 'ignore', 'pipe'] });
        proc.stdin.write(script);
        proc.stdin.end();
        let stdout = '';
        let stderr = '';
        if (captureStdout && proc.stdout) {
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
        }
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        proc.on('close', (code) => {
            if (code === 0)
                resolve(stdout);
            else
                reject(new Error(stderr.trim() || `osascript exited with code ${code}`));
        });
        proc.on('error', reject);
    });
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map