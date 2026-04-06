import * as vscode from 'vscode';
import { ProviderManager } from './provider';
import { ConfigStore } from './config';
import { registerCommands } from './commands';

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage('✅ AI Provider Manager geladen!');

    const configStore = new ConfigStore(context);
    const providerManager = new ProviderManager(configStore);

    providerManager.createDefaultProviders();

    // Status Bar Button
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = `$(hubot) AI: ${providerManager.getActiveProvider()?.name || 'Keiner'}`;
    statusBarItem.tooltip = '⚙️ KI Provider Einstellungen';
    statusBarItem.command = 'aiProviderManager.openConfig';
    statusBarItem.show();

    // Command für Konfigurations-Panel
    vscode.commands.registerCommand('aiProviderManager.openConfig', () => {
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
        } else {
            currentPanel = vscode.window.createWebviewPanel(
                'aiProviderConfig',
                '⚙️ KI Provider Einstellungen',
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );
            currentPanel.onDidDispose(() => {
                currentPanel = undefined;
            });
            const providers = providerManager.getProviders();
            const activeId = providerManager.getActiveProvider()?.id ?? null;
            currentPanel.webview.html = buildConfigHtml(providers, activeId);
            currentPanel.webview.onDidReceiveMessage(message => {
                handlePanelMessage(message, providerManager, currentPanel!);
            });
        }
    });

    registerCommands(context, providerManager);
}

function buildConfigHtml(providers: any[], activeId: string | null): string {
    return `<!DOCTYPE html>
<html>
<head>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .header h1 { font-size: 20px; font-weight: 600; }
        .add-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
        }
        .add-btn:hover { background: var(--vscode-button-hoverBackground); }
        .provider-list { display: flex; flex-direction: column; gap: 16px; }
        .provider-card {
            background: var(--vscode-editorWidget-background);
            border: 2px solid var(--vscode-widget-border);
            border-radius: 12px;
            padding: 20px;
        }
        .provider-card.active { border-color: #4CAF50; }
        .provider-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }
        .provider-info h3 { font-size: 18px; margin-bottom: 4px; }
        .model { color: var(--vscode-foreground); opacity: 0.7; font-size: 14px; }
        .badge {
            background: #4CAF50;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
        }
        .provider-url {
            font-family: monospace;
            font-size: 12px;
            opacity: 0.6;
            margin-bottom: 12px;
            word-break: break-all;
        }
        .headers-section {
            background: var(--vscode-editor-background);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
        }
        .headers-title { font-size: 12px; opacity: 0.7; margin-bottom: 8px; }
        .header-item { font-size: 13px; font-family: monospace; padding: 4px 0; }
        .header-key { font-weight: 600; }
        .actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            cursor: pointer;
        }
        .btn-success { background: #4CAF50; color: white; }
        .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .btn-danger { background: #f44336; color: white; }
        .empty { text-align: center; padding: 60px 20px; opacity: 0.6; }
        .config-hint {
            margin-top: 24px;
            padding: 16px;
            background: var(--vscode-editorWidget-background);
            border-radius: 8px;
            font-size: 12px;
            opacity: 0.7;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚙️ KI Provider</h1>
        <button class="add-btn" onclick="addProvider()">➕ Neuer Provider</button>
    </div>
    <div class="provider-list">
        ${providers.length === 0 ? `
            <div class="empty">
                <h3>Keine Provider konfiguriert</h3>
                <p>Klicke oben auf "Neuer Provider" um zu beginnen.</p>
            </div>
        ` : providers.map(p => `
            <div class="provider-card ${p.id === activeId ? 'active' : ''}">
                <div class="provider-header">
                    <div class="provider-info">
                        <h3>${p.name}</h3>
                        <div class="model">${p.model}</div>
                    </div>
                    ${p.id === activeId ? '<span class="badge">✓ Aktiv</span>' : ''}
                </div>
                <div class="provider-url">${p.baseUrl}</div>
                <div class="headers-section">
                    <div class="headers-title">Headers</div>
                    ${p.headers.length === 0 ? '<div style="opacity:0.5;font-size:12px">Keine Headers</div>' : ''}
                    ${p.headers.map((h: any) => `
                        <div class="header-item">
                            <span class="header-key">${h.key}:</span>
                            <span> ${h.value.substring(0, 20)}${h.value.length > 20 ? '...' : ''}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="actions">
                    ${p.id !== activeId ? `<button class="btn btn-success" onclick="setActive('${p.id}')">✅ Aktivieren</button>` : ''}
                    <button class="btn btn-primary" onclick="editProvider('${p.id}')">🔧 Bearbeiten</button>
                    <button class="btn btn-danger" onclick="deleteProvider('${p.id}')">🗑️ Löschen</button>
                </div>
            </div>
        `).join('')}
    </div>
    <div class="config-hint">
        💡 Konfiguration: ~/.ai-provider-manager/config.json
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let providers = ${JSON.stringify(providers)};
        let activeId = "${activeId || ''}";

        function addProvider() { vscode.postMessage({ type: 'addProvider' }); }
        function setActive(id) { vscode.postMessage({ type: 'setActive', id }); }
        function editProvider(id) {
            const p = providers.find(x => x.id === id);
            vscode.postMessage({ type: 'editProvider', provider: p });
        }
        function deleteProvider(id) {
            if (confirm('Provider wirklich löschen?')) {
                vscode.postMessage({ type: 'deleteProvider', id });
            }
        }
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'update') {
                providers = msg.providers;
                activeId = msg.activeId;
                location.reload();
            }
        });
    </script>
