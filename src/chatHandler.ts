import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

export function registerAllChatParticipants(
    context: vscode.ExtensionContext,
    providerManager: ProviderManager
): void {
    // Dynamisch für JEDEN konfigurierten Provider einen Chat-Participant erstellen
    const providers = providerManager.getProviders();

    for (const provider of providers) {
        const participantId = `aiProviderManager.${provider.name.toLowerCase().replace(/\s+/g, '')}`;

        const participant = vscode.chat.createChatParticipant(
            participantId,
            async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
                await handleChat(provider, request, stream, token);
            }
        );
        context.subscriptions.push(participant);
    }

    // Generischer @ai Participant für den aktiven Provider
    const aiParticipant = vscode.chat.createChatParticipant(
        'aiProviderManager.ai',
        async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
            const activeProvider = providerManager.getActiveProvider();
            if (!activeProvider) {
                stream.markdown('❌ **Kein Provider konfiguriert!**\n\nBitte füge einen Provider hinzu mit dem Button unten links.');
                return;
            }
            await handleChat(activeProvider, request, stream, token);
        }
    );
    context.subscriptions.push(aiParticipant);
}

async function handleChat(
    provider: AIProvider,
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    if (!provider.enabled) {
        stream.markdown(`❌ Provider **${provider.name}** ist deaktiviert.`);
        return;
    }

    stream.markdown(`💬 **${provider.name}** (${provider.model}) antwortet...\n\n---\n\n`);

    const messages: ChatMessage[] = [];
    messages.push({ role: 'user', content: request.prompt });

    const client = new ApiClient(provider);

    try {
        await client.sendMessage(
            messages,
            { stream: true },
            (chunk: string) => {
                stream.markdown(chunk);
            }
        );
    } catch (error: any) {
        stream.markdown(`\n\n---\n\n❌ **Fehler:** ${error.message}`);
    }
}
