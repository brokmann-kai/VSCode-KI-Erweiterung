import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

export class ChatHandler {
    private providerManager: ProviderManager;
    private streaming: boolean;

    constructor(providerManager: ProviderManager) {
        this.providerManager = providerManager;
        this.streaming = vscode.workspace.getConfiguration('aiProviderManager').get('streaming', true);
    }

    async handleChat(
        provider: AIProvider,
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        if (!provider.enabled) {
            stream.markdown(`❌ Provider **${provider.name}** ist deaktiviert.\n\nBitte aktiviere ihn in den Einstellungen.`);
            return;
        }

        const messages = this.buildMessages(request);
        const client = new ApiClient(provider);

        stream.markdown(`💬 **${provider.name}** (${provider.model}) antwortet...\n\n---\n\n`);

        try {
            if (this.streaming) {
                await client.sendMessage(
                    messages,
                    { stream: true },
                    (chunk) => {
                        stream.markdown(chunk);
                    }
                );
            } else {
                const response = await client.sendMessage(messages, { stream: false });
                stream.markdown(response);
            }
        } catch (error: any) {
            stream.markdown(`\n\n---\n\n❌ **Fehler:** ${error.message || 'Unbekannter Fehler'}`);
        }
    }

    private buildMessages(request: vscode.ChatRequest): ChatMessage[] {
        const messages: ChatMessage[] = [];

        for (const ref of request.references || []) {
            if (ref.value instanceof vscode.Uri) {
                messages.push({
                    role: 'system',
                    content: `[File: ${ref.value.fsPath}]`
                });
            }
        }

        messages.push({
            role: 'user',
            content: request.prompt
        });

        return messages;
    }
}

export function registerChatParticipants(
    context: vscode.ExtensionContext,
    providerManager: ProviderManager
): void {
    const chatHandler = new ChatHandler(providerManager);

    const participants = [
        { id: 'openai', name: 'openai', providerId: 'openai_default' },
        { id: 'anthropic', name: 'anthropic', providerId: 'anthropic_default' },
        { id: 'ollama', name: 'ollama', providerId: 'ollama_default' }
    ];

    for (const p of participants) {
        const provider = providerManager.getProviderById(p.providerId) ||
                        providerManager.getProviders().find(pr => pr.name.toLowerCase() === p.name);

        if (provider) {
            const participant = vscode.chat.createChatParticipant(
                `aiProviderManager.${p.id}`,
                async (request, context, stream, token) => {
                    await chatHandler.handleChat(provider, request, context, stream, token);
                }
            );
            context.subscriptions.push(participant);
        }
    }

    const customParticipant = vscode.chat.createChatParticipant(
        'aiProviderManager.custom',
        async (request, context, stream, token) => {
            const activeProvider = providerManager.getActiveProvider();
            if (!activeProvider) {
                stream.markdown('❌ Kein aktiver Provider konfiguriert.\n\nNutze **@openai**, **@anthropic** oder **@ollama** direkt, oder konfiguriere einen Provider.');
                return;
            }
            await chatHandler.handleChat(activeProvider, request, context, stream, token);
        }
    );
    context.subscriptions.push(customParticipant);
}
