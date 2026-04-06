import * as vscode from 'vscode';
import { ProviderManager } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

export function registerCommands(context: vscode.ExtensionContext, providerManager: ProviderManager): void {

    // Schnell-Chat Command
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.quickChat', async () => {
            const provider = providerManager.getActiveProvider();
            if (!provider) {
                vscode.window.showInformationMessage('Kein Provider konfiguriert! Bitte zuerst einen Provider einrichten.');
                return;
            }

            const prompt = await vscode.window.showInputBox({
                prompt: `An ${provider.name} senden:`,
                placeHolder: 'Deine Frage...'
            });
            if (!prompt) return;

            // Terminal öffnen und Antwort anzeigen
            const terminal = vscode.window.createTerminal(`KI: ${provider.name}`);
            terminal.show();
            terminal.sendText(`\n🤖 ${provider.name} (${provider.model})\n`);
            terminal.sendText('─'.repeat(50) + '\n');
            terminal.sendText('Antwort wird geladen...\n');

            const client = new ApiClient(provider);
            const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

            try {
                let response = '';
                await client.sendMessage(messages, { stream: true }, (chunk) => {
                    response += chunk;
                });

                // Ergebnis in neues Document
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Chat mit ${provider.name}\n\n**Modell:** ${provider.model}\n**URL:** ${provider.baseUrl}\n\n---\n\n## Frage:\n${prompt}\n\n---\n\n## Antwort:\n${response}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Fehler: ${error.message}`);
            }
        })
    );
}
