import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';

export class ProviderTreeItem extends vscode.TreeItem {
    constructor(
        public readonly provider: AIProvider,
        public readonly isActive: boolean
    ) {
        super(provider.name);
        this.description = `${provider.model} ${isActive ? '✅' : ''}`;
        this.tooltip = `${provider.name}\n${provider.model}\n${provider.baseUrl}`;
        this.contextValue = 'provider';
    }
}

export class ProviderTreeProvider implements vscode.TreeDataProvider<ProviderTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProviderTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private providerManager: ProviderManager) {}

    getTreeItem(element: ProviderTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ProviderTreeItem[] {
        const providers = this.providerManager.getProviders();
        const activeId = this.providerManager.getActiveProvider()?.id;
        return providers.map(p => new ProviderTreeItem(p, p.id === activeId));
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

export function registerTreeView(context: vscode.ExtensionContext, providerManager: ProviderManager): void {
    const treeProvider = new ProviderTreeProvider(providerManager);

    vscode.window.registerTreeDataProvider('ai-provider-manager-view', treeProvider);

    vscode.commands.registerCommand('aiProviderManager.addProvider', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Name des Providers (z.B. OpenAI, Ollama)',
            placeHolder: 'Provider Name'
        });
        if (!name) return;

        const model = await vscode.window.showInputBox({
            prompt: 'Modell (z.B. gpt-4, llama3)',
            placeHolder: 'Modell Name'
        });
        if (!model) return;

        const baseUrl = await vscode.window.showInputBox({
            prompt: 'API Basis-URL',
            placeHolder: 'https://api.example.com/v1'
        });
        if (!baseUrl) return;

        providerManager.addProvider({
            name,
            model,
            baseUrl,
            headers: [],
            systemPrompt: '',
            enabled: true
        });

        treeProvider.refresh();
        vscode.window.showInformationMessage(`Provider "${name}" hinzugefügt!`);
    });

    vscode.commands.registerCommand('aiProviderManager.setActiveProvider', async () => {
        const providers = providerManager.getProviders();
        const items = providers.map(p => ({
            label: p.name,
            description: `${p.model}`,
            provider: p
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Provider auswählen'
        });

        if (selected) {
            providerManager.setActiveProvider(selected.provider.id);
            treeProvider.refresh();
            vscode.window.showInformationMessage(`Aktiv: ${selected.label}`);
        }
    });

    vscode.commands.registerCommand('aiProviderManager.configure', () => {
        const panel = vscode.window.createWebviewPanel(
            'aiProviderConfig',
            '⚙️ KI Provider Einstellungen',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const configPath = providerManager.getConfigPath();
        const providers = providerManager.getProviders();
        const active = providerManager.getActiveProvider();

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-foreground);
                    }
                    h1 { font-size: 18px; margin-bottom: 20px; }
                    .provider-card {
                        background: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 8px;
                        padding: 16px;
                        margin-bottom: 12px;
                    }
                    .provider-card.active {
                        border-color: #4CAF50;
                    }
                    .provider-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }
                    .provider-name { font-weight: 600; font-size: 16px; }
                    .active-badge {
                        background: #4CAF50;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                    }
                    .model { color: #888; font-size: 14px; }
                    .url { color: #666; font-size: 12px; font-family: monospace; }
                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .btn-success {
                        background: #4CAF50;
                        color: white;
                    }
                    .add-section {
                        text-align: center;
                        padding: 20px;
                        border: 2px dashed #666;
                        border-radius: 8px;
                        margin-top: 20px;
                    }
                    .config-path {
                        margin-top: 20px;
                        font-size: 11px;
                        color: #666;
                    }
                </style>
            </head>
            <body>
                <h1>⚙️ KI Provider Einstellungen</h1>
                <div id="providers"></div>
                <div class="add-section">
                    <p>Neuen Provider hinzufügen:</p>
                    <button class="btn btn-primary" onclick="addProvider()">➕ Neuer Provider</button>
                </div>
                <div class="config-path">
                    Konfigurationsdatei: ${configPath}
                </div>
                <script>
                    const providers = ${JSON.stringify(providers)};
                    const activeId = "${active?.id || ''}";
                    const vscode = acquireVsCodeApi();

                    function render() {
                        const container = document.getElementById('providers');
                        container.innerHTML = providers.map(p => \`
                            <div class="provider-card \${p.id === activeId ? 'active' : ''}">
                                <div class="provider-header">
                                    <span class="provider-name">\${p.name}</span>
                                    \${p.id === activeId ? '<span class="active-badge">Aktiv</span>' : ''}
                                </div>
                                <div class="model">\${p.model}</div>
                                <div class="url">\${p.baseUrl}</div>
                                \${p.id !== activeId ? \`<button class="btn btn-success" onclick="setActive('\${p.id}')">✅ Aktivieren</button>\` : ''}
                            </div>
                        \`).join('');
                    }

                    function setActive(id) {
                        vscode.postMessage({ type: 'setActive', id });
                    }

                    function addProvider() {
                        vscode.postMessage({ type: 'addProvider' });
                    }

                    window.addEventListener('message', event => {
                        if (event.data.type === 'refresh') {
                            providers.length = 0;
                            providers.push(...event.data.providers);
                            render();
                        }
                    });

                    render();
                </script>
            </body>
            </html>
        `;

        panel.webview.onDidReceiveMessage(message => {
            if (message.type === 'setActive') {
                providerManager.setActiveProvider(message.id);
                treeProvider.refresh();
            } else if (message.type === 'addProvider') {
                vscode.commands.executeCommand('aiProviderManager.addProvider');
            }
        });
    });

    vscode.commands.registerCommand('aiProviderManager.showQuickPick', async () => {
        const providers = providerManager.getProviders();
        const items = providers.map(p => ({
            label: `$(hubot) ${p.name}`,
            description: p.model,
            provider: p
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Provider auswählen'
        });

        if (selected) {
            providerManager.setActiveProvider(selected.provider.id);
            treeProvider.refresh();
            vscode.window.showInformationMessage(`Provider: ${selected.label}`);
        }
    });
}