</body>
</html>`;
}

async function handlePanelMessage(message: any, providerManager: ProviderManager, panel: vscode.WebviewPanel): Promise<void> {
    switch (message.type) {
        case 'addProvider':
            const name = await vscode.window.showInputBox({ prompt: 'Name', placeHolder: 'z.B. OpenAI' });
            if (!name) return;
            const model = await vscode.window.showInputBox({ prompt: 'Modell', placeHolder: 'z.B. gpt-4' });
            if (!model) return;
            const url = await vscode.window.showInputBox({ prompt: 'API URL', placeHolder: 'https://api.openai.com/v1' });
            if (!url) return;
            const key = await vscode.window.showInputBox({ prompt: 'API Key (Enter für leer)', placeHolder: 'sk-...' });

            const headers: any[] = [];
            if (key) {
                if (url.includes('openai.com')) headers.push({ key: 'Authorization', value: `Bearer ${key}`, enabled: true });
                else if (url.includes('anthropic.com')) {
                    headers.push({ key: 'x-api-key', value: key, enabled: true });
                    headers.push({ key: 'anthropic-version', value: '2023-06-01', enabled: true });
                } else headers.push({ key: 'Authorization', value: `Bearer ${key}`, enabled: true });
            }

            providerManager.addProvider({ name, model, baseUrl: url, headers, enabled: true });
            vscode.window.showInformationMessage(`✅ "${name}" hinzugefügt!`);
            refreshPanel(providerManager, panel);
            break;

        case 'setActive':
            providerManager.setActiveProvider(message.id);
            refreshPanel(providerManager, panel);
            vscode.window.showInformationMessage(`✅ Aktiv!`);
            break;

        case 'editProvider':
            const p = message.provider;
            const newModel = await vscode.window.showInputBox({ prompt: 'Modell', value: p.model });
            if (newModel === undefined) return;
            const newUrl = await vscode.window.showInputBox({ prompt: 'API URL', value: p.baseUrl });
            if (newUrl === undefined) return;
            const newKey = await vscode.window.showInputBox({ prompt: 'API Key (Enter zum Leeren)', placeHolder: 'sk-...' });

            const newHeaders: any[] = [];
            if (newKey) {
                if (newUrl.includes('openai.com')) newHeaders.push({ key: 'Authorization', value: `Bearer ${newKey}`, enabled: true });
                else if (newUrl.includes('anthropic.com')) {
                    newHeaders.push({ key: 'x-api-key', value: newKey, enabled: true });
                    newHeaders.push({ key: 'anthropic-version', value: '2023-06-01', enabled: true });
                } else newHeaders.push({ key: 'Authorization', value: `Bearer ${newKey}`, enabled: true });
            }

            providerManager.updateProvider(p.id, { model: newModel, baseUrl: newUrl, headers: newHeaders });
            vscode.window.showInformationMessage(`✅ aktualisiert!`);
            refreshPanel(providerManager, panel);
            break;

        case 'deleteProvider':
            providerManager.deleteProvider(message.id);
            refreshPanel(providerManager, panel);
            vscode.window.showInformationMessage(`🗑️ Gelöscht!`);
            break;
    }
}

function refreshPanel(providerManager: ProviderManager, panel: vscode.WebviewPanel): void {
    const providers = providerManager.getProviders();
    const activeId = providerManager.getActiveProvider()?.id ?? null;
    panel.webview.html = buildConfigHtml(providers, activeId);
}

export function deactivate() {}
