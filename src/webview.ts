import * as vscode from 'vscode';
import { ProviderManager, AIProvider, ProviderHeader } from './provider';

export class ProviderPanel {
    public static currentPanel: ProviderPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private providerManager: ProviderManager;

    public static createOrShow(extensionUri: vscode.Uri, providerManager: ProviderManager): void {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (ProviderPanel.currentPanel) {
            ProviderPanel.currentPanel.panel.reveal(column);
            ProviderPanel.currentPanel.providerManager = providerManager;
            ProviderPanel.currentPanel.update();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'aiProviderManager',
            'AI Provider Manager',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ProviderPanel.currentPanel = new ProviderPanel(panel, extensionUri, providerManager);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, providerManager: ProviderManager) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.providerManager = providerManager;

        this.panel.webview.html = this.getHtmlForWebview();
        this.panel.webview.onDidReceiveMessage(message => this.handleMessage(message));

        this.panel.onDidDispose(() => {
            ProviderPanel.currentPanel = undefined;
        });
    }

    private update(): void {
        this.panel.webview.postMessage({
            type: 'update',
            providers: this.providerManager.getProviders(),
            activeProvider: this.providerManager.getActiveProvider()
        });
    }

    private handleMessage(message: any): void {
        switch (message.type) {
            case 'saveProvider':
                this.saveProvider(message.provider);
                break;
            case 'deleteProvider':
                this.deleteProvider(message.id);
                break;
            case 'setActive':
                this.setActive(message.id);
                break;
            case 'addHeader':
                this.addHeader(message.providerId);
                break;
            case 'removeHeader':
                this.removeHeader(message.providerId, message.headerIndex);
                break;
            case 'updateHeader':
                this.updateHeader(message.providerId, message.headerIndex, message.header);
                break;
        }
    }

    private saveProvider(provider: AIProvider): void {
        if (provider.id.startsWith('provider_')) {
            this.providerManager.addProvider({
                name: provider.name,
                model: provider.model,
                baseUrl: provider.baseUrl,
                headers: provider.headers,
                systemPrompt: provider.systemPrompt || '',
                enabled: provider.enabled
            });
        } else {
            this.providerManager.updateProvider(provider.id, provider);
        }
        this.update();
        vscode.window.showInformationMessage('Provider gespeichert!');
    }

    private deleteProvider(id: string): void {
        this.providerManager.deleteProvider(id);
        this.update();
        vscode.window.showInformationMessage('Provider gelöscht!');
    }

    private setActive(id: string): void {
        this.providerManager.setActiveProvider(id);
        this.update();
    }

    private addHeader(providerId: string): void {
        const provider = this.providerManager.getProviderById(providerId);
        if (provider) {
            provider.headers.push({ key: '', value: '', enabled: true });
            this.providerManager.updateProvider(providerId, { headers: provider.headers });
            this.update();
        }
    }

    private removeHeader(providerId: string, headerIndex: number): void {
        const provider = this.providerManager.getProviderById(providerId);
        if (provider) {
            provider.headers.splice(headerIndex, 1);
            this.providerManager.updateProvider(providerId, { headers: provider.headers });
            this.update();
        }
    }

    private updateHeader(providerId: string, headerIndex: number, header: ProviderHeader): void {
        const provider = this.providerManager.getProviderById(providerId);
        if (provider) {
            provider.headers[headerIndex] = header;
            this.providerManager.updateProvider(providerId, { headers: provider.headers });
        }
    }

