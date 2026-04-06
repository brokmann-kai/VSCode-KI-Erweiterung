import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

export function registerChatParticipants(context: vscode.ExtensionContext, providerManager: ProviderManager): void {
    const providers = providerManager.getProviders();

    // Erstelle Participant für JEDEN Provider
    for (const provider of providers) {
        const name = provider.name.toLowerCase().replace(/\s+/g, '');
        const id = `aiProviderManager.${name}`;

        const participant = vscode.chat.createChatParticipant(id, async (request, context, stream, token) => {
            await handleChat(provider, request, stream);
        });

        context.subscriptions.push(participant);
    }

    // @ai - Zeigt QuickPick zur Provider-Auswahl
    const aiParticipant = vscode.chat.createChatParticipant('aiProviderManager.ai', async (request, context, stream, token) => {
        const availableProviders = providerManager.getProviders();

        if (availableProviders.length === 0) {
            stream.markdown('❌ **Keine Provider konfiguriert!**\n\nNutze die Statusleiste unten links um einen Provider einzurichten.');
            return;
        }

        if (availableProviders.length === 1) {
            // Nur ein Provider - direkt nutzen
            await handleChat(availableProviders[0], request, stream);
            return;
        }

        // Mehrere Provider - QuickPick anzeigen
        const selected = await vscode.window.showQuickPick(
            availableProviders.map(p => ({
                label: p.name,
                description: `${p.model} - ${p.baseUrl}`,
                provider: p
            })),
            { placeHolder: 'Wähle einen KI-Provider:' }
        );

        if (!selected) {
            stream.markdown('❌ Abgebrochen.');
            return;
        }

        await handleChat(selected.provider, request, stream);
    });

    context.subscriptions.push(aiParticipant);
}

async function handleChat(provider: AIProvider, request: vscode.ChatRequest, stream: vscode.ChatResponseStream): Promise<void> {
    if (!provider.enabled) {
        stream.markdown(`❌ **${provider.name}** ist deaktiviert.`);
        return;
    }

    stream.markdown(`💬 **${provider.name}** (${provider.model}) antwortet...\n\n---\n\n`);

    const messages: ChatMessage[] = [{ role: 'user', content: request.prompt }];
    const client = new ApiClient(provider);

    try {
        await client.sendMessage(messages, { stream: true }, (chunk) => {
            stream.markdown(chunk);
        });
    } catch (error: any) {
        stream.markdown(`\n\n❌ **Fehler:** ${error.message}`);
    }
}
