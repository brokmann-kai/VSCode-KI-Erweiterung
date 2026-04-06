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
            await handleSend(message.text);
        } else if (message.type === 'changeProvider') {
            const provider = providerManager.getProviderById(message.id);
            if (provider) {
                providerManager.setActiveProvider(provider.id);
                chatPanel?.webview.postMessage({
                    type: 'updateProvider',
                    name: provider.name,
                    model: provider.model,
                    url: provider.baseUrl
                });
            }
        }
    });
}

async function handleSend(text: string): Promise<void> {
    if (!chatPanel) return;

    const provider = providerManager.getActiveProvider();
    if (!provider) {
        chatPanel.webview.postMessage({ type: 'error', message: 'Kein Provider konfiguriert!' });
        return;
    }

    chatPanel.webview.postMessage({ type: 'setLoading', loading: true });

    const client = new ApiClient(provider);
    const messages: ChatMessage[] = [{ role: 'user', content: text }];

    try {
        // NON-STREAMING für Zuverlässigkeit
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
        .clear-btn {
            padding: 6px 12px;
            background: transparent;
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .clear-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
        .chat-area {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
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
        .loading {
            color: var(--vscode-foreground);
            opacity: 0.6;
        }
        .loading::after {
            content: '...';
            animation: dots 1s infinite;
        }
        @keyframes dots {
            0%, 20% { content: '.'; }
            40% { content: '..'; }
            60%, 100% { content: '...'; }
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
        <button class="clear-btn" id="clear-btn">🗑️ Neu</button>
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

        const sendBtn = document.getElementById('send-btn');
        const input = document.getElementById('message-input');
        const chatArea = document.getElementById('chat-area');
        const clearBtn = document.getElementById('clear-btn');
        const providerSelect = document.getElementById('provider-select');

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

            // User message
            addMessage('user', text);

            // AI loading message
            const aiDiv = document.createElement('div');
            aiDiv.className = 'message ai';
            aiDiv.innerHTML = '<span class="loading">Antwort wird geladen</span>';
            chatArea.appendChild(aiDiv);
            chatArea.scrollTop = chatArea.scrollHeight;

            vscode.postMessage({ type: 'send', text });

            // Store reference for later
            window.currentAiDiv = aiDiv;
        }

        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'addAiMessage') {
                if (window.currentAiDiv) {
                    window.currentAiDiv.innerHTML = '';
                    window.currentAiDiv.textContent = msg.text;
                    window.currentAiDiv = null;
                }
                isLoading = false;
                sendBtn.disabled = false;
            } else if (msg.type === 'error') {
                if (window.currentAiDiv) {
                    window.currentAiDiv.innerHTML = '<span style="color: #f44336;">❌ ' + msg.message + '</span>';
                    window.currentAiDiv = null;
                }
                isLoading = false;
                sendBtn.disabled = false;
            } else if (msg.type === 'setLoading') {
                sendBtn.disabled = msg.loading;
            } else if (msg.type === 'updateProvider') {
                const info = document.getElementById('provider-info');
                if (info) {
                    info.textContent = msg.name + ' • ' + msg.model;
                }
            }
        });

        input.focus();
    </script>
</body>
</html>`;
}
