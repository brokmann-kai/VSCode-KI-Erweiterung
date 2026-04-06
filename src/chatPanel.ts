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
        } else if (message.command === 'clear') {
            // nichts tun
        }
    });
}

async function handleSend(text: string, systemPrompt: string): Promise<void> {
    const provider = pm.getActiveProvider();
    if (!provider) {
        panel?.webview.postMessage({ command: 'error', message: 'Kein Provider!' });
        return;
    }

    panel?.webview.postMessage({ command: 'status', text: 'Sende...' });

    const messages: ChatMessage[] = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: text });

    try {
        const client = new ApiClient(provider);
        const response = await client.sendMessage(messages, { stream: false });
        panel?.webview.postMessage({ command: 'response', text: response });
    } catch (error: any) {
        panel?.webview.postMessage({ command: 'error', message: error.message });
    }
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
.chat { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.msg { padding: 8px 12px; border-radius: 8px; font-size: 13px; max-width: 85%; }
.msg.user { align-self: flex-end; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.msg.assistant { align-self: flex-start; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); }
.msg.error { background: rgba(244,67,54,0.2); color: #f44336; }
.msg.status { background: rgba(100,150,255,0.2); font-size: 12px; text-align: center; }
.input-area { padding: 10px; background: var(--vscode-editorWidget-background); border-top: 1px solid var(--vscode-widget-border); display: flex; gap: 8px; }
.input-area input { flex: 1; padding: 8px 12px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: 13px; }
.input-area button { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.input-area button:hover { background: var(--vscode-button-hoverBackground); }
.input-area button:disabled { opacity: 0.5; }
.system-input { padding: 6px 10px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-widget-border); }
.system-input label { font-size: 11px; opacity: 0.7; display: block; margin-bottom: 2px; }
.system-input input { width: 100%; padding: 4px 8px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font-size: 12px; box-sizing: border-box; }
</style>
</head>
<body>
<div class="header">
    <h1>KI Chat</h1>
    <select id="provider">${options}</select>
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

function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

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
    }
});
</script>
</body>
</html>`;
}
