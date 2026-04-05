import * as vscode from 'vscode';
import { ProviderManager } from './provider';
import { ProviderPanel } from './webview';

export function registerCommands(context: vscode.ExtensionContext, providerManager: ProviderManager): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.configure', () => {
            providerManager.createDefaultProviders();
            ProviderPanel.createOrShow(context.extensionUri, providerManager);
        }),

        vscode.commands.registerCommand('aiProviderManager.addProvider', async () => {
            const name = await vscode.window.showInputBox({
                prompt: 'Name des Providers (z.B. OpenAI, Anthropic)',
                placeHolder: 'Provider Name'
            });
            if (!name) return;

            const model = await vscode.window.showInputBox({
                prompt: 'Modell (z.B. gpt-4, claude-3-sonnet)',
                placeHolder: 'Modell Name'
            });
            if (!model) return;

            const baseUrl = await vscode.window.showInputBox({
                prompt: 'API Basis-URL',
                placeHolder: 'https://api.example.com/v1'
            });
            if (!baseUrl) return;

            const newProvider = providerManager.addProvider({
                name,
                model,
                baseUrl,
                headers: [],
                enabled: true
            });

            vscode.window.showInformationMessage(`Provider "${name}" hinzugefügt.`);
            ProviderPanel.createOrShow(context.extensionUri, providerManager);
        }),

        vscode.commands.registerCommand('aiProviderManager.setActiveProvider', async () => {
            const providers = providerManager.getProviders();
            if (providers.length === 0) {
                vscode.window.showInformationMessage('Keine Provider konfiguriert.');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                providers.map(p => ({
                    label: p.name,
                    description: `${p.model} - ${p.baseUrl}`,
                    provider: p
                })),
                { placeHolder: 'Provider auswählen' }
            );

            if (selected) {
                providerManager.setActiveProvider(selected.provider.id);
                vscode.window.showInformationMessage(`Aktiver Provider: ${selected.label}`);
            }
        }),

        vscode.commands.registerCommand('aiProviderManager.showQuickPick', () => {
            const providers = providerManager.getProviders();
            const active = providerManager.getActiveProvider();

            const items = providers.map(p => ({
                label: p.name + (p.id === active?.id ? ' ✓' : ''),
                description: p.model,
                provider: p
            }));

            vscode.window.showQuickPick(items, {
                placeHolder: 'KI-Provider auswählen'
            }).then(selected => {
                if (selected) {
                    providerManager.setActiveProvider(selected.provider.id);
                    vscode.window.showInformationMessage(`Provider gewechselt zu: ${selected.label}`);
                }
            });
        })
    );
}
