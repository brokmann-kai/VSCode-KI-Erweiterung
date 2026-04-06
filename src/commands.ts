import * as vscode from 'vscode';
import { ProviderManager } from './provider';

export function registerCommands(context: vscode.ExtensionContext, providerManager: ProviderManager): void {

    // Command: Provider wechseln
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.showQuickPick', async () => {
            const providers = providerManager.getProviders();
            if (providers.length === 0) {
                vscode.window.showInformationMessage('Keine Provider! Bitte erst einen hinzufügen.');
                return;
            }

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
                vscode.window.showInformationMessage(`✅ Aktiv: ${selected.label}`);
            }
        })
    );

    // Command: Neuer Provider mit API Key
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.configure', async () => {
            // Schritt 1: Name
            const name = await vscode.window.showInputBox({
                prompt: 'Name des Providers',
                placeHolder: 'z.B. OpenAI, Ollama, Anthropic'
            });
            if (!name) return;

            // Schritt 2: Modell
            const model = await vscode.window.showInputBox({
                prompt: 'Modell',
                placeHolder: 'z.B. gpt-4, llama3, claude-3-sonnet'
            });
            if (!model) return;

            // Schritt 3: API URL
            const baseUrl = await vscode.window.showInputBox({
                prompt: 'API URL',
                placeHolder: 'https://api.openai.com/v1'
            });
            if (!baseUrl) return;

            // Schritt 4: API Key (optional)
            const apiKey = await vscode.window.showInputBox({
                prompt: 'API Key (optional, Enter für leer)',
                placeHolder: 'sk-... oder leer lassen'
            });

            // Headers zusammenbauen
            const headers: { key: string; value: string; enabled: boolean }[] = [];

            if (apiKey) {
                // OpenAI Style
                if (baseUrl.includes('openai.com')) {
                    headers.push({ key: 'Authorization', value: `Bearer ${apiKey}`, enabled: true });
                }
                // Anthropic Style
                else if (baseUrl.includes('anthropic.com')) {
                    headers.push({ key: 'x-api-key', value: apiKey, enabled: true });
                    headers.push({ key: 'anthropic-version', value: '2023-06-01', enabled: true });
                }
                // Default
                else {
                    headers.push({ key: 'Authorization', value: `Bearer ${apiKey}`, enabled: true });
                }
            }

            providerManager.addProvider({
                name,
                model,
                baseUrl,
                headers,
                enabled: true
            });

            vscode.window.showInformationMessage(`✅ Provider "${name}" hinzugefügt!`);
        })
    );

    // Command: Bestehenden Provider bearbeiten
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.editProvider', async () => {
            const providers = providerManager.getProviders();
            if (providers.length === 0) {
                vscode.window.showInformationMessage('Keine Provider vorhanden.');
                return;
            }

            const selected = await vscode.window.showQuickPick(
                providers.map(p => ({
                    label: p.name,
                    description: `${p.model}`,
                    provider: p
                })),
                { placeHolder: 'Provider zum Bearbeiten auswählen' }
            );

            if (!selected) return;

            // Neuen API Key abfragen
            const newApiKey = await vscode.window.showInputBox({
                prompt: `Neuer API Key für ${selected.provider.name}`,
                placeHolder: 'sk-... (Enter zum Leeren)'
            });

            // Headers aktualisieren
            const headers: { key: string; value: string; enabled: boolean }[] = [];

            if (newApiKey) {
                if (selected.provider.baseUrl.includes('openai.com')) {
                    headers.push({ key: 'Authorization', value: `Bearer ${newApiKey}`, enabled: true });
                } else if (selected.provider.baseUrl.includes('anthropic.com')) {
                    headers.push({ key: 'x-api-key', value: newApiKey, enabled: true });
                    headers.push({ key: 'anthropic-version', value: '2023-06-01', enabled: true });
                } else {
                    headers.push({ key: 'Authorization', value: `Bearer ${newApiKey}`, enabled: true });
                }
            }

            providerManager.updateProvider(selected.provider.id, { headers });

            vscode.window.showInformationMessage(`✅ API Key für "${selected.provider.name}" aktualisiert!`);
        })
    );

    // Command: Mit aktivem Provider chatten
    context.subscriptions.push(
        vscode.commands.registerCommand('aiProviderManager.chatWithActive', async () => {
            const provider = providerManager.getActiveProvider();
            if (!provider) {
                vscode.window.showInformationMessage('Kein aktiver Provider!');
                return;
            }

            const prompt = await vscode.window.showInputBox({
                prompt: `An ${provider.name} senden:`,
                placeHolder: 'Deine Frage...'
            });
            if (!prompt) return;

            vscode.window.showInformationMessage(`${provider.name} antwortet...`);

            // Response in neuem Dokument anzeigen
            const doc = await vscode.workspace.openTextDocument({
                content: `# Chat mit ${provider.name}\n\n## Frage:\n${prompt}\n\n## Antwort:\n(Wird geladen...)`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
        })
    );
}
