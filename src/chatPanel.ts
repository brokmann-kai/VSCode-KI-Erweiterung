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
        } else if (message.type === 'clear') {
            // Refresh happens via message to webview
        } else if (message.type === 'changeProvider') {
            const provider = providerManager.getProviderById(message.id);
            if (provider) {
                providerManager.setActiveProvider(provider.id);
                updateChatProvider();
            }
        }
    });
}

function updateChatProvider(): void {
    if (!chatPanel) return;
    const active = providerManager.getActiveProvider();
    const providers = providerManager.getProviders();

    const selectOptions = providers.map(p =>
        `<option value="${p.id}" ${p.id === active?.id ? 'selected' : ''}>${p.name} (${p.model})</option>`
    ).join('');

    // Update select element via JS
    chatPanel.webview.postMessage({
        type: 'updateProvider',
        name: active?.name || 'Keiner',
        model: active?.model || '',
        url: active?.baseUrl || '',
        selectOptions
    });
}

async function handleSend(text: string): Promise<void> {
    if (!chatPanel) return;
    const provider = providerManager.getActiveProvider();
    if (!provider) return;

    chatPanel.webview.postMessage({ type: 'startStreaming' });

    const client = new ApiClient(provider);
    const messages: ChatMessage[] = [{ role: 'user', content: text }];

    try {
        let response = '';
        await client.sendMessage(messages, { stream: true }, (chunk) => {
            response += chunk;
            chatPanel?.webview.postMessage({ type: 'streamChunk', chunk });
        });
        chatPanel.webview.postMessage({ type: 'finishStreaming', response });
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
        html, body {
            height: 100%;
            overflow: hidden;
        }
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
        .header h1 {
            font-size: 16px;
            font-weight: 600;
        }
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
        .clear-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
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
        .message.streaming::after {
            content: ' ▌';
            animation: blink 1s infinite;
        }
        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0.3; }
        }
        .welcome {
            text-align: center;
            padding: 40px;
            opacity: 0.7;
            margin: auto;
        }
        .welcome h2 { margin-bottom: 12px; font-size: 20px; }
        .welcome p { font-size: 14px; }
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
        .input-area button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .input-area button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>💬 KI Chat</h1>
        <select id="provider-select" onchange="changeProvider(this.value)">
            ${selectOptions}
        </select>
        <button class="clear-btn" onclick="clearChat()">🗑️ Neu</button>
    </div>

    <div class="chat-area" id="chat-area">
        <div class="welcome">
            <h2>Willkommen! 👋</h2>
            <p>Stelle eine Frage an deinen KI-Assistenten</p>
            <p style="margin-top: 8px; opacity: 0.6; font-size: 12px;">
                ${provider?.name || 'Kein Provider'} • ${provider?.model || ''}
            </p>
        </div>
    </div>

    <div class="input-area">
        <input type="text" id="message-input" placeholder="Nachricht eingeben..." onkeypress="handleKeyPress(event)">
        <button onclick="sendMessage()" id="send-btn">→</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isStreaming = false;
        let currentAiDiv = null;

        function handleKeyPress(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        function sendMessage() {
            const input = document.getElementById('message-input');
            const text = input.value.trim();
            if (!text || isStreaming) return;

            input.value = '';
            isStreaming = true;
            document.getElementById('send-btn').disabled = true;

            addMessage('user', text);
            currentAiDiv = addMessage('ai', '', true);

            vscode.postMessage({ type: 'send', text });
        }

        function addMessage(role, text, streaming = false) {
            const chatArea = document.getElementById('chat-area');
            const welcome = chatArea.querySelector('.welcome');
            if (welcome) welcome.remove();

            const div = document.createElement('div');
            div.className = 'message ' + role + (streaming ? ' streaming' : '');
            div.textContent = text;
            chatArea.appendChild(div);
            chatArea.scrollTop = chatArea.scrollHeight;
            return div;
        }

        function appendToMessage(div, text) {
            div.textContent += text;
            document.getElementById('chat-area').scrollTop = document.getElementById('chat-area').scrollHeight;
        }

        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'streamChunk') {
                if (currentAiDiv) {
                    appendToMessage(currentAiDiv, msg.chunk);
                }
            } else if (msg.type === 'startStreaming') {
                // Already handled in sendMessage
            } else if (msg.type === 'finishStreaming') {
                if (currentAiDiv) {
                    currentAiDiv.textContent = msg.response;
                    currentAiDiv.classList.remove('streaming');
                }
                isStreaming = false;
                document.getElementById('send-btn').disabled = false;
                currentAiDiv = null;
            } else if (msg.type === 'error') {
                if (currentAiDiv) {
                    currentAiDiv.textContent = '❌ Fehler: ' + msg.message;
                    currentAiDiv.classList.remove('streaming');
                    currentAiDiv.classList.add('error');
                }
                isStreaming = false;
                document.getElementById('send-btn').disabled = false;
                currentAiDiv = null;
            } else if (msg.type === 'updateProvider') {
                const welcome = document.querySelector('.welcome p:last-child');
                if (welcome) {
                    welcome.textContent = msg.name + ' • ' + msg.model;
                }
                document.getElementById('provider-select').innerHTML = msg.selectOptions;
            }
        });

        function clearChat() {
            const chatArea = document.getElementById('chat-area');
            chatArea.innerHTML = '<div class="welcome"><h2>Chat gelöscht! 🗑️</h2><p>Stelle eine neue Frage.</p></div>';
            vscode.postMessage({ type: 'clear' });
        }

        function changeProvider(id) {
            vscode.postMessage({ type: 'changeProvider', id });
        }

        document.getElementById('message-input').focus();
    </script>
</body>
</html>`;
}
