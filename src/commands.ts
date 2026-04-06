import * as vscode from 'vscode';
import { ProviderManager } from './provider';

export function registerCommands(context: vscode.ExtensionContext, providerManager: ProviderManager, refreshPanel?: () => void): void {

    // Command: Provider wechseln
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.showQuickPick', async () => {
            const providers = providerManager.getProviders();
            if (providers.length === 0) {
                vscode.window.showInformationMessage('Keine Provider!');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                providers.map(p => ({
                    label: p.name,
                    description: `${p.model}`,
                    provider: p
                })),
                { placeHolder: 'Provider auswählen' }
            );

            if (selected) {
                providerManager.setActiveProvider(selected.provider.id);
                vscode.window.showInformationMessage(`✅ Aktiv: ${selected.label}`);
            }
        })
    );

    // Command: Mit KI chatten (einfach)
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.chatWithActive', async () => {
            const provider = providerManager.getActiveProvider();
            if (!provider) {
                vscode.window.showInformationMessage('Kein aktiver Provider! Bitte zuerst konfigurieren.');
                return;
            }

            const prompt = await vscode.window.showInputBox({
                prompt: `An ${provider.name} senden:`,
                placeHolder: 'Deine Frage...'
            });
            if (!prompt) return;

            // Ergebnis in Terminal anzeigen
            const terminal = vscode.window.createTerminal(`KI: ${provider.name}`);
            terminal.show();
            terminal.sendText(`\n🤖 ${provider.name} (${provider.model}) antwortet...\n`);
        })
    );
}
