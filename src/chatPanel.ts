import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

let chatPanel: vscode.WebviewPanel | undefined;
let providerManager: ProviderManager;

export function createChatPanel(context: vscode.ExtensionContext, pm: ProviderManager): void {
    providerManager = pm;

    if (chatPanel) {
        chatPanel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    chatPanel = vscode.window.createWebviewPanel(
        'aiChatPanel',
        '💬 KI Chat',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    const active = providerManager.getActiveProvider();
    chatPanel.webview.html = getChatHtml(active);

    chatPanel.onDidDispose(() => {
        chatPanel = undefined;
    });

    chatPanel.webview.onDidReceiveMessage(async message => {
        if (message.type === 'send') {
            await handleSend(message.text, message.systemPrompt);
        } else if (message.type === 'changeProvider') {
            const provider = providerManager.getProviderById(message.id);
            if (provider) {
                providerManager.setActiveProvider(provider.id);
                chatPanel?.webview.postMessage({
                    type: 'updateProvider',
                    name: provider.name,
                    model: provider.model,
                    url: provider.baseUrl,
                    systemPrompt: provider.systemPrompt
                });
            }
        }
    });
}

async function handleSend(text: string, systemPrompt: string): Promise<void> {
    if (!chatPanel) return;

    const provider = providerManager.getActiveProvider();
    if (!provider) {
        chatPanel.webview.postMessage({ type: 'error', message: 'Kein Provider konfiguriert!' });
        return;
    }

    chatPanel.webview.postMessage({ type: 'setLoading', loading: true });

    const client = new ApiClient(provider);
    const messages: ChatMessage[] = [];

    // System Prompt hinzufügen
    if (systemPrompt && systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: text });

    try {
        const response = await client.sendMessage(messages, { stream: false });
        chatPanel.webview.postMessage({ type: 'addAiMessage', text: response });
    } catch (error: any) {
        chatPanel.webview.postMessage({ type: 'error', message: error.message });
    }
}

function getChatHtml(provider: AIProvider | null): string {
    const providers = providerManager.getProviders();
    const selectOptions = providers.map(p =>
        `<option value="${p.id}" ${p.id === provider?.id ? 'selected' : ''}>${p.name} (${p.model})</option>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        .header {
            padding: 12px 16px;
            background: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-widget-border);
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }
        .header h1 { font-size: 16px; font-weight: 600; }
        select {
            padding: 6px 12px;
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 4px;
            font-size: 13px;
        }
        .btn {
            padding: 6px 12px;
            background: transparent;
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .btn:hover { background: var(--vscode-toolbar-hoverBackground); }
        .debug-btn { background: #FF9800; color: white; border: none; }
        .chat-area {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .debug-log {
            background: #1a1a1a;
            color: #0f0;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
        }
        .message {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 14px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .message.user {
            align-self: flex-end;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-bottom-right-radius: 4px;
        }
        .message.ai {
            align-self: flex-start;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-bottom-left-radius: 4px;
        }
        .message.error {
            background: rgba(244, 67, 54, 0.1);
            border: 1px solid #f44336;
            color: #f44336;
        }
        .system-prompt-area {
            padding: 8px 16px;
            background: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-widget-border);
            flex-shrink: 0;
        }
        .system-prompt-area label {
            display: block;
            font-size: 11px;
            opacity: 0.7;
            margin-bottom: 4px;
        }
        .system-prompt-area input {
            width: 100%;
            padding: 6px 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            color: var(--vscode-foreground);
            font-size: 13px;
        }
        .system-prompt-area input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .loading {
            color: var(--vscode-foreground);
            opacity: 0.6;
        }
        .welcome {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
            margin: auto;
        }
        .welcome h2 { margin-bottom: 12px; font-size: 20px; }
        .input-area {
            padding: 12px 16px;
            background: var(--vscode-editorWidget-background);
            border-top: 1px solid var(--vscode-widget-border);
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }
        .input-area input {
            flex: 1;
            padding: 10px 14px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            color: var(--vscode-foreground);
            font-size: 14px;
        }
        .input-area input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .input-area button {
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
        }
        .input-area button:hover { background: var(--vscode-button-hoverBackground); }
        .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
</head>
<body>
    <div class="header">
        <h1>💬 KI Chat</h1>
        <select id="provider-select">${selectOptions}</select>
        <button class="btn debug-btn" id="debug-btn">🔧</button>
        <button class="btn" id="clear-btn">🗑️</button>
    </div>

    <div class="system-prompt-area">
        <label for="system-prompt">🤖 System-Prompt (optional)</label>
        <input type="text" id="system-prompt" placeholder="z.B. Du bist ein hilfreicher Python-Entwickler..." value="${provider?.systemPrompt || ''}" />
    </div>

    <div class="chat-area" id="chat-area">
        <div class="welcome" id="welcome">
            <h2>Willkommen! 👋</h2>
            <p>Stelle eine Frage an deinen KI-Assistenten</p>
            <p style="margin-top: 8px; opacity: 0.6; font-size: 12px;" id="provider-info">
                ${provider?.name || 'Kein Provider'} • ${provider?.model || ''}
            </p>
        </div>
    </div>

    <div class="input-area">
        <input type="text" id="message-input" placeholder="Nachricht eingeben..." />
        <button id="send-btn">→</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isLoading = false;
        let aiDiv = null;

        const sendBtn = document.getElementById('send-btn');
        const input = document.getElementById('message-input');
        const chatArea = document.getElementById('chat-area');
        const clearBtn = document.getElementById('clear-btn');
        const debugBtn = document.getElementById('debug-btn');
        const providerSelect = document.getElementById('provider-select');
        const systemPromptInput = document.getElementById('system-prompt');

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        clearBtn.addEventListener('click', () => {
            chatArea.innerHTML = '';
            chatArea.appendChild(createWelcome());
        });
        debugBtn.addEventListener('click', () => {
            addDebug('Debug: System-Prompt=' + systemPromptInput.value);
        });
        providerSelect.addEventListener('change', () => {
            vscode.postMessage({ type: 'changeProvider', id: providerSelect.value });
        });

        function createWelcome() {
            const div = document.createElement('div');
            div.className = 'welcome';
            div.id = 'welcome';
            div.innerHTML = '<h2>Willkommen! 👋</h2><p>Stelle eine Frage an deinen KI-Assistenten</p>';
            return div;
        }

        function addDebug(text) {
            const div = document.createElement('div');
            div.className = 'debug-log';
            div.textContent = '[DEBUG] ' + text;
            chatArea.appendChild(div);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        function addMessage(role, text) {
            const welcomeEl = document.getElementById('welcome');
            if (welcomeEl) welcomeEl.remove();

            const div = document.createElement('div');
            div.className = 'message ' + role;
            div.textContent = text;
            chatArea.appendChild(div);
            chatArea.scrollTop = chatArea.scrollHeight;
            return div;
        }

        function sendMessage() {
            const text = input.value.trim();
            if (!text || isLoading) return;

            input.value = '';
            isLoading = true;
            sendBtn.disabled = true;

            addMessage('user', text);

            aiDiv = document.createElement('div');
            aiDiv.className = 'message ai';
            aiDiv.textContent = 'Warte auf Antwort...';
            chatArea.appendChild(aiDiv);
            chatArea.scrollTop = chatArea.scrollHeight;

            vscode.postMessage({
                type: 'send',
                text: text,
                systemPrompt: systemPromptInput.value
            });
        }

        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'addAiMessage') {
                if (aiDiv) {
                    aiDiv.textContent = msg.text;
                    aiDiv = null;
                }
                isLoading = false;
                sendBtn.disabled = false;
            } else if (msg.type === 'error') {
                if (aiDiv) {
                    aiDiv.textContent = '❌ ' + msg.message;
                    aiDiv.classList.add('error');
                    aiDiv = null;
                }
                isLoading = false;
                sendBtn.disabled = false;
            } else if (msg.type === 'setLoading') {
                sendBtn.disabled = msg.loading;
            } else if (msg.type === 'updateProvider') {
                const info = document.getElementById('provider-info');
                if (info) info.textContent = msg.name + ' • ' + msg.model;
                systemPromptInput.value = msg.systemPrompt || '';
            }
        });

        input.focus();
    </script>
</body>
</html>`;
}
