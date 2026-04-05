import * as vscode from 'vscode';
import { ProviderManager } from './provider';
import { ProviderPanel } from './webview';

export function registerCommands(context: vscode.ExtensionContext, providerManager: ProviderManager): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.chatWithProvider', async () => {
            const providers = providerManager.getProviders();
            if (providers.length === 0) {
                vscode.window.showInformationMessage('Keine Provider konfiguriert. Bitte zuerst Provider hinzufügen.');
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
                vscode.window.showInformationMessage(`Mit ${selected.label} chatten - nutze @${selected.provider.name.toLowerCase()} im Chat`);
            }
        })
    );
}
