import { AIProvider, ProviderHeader } from './provider';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatOptions {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

export class ApiClient {
    private provider: AIProvider;

    constructor(provider: AIProvider) {
        this.provider = provider;
    }

    async sendMessage(
        messages: ChatMessage[],
        options: ChatOptions = {},
        onChunk?: (chunk: string) => void
    ): Promise<string> {
        const url = this.buildChatUrl();
        const body = this.buildRequestBody(messages, options);

        console.log('[ApiClient] URL:', url);
        console.log('[ApiClient] Body:', JSON.stringify(body, null, 2));
        console.log('[ApiClient] Headers:', this.buildHeaders());

        const response = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log('[ApiClient] Error Response:', errorText);
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        if (options.stream !== false && onChunk) {
            return this.handleStream(response, onChunk);
        }

        const data = await response.json();
        return this.parseResponse(data);
    }

    private buildChatUrl(): string {
        const baseUrl = this.provider.baseUrl.replace(/\/$/, '');
        const lowerUrl = baseUrl.toLowerCase();

        if (lowerUrl.includes('openai.com')) {
            return `${baseUrl}/chat/completions`;
        }
        if (lowerUrl.includes('anthropic.com')) {
            return `${baseUrl}/v1/messages`;
        }
        if (lowerUrl.includes('ollama') || lowerUrl.includes('lmstudio')) {
            return `${baseUrl}/api/chat`;
        }
        if (lowerUrl.includes('minimax')) {
            return `${baseUrl}/text/chatcompletion_v2`;
        }
        if (lowerUrl.includes('deepseek')) {
            return `${baseUrl}/chat/completions`;
        }
        return `${baseUrl}/chat/completions`;
    }

    private buildRequestBody(messages: ChatMessage[], options: ChatOptions): any {
        const model = this.provider.model;
        const url = this.provider.baseUrl.toLowerCase();

        // Anthropic Format
        if (model.includes('claude') || model.includes('anthropic') || url.includes('anthropic')) {
            return {
                model: model,
                messages: messages.filter(m => m.role !== 'system'),
                system: messages.find(m => m.role === 'system')?.content,
                max_tokens: options.maxTokens || 4096,
                stream: options.stream !== false,
                temperature: options.temperature || 0.7
            };
        }

        // Ollama Format
        if (model.includes('ollama') || url.includes('ollama') || url.includes('lmstudio')) {
            return {
                model: model,
                messages: messages,
                stream: options.stream !== false,
                options: {
                    temperature: options.temperature || 0.7,
                    num_predict: options.maxTokens || 4096
                }
            };
        }

        // MiniMax Format - muss model exakt so sein wie "MiniMax-M2.7"
        if (url.includes('minimax')) {
            const body: any = {
                model: model,  // Wichtig: exakter Name wie "MiniMax-M2.7"
                messages: messages.map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
                    content: m.content
                })),
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 1024
            };
            // Nur stream setzen wenn explizit gewünscht
            if (options.stream === true) {
                body.stream = true;
            }
            return body;
        }

        // Default OpenAI Format
        return {
            model: model,
            messages: messages,
            stream: options.stream !== false,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 4096
        };
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        for (const header of this.provider.headers) {
            if (header.enabled && header.key) {
                headers[header.key] = header.value;
            }
        }

        return headers;
    }

    private async handleStream(response: Response, onChunk: (chunk: string) => void): Promise<string> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullContent = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === '') continue;

                    if (line.startsWith('data:')) {
                        const data = line.slice(5).trim();
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            const content = this.extractStreamContent(parsed);
                            if (content) {
                                fullContent += content;
                                onChunk(content);
                            }
                        } catch { /* skip */ }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return fullContent;
    }

    private extractStreamContent(data: any): string | null {
        if (data.choices?.[0]?.delta?.content) {
            return data.choices[0].delta.content;
        }
        if (data.choices?.[0]?.text) {
            return data.choices[0].text;
        }
        return null;
    }

    private parseResponse(data: any): string {
        // MiniMax Format
        if (data.base_resp?.status_msg) {
            throw new Error(data.base_resp.status_msg);
        }
        if (data.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        if (data.choices?.[0]?.text) {
            return data.choices[0].text;
        }
        if (data.message?.content) {
            return data.message.content;
        }
        if (data.response) {
            return data.response;
        }
        return JSON.stringify(data, null, 2);
    }
}
