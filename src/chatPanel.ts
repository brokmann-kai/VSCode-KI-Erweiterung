import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

let panel: vscode.WebviewPanel | undefined;
let pm: ProviderManager;

export function createChatPanel(context: vscode.ExtensionContext, providerManager: ProviderManager): void {
    pm = providerManager;

    if (panel) {
        panel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    panel = vscode.window.createWebviewPanel(
        'aiChat',
        'KI Chat',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    const provider = pm.getActiveProvider();
    panel.webview.html = getHtml(provider);

    panel.onDidDispose(() => {
        panel = undefined;
    });

    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'send') {
            await handleSend(message.text, message.systemPrompt);
        } else if (message.command === 'createFile') {
            await createFile(message.path, message.content);
        } else if (message.command === 'readFile') {
            await readFile(message.path);
        } else if (message.command === 'listFiles') {
            await listFiles();
        }
    });
}

async function readFile(filePath: string): Promise<void> {
    if (!panel) return;
    try {
        let fullPath = filePath;
        if (vscode.workspace.workspaceFolders?.[0] && !filePath.startsWith(vscode.workspace.workspaceFolders[0].uri.fsPath)) {
            fullPath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, filePath).fsPath;
        }
        const uri = vscode.Uri.file(fullPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const content = doc.getText();
        panel.webview.postMessage({ command: 'fileContent', path: fullPath, content: content });
    } catch (error: any) {
        panel.webview.postMessage({ command: 'error', message: 'Fehler beim Lesen: ' + error.message });
    }
}

async function listFiles(): Promise<void> {
    if (!panel) return;
    try {
        const files: string[] = [];
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const pattern = new vscode.RelativePattern(folder, '**/*');
                const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
                files.push(...uris.map(u => u.fsPath));
            }
        }
        panel.webview.postMessage({ command: 'fileList', files: files });
    } catch (error: any) {
        panel.webview.postMessage({ command: 'error', message: 'Fehler: ' + error.message });
    }
}

async function createFile(filePath: string, content: string): Promise<void> {
    if (!panel) return;
    try {
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        if (!wsFolder) {
            panel.webview.postMessage({ command: 'error', message: 'Kein Workspace geoeffnet!' });
            return;
        }

        let fullPath = filePath;
        if (!filePath.startsWith(wsFolder.uri.fsPath)) {
            fullPath = vscode.Uri.joinPath(wsFolder.uri, filePath).fsPath;
        }

        const uri = vscode.Uri.file(fullPath);
        const dir = fullPath.replace(/[/\\][^/\\]+$/, '');

        try { await vscode.workspace.fs.stat(vscode.Uri.file(dir)); }
        catch { await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir)); }

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        panel.webview.postMessage({ command: 'fileCreated', path: fullPath });
    } catch (error: any) {
        panel.webview.postMessage({ command: 'error', message: 'Fehler: ' + error.message });
    }
}

async function handleSend(text: string, systemPrompt: string): Promise<void> {
    const provider = pm.getActiveProvider();
    if (!provider) {
        panel?.webview.postMessage({ command: 'error', message: 'Kein Provider!' });
        return;
    }

    panel?.webview.postMessage({ command: 'status', text: 'Sende...' });

    const messages: ChatMessage[] = [];

    // System Prompt
    if (systemPrompt && systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: text });

    try {
        const client = new ApiClient(provider);
        const response = await client.sendMessage(messages, { stream: false });

        // Check for create_file tags
        const createFileRegex = /<create_file\s+path="([^"]+)">([\s\S]*?)<\/create_file>/g;
        let processedResponse = response;
        let match;
        const filesToCreate: { path: string; content: string }[] = [];

        while ((match = createFileRegex.exec(response)) !== null) {
            filesToCreate.push({ path: match[1], content: match[2].trim() });
            processedResponse = processedResponse.replace(match[0], '[Datei erstellt: ' + match[1] + ']');
        }

        for (const file of filesToCreate) {
            await createFileInternal(file.path, file.content);
        }

        panel?.webview.postMessage({ command: 'response', text: processedResponse });

        if (filesToCreate.length > 0) {
            panel?.webview.postMessage({ command: 'filesCreated', files: filesToCreate.map(f => f.path) });
        }
    } catch (error: any) {
        panel?.webview.postMessage({ command: 'error', message: error.message });
    }
}

