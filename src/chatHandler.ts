import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

export function registerChatParticipants(context: vscode.ExtensionContext, providerManager: ProviderManager): void {
    const providers = providerManager.getProviders();

    // Für JEDEN Provider einen Chat-Participant erstellen
    for (const provider of providers) {
        const name = provider.name.toLowerCase().replace(/\s+/g, '');
        const id = `aiProviderManager.${name}`;

        const participant = vscode.chat.createChatParticipant(id, async (request, context, stream, token) => {
            await handleChat(provider, request, stream);
        });

        context.subscriptions.push(participant);
    }

    // Generischer @ai Participant
    const aiParticipant = vscode.chat.createChatParticipant('aiProviderManager.ai', async (request, context, stream, token) => {
        const active = providerManager.getActiveProvider();
        if (!active) {
            stream.markdown('❌ **Kein Provider konfiguriert!**\n\nNutze die Statusleiste unten links um einen Provider einzurichten.');
            return;
        }
        await handleChat(active, request, stream);
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