    private getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Provider Manager</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        h1 {
            font-size: 18px;
            margin: 0;
        }
        .provider-card {
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .provider-card.active {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        .provider-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .provider-name {
            font-size: 16px;
            font-weight: 600;
        }
        .badge {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .form-group {
            margin-bottom: 12px;
        }
        label {
            display: block;
            font-size: 12px;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
            opacity: 0.8;
        }
        input {
            width: 100%;
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 4px;
            color: var(--vscode-foreground);
            font-size: 14px;
        }
        input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .headers-section {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-widget-border);
        }
        .header-row {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
            align-items: center;
        }
        .header-row input[type="checkbox"] {
            width: auto;
        }
        .header-row input[type="text"] {
            flex: 1;
        }
        .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: var(--vscode-badge-background);
            color: var(--vscode-foreground);
        }
        .btn-danger {
            background: #d32f2f;
            color: white;
        }
        .btn-danger:hover {
            background: #b71c1c;
        }
        .btn-small {
            padding: 4px 8px;
            font-size: 11px;
        }
        .actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }
        .add-provider {
            text-align: center;
            padding: 20px;
            border: 2px dashed var(--vscode-widget-border);
            border-radius: 8px;
            cursor: pointer;
        }
        .add-provider:hover {
            border-color: var(--vscode-focusBorder);
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-foreground);
            opacity: 0.6;
        }
        .config-path {
            font-size: 11px;
            color: var(--vscode-foreground);
            opacity: 0.6;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>KI-Provider Manager</h1>
        <span class="badge" id="provider-count">0 Provider</span>
    </div>

    <div id="providers-list"></div>

    <div class="add-provider" id="add-provider-btn">
        + Neuen Provider hinzufügen
    </div>

    <div class="config-path" id="config-path"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let providers = [];
        let activeProvider = null;

        function render() {
            const list = document.getElementById('providers-list');
            const countBadge = document.getElementById('provider-count');
            const configPath = document.getElementById('config-path');

            countBadge.textContent = providers.length + ' Provider';
            configPath.textContent = 'Konfiguration: ~/.ai-provider-manager/config.json';

            if (providers.length === 0) {
                list.innerHTML = '<div class="empty-state">Keine Provider konfiguriert.<br>Klicke unten um einen neuen Provider hinzuzufügen.</div>';
                return;
            }

            list.innerHTML = providers.map(p => {
                const isActive = activeProvider && p.id === activeProvider.id;
                return \`
                    <div class="provider-card \${isActive ? 'active' : ''}" data-id="\${p.id}">
                        <div class="provider-header">
                            <span class="provider-name">
                                \${p.name}
                                \${isActive ? '<span class="badge">Aktiv</span>' : ''}
                            </span>
                        </div>

                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" value="\${p.name}" data-field="name" placeholder="z.B. OpenAI">
                        </div>

                        <div class="form-group">
                            <label>Modell</label>
                            <input type="text" value="\${p.model}" data-field="model" placeholder="z.B. gpt-4">
                        </div>

                        <div class="form-group">
                            <label>API Basis-URL</label>
                            <input type="text" value="\${p.baseUrl}" data-field="baseUrl" placeholder="https://api.example.com/v1">
                        </div>

                        <div class="headers-section">
                            <label>Headers</label>
                            \${p.headers.map((h, i) => \`
                                <div class="header-row">
                                    <input type="checkbox" \${h.enabled ? 'checked' : ''} data-header-index="\${i}" data-header-field="enabled">
                                    <input type="text" value="\${h.key}" placeholder="Key (z.B. Authorization)" data-header-index="\${i}" data-header-field="key">
                                    <input type="text" value="\${h.value}" placeholder="Value" data-header-index="\${i}" data-header-field="value">
                                    <button class="btn btn-danger btn-small" onclick="removeHeader('\${p.id}', \${i})">×</button>
                                </div>
                            \`).join('')}
                            <button class="btn btn-secondary btn-small" onclick="addHeader('\${p.id}')">+ Header</button>
                        </div>

                        <div class="actions">
                            \${!isActive ? \`<button class="btn btn-primary" onclick="setActive('\${p.id}')">Aktivieren</button>\` : ''}
                            <button class="btn btn-primary" onclick="saveProvider('\${p.id}')">Speichern</button>
                            <button class="btn btn-danger" onclick="deleteProvider('\${p.id}')">Löschen</button>
                        </div>
                    </div>
                \`;
            }).join('');

            // Event listeners
            list.querySelectorAll('input[data-field]').forEach(input => {
                input.addEventListener('change', handleFieldChange);
            });

            list.querySelectorAll('input[data-header-field]').forEach(input => {
                input.addEventListener('change', handleHeaderChange);
            });
        }

        function handleFieldChange(e) {
            const card = e.target.closest('.provider-card');
            const id = card.dataset.id;
            const field = e.target.dataset.field;
            const provider = providers.find(p => p.id === id);
            if (provider) {
                provider[field] = e.target.value;
            }
        }

        function handleHeaderChange(e) {
            const card = e.target.closest('.provider-card');
            const id = card.dataset.id;
            const index = parseInt(e.target.dataset.headerIndex);
            const field = e.target.dataset.headerField;
            const provider = providers.find(p => p.id === id);
            if (provider && provider.headers[index]) {
                if (field === 'enabled') {
                    provider.headers[index].enabled = e.target.checked;
                } else {
                    provider.headers[index][field] = e.target.value;
                }
                vscode.postMessage({
                    type: 'updateHeader',
                    providerId: id,
                    headerIndex: index,
                    header: provider.headers[index]
                });
            }
        }

        function addHeader(providerId) {
            vscode.postMessage({ type: 'addHeader', providerId });
        }

        function removeHeader(providerId, headerIndex) {
            vscode.postMessage({ type: 'removeHeader', providerId, headerIndex });
        }

        function setActive(id) {
            vscode.postMessage({ type: 'setActive', id });
        }

        function saveProvider(id) {
            const provider = providers.find(p => p.id === id);
            if (provider) {
                vscode.postMessage({ type: 'saveProvider', provider });
            }
        }

        function deleteProvider(id) {
            if (confirm('Provider wirklich löschen?')) {
                vscode.postMessage({ type: 'deleteProvider', id });
            }
        }

        document.getElementById('add-provider-btn').addEventListener('click', () => {
            const newProvider = {
                id: 'provider_' + Date.now(),
                name: 'Neuer Provider',
                model: '',
                baseUrl: '',
                headers: [],
                enabled: true
            };
            providers.push(newProvider);
            render();
            // Scroll to new provider
            const cards = document.querySelectorAll('.provider-card');
            cards[cards.length - 1].scrollIntoView({ behavior: 'smooth' });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                providers = message.providers;
                activeProvider = message.activeProvider;
                render();
            }
        });

        // Initial render
        vscode.postMessage({ type: 'init' });
    </script>
</body>
</html>`;
    }
}