async function createFileInternal(filePath: string, content: string): Promise<string> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    if (!wsFolder) throw new Error('Kein Workspace');

    let fullPath = filePath;
    if (!filePath.startsWith(wsFolder.uri.fsPath)) {
        fullPath = vscode.Uri.joinPath(wsFolder.uri, filePath).fsPath;
    }

    const uri = vscode.Uri.file(fullPath);
    const dir = fullPath.replace(/[/\\][^/\\]+$/, '');

    try { await vscode.workspace.fs.stat(vscode.Uri.file(dir)); }
    catch { await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir)); }

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);

    return fullPath;
}

function getHtml(provider: AIProvider | null): string {
    const providers = pm.getProviders();
    let options = '';
    for (const p of providers) {
        const sel = p.id === provider?.id ? ' selected' : '';
        options += `<option value="${p.id}"${sel}>${p.name}</option>`;
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: system-ui; margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
.header { padding: 10px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-widget-border); display: flex; align-items: center; gap: 10px; }
.header h1 { font-size: 14px; margin: 0; }
select { padding: 4px 8px; }
.toolbar { padding: 6px 10px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-widget-border); display: flex; gap: 6px; flex-wrap: wrap; }
.toolbar-btn { padding: 4px 10px; background: var(--vscode-badge-background); border: none; border-radius: 4px; color: var(--vscode-foreground); cursor: pointer; font-size: 11px; }
.toolbar-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
.toolbar-btn.active { background: #4CAF50; color: white; }
.chat { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.msg { padding: 8px 12px; border-radius: 8px; font-size: 13px; max-width: 85%; white-space: pre-wrap; }
.msg.user { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.msg.assistant { align-self: flex-start; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); }
.msg.error { background: rgba(244,67,54,0.2); color: #f44336; }
.msg.status { background: rgba(100,150,255,0.2); font-size: 12px; text-align: center; }
.msg.success { background: rgba(76,175,80,0.2); color: #4CAF50; }
.msg.file-list { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); align-self: stretch; max-width: 100%; }
.msg.file-list .file-item { padding: 4px 8px; cursor: pointer; border-radius: 4px; }
.msg.file-list .file-item:hover { background: var(--vscode-toolbar-hoverBackground); }
.input-area { padding: 10px; background: var(--vscode-editorWidget-background); border-top: 1px solid var(--vscode-widget-border); display: flex; gap: 8px; }
.input-area input { flex: 1; padding: 8px 12px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: 13px; }
.input-area button { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.input-area button:hover { background: var(--vscode-button-hoverBackground); }
.input-area button:disabled { opacity: 0.5; }
.system-input { padding: 6px 10px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-widget-border); }
.system-input label { font-size: 11px; opacity: 0.7; display: block; margin-bottom: 2px; }
.system-input input { width: 100%; padding: 4px 8px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: 12px; box-sizing: border-box; }
.new-file-form { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 12px; margin: 8px 0; }
.new-file-form input { width: 100%; padding: 6px 8px; margin-bottom: 8px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: 12px; box-sizing: border-box; }
.new-file-form textarea { width: 100%; min-height: 100px; padding: 6px 8px; margin-bottom: 8px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: 12px; font-family: monospace; resize: vertical; box-sizing: border-box; }
.new-file-form .btn-row { display: flex; gap: 6px; }
.new-file-form button { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.new-file-form button.create { background: #4CAF50; color: white; }
.new-file-form button.cancel { background: transparent; border: 1px solid var(--vscode-widget-border); color: var(--vscode-foreground); }
</style>
</head>
<body>
<div class="header">
    <h1>KI Chat</h1>
    <select id="provider">${options}</select>
</div>
<div class="toolbar">
    <button class="toolbar-btn" id="readCurrentBtn">Akt. Datei</button>
    <button class="toolbar-btn" id="listFilesBtn">Dateien</button>
    <button class="toolbar-btn" id="newFileBtn">+ Neue Datei</button>
</div>
<div class="system-input">
    <label>System-Prompt</label>
    <input type="text" id="systemPrompt" placeholder="Optionaler System-Prompt" value="${provider?.systemPrompt || ''}">
</div>
<div class="chat" id="chat"></div>
<div class="input-area">
    <input type="text" id="input" placeholder="Nachricht eingeben..." autofocus>
    <button id="send">Senden</button>
</div>
<script>
const vscode = acquireVsCodeApi();
const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const newFileBtn = document.getElementById('newFileBtn');
const readCurrentBtn = document.getElementById('readCurrentBtn');
const listFilesBtn = document.getElementById('listFilesBtn');

function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
}

function showFileList(files) {
    const div = document.createElement('div');
    div.className = 'msg file-list';
    let html = '<b>Dateien im Workspace:</b><br>';
    files.slice(0, 30).forEach(f => {
        const name = f.split(/[/\\]/).pop();
        html += '<div class="file-item" onclick="requestFile(\'' + f.replace(/\\/g, '\\\\') + '\')">' + name + '</div>';
    });
    if (files.length > 30) html += '<br>+ ' + (files.length - 30) + ' weitere...';
    div.innerHTML = html;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

window.requestFile = function(path) {
    vscode.postMessage({ command: 'readFile', path: path });
};

readCurrentBtn.addEventListener('click', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        addMessage('system', 'Lese aktuelle Datei...');
    }
});

listFilesBtn.addEventListener('click', () => {
    addMessage('status', 'Lade Dateien...');
    vscode.postMessage({ command: 'listFiles' });
});

newFileBtn.addEventListener('click', () => {
    const form = document.createElement('div');
    form.className = 'new-file-form';
    form.innerHTML = '<input type="text" id="filePath" placeholder="Dateiname (z.B. test.js)"><textarea id="fileContent" placeholder="Dateiinhalt..."></textarea><div class="btn-row"><button class="create" id="createBtn">Erstellen</button><button class="cancel" id="cancelBtn">Abbrechen</button></div>';
    chat.appendChild(form);
    document.getElementById('createBtn').addEventListener('click', () => {
        const p = document.getElementById('filePath').value;
        const c = document.getElementById('fileContent').value;
        if (p) {
            vscode.postMessage({ command: 'createFile', path: p, content: c });
            form.remove();
        }
    });
    document.getElementById('cancelBtn').addEventListener('click', () => form.remove());
});

sendBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage('user', text);
    sendBtn.disabled = true;
    vscode.postMessage({ command: 'send', text: text, systemPrompt: document.getElementById('systemPrompt').value });
});

input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendBtn.click();
    }
});

window.addEventListener('message', (event) => {
    const data = event.data;
    if (data.command === 'response') {
        addMessage('assistant', data.text);
        sendBtn.disabled = false;
    } else if (data.command === 'error') {
        addMessage('error', data.message);
        sendBtn.disabled = false;
    } else if (data.command === 'status') {
        addMessage('status', data.text);
    } else if (data.command === 'fileCreated') {
        addMessage('success', '+ Datei erstellt: ' + data.path);
    } else if (data.command === 'filesCreated') {
        data.files.forEach(f => addMessage('success', '+ Datei erstellt: ' + f));
    } else if (data.command === 'fileList') {
        showFileList(data.files);
    } else if (data.command === 'fileContent') {
        const content = data.content.substring(0, 2000) + (data.content.length > 2000 ? '\n...[gekuerzt]' : '');
        addMessage('system', 'Datei: ' + data.path + '\n' + content);
    }
});
</script>
</body>
</html>`;
}
