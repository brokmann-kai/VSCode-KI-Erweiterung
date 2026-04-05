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

        const response = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        if (options.stream !== false && onChunk) {
            return this.handleStream(response, onChunk);
        }

        const data = await response.json();
        return this.parseResponse(data);
    }

    private buildChatUrl(): string {
        const url = this.provider.baseUrl.replace(/\/$/, '');
        if (url.includes('openai.com')) {
            return `${url}/chat/completions`;
        }
        if (url.includes('anthropic.com')) {
            return `${url}/v1/messages`;
        }
        if (url.includes('ollama') || url.includes('lmstudio')) {
            return `${url}/api/chat`;
        }
        return `${url}/chat/completions`;
    }

    private buildRequestBody(messages: ChatMessage[], options: ChatOptions): any {
        const provider = this.provider.model.toLowerCase();

        if (provider.includes('claude') || provider.includes('anthropic')) {
            return {
                model: this.provider.model,
                messages: messages.filter(m => m.role !== 'system'),
                system: messages.find(m => m.role === 'system')?.content,
                max_tokens: options.maxTokens || 4096,
                stream: options.stream !== false,
                temperature: options.temperature || 0.7
            };
        }

        if (provider.includes('ollama')) {
            return {
                model: this.provider.model,
                messages: messages,
                stream: options.stream !== false,
                options: {
                    temperature: options.temperature || 0.7,
                    num_predict: options.maxTokens || 4096
                }
            };
        }

        return {
            model: this.provider.model,
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

        if (!headers['Authorization'] && !headers['x-api-key']) {
            const apiKeyHeader = this.provider.headers.find(h => h.key.toLowerCase() === 'authorization' || h.key.toLowerCase() === 'x-api-key');
            if (apiKeyHeader) {
                headers[apiKeyHeader.key] = apiKeyHeader.value;
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
                    if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
                    if (!line.startsWith('data: ')) continue;

                    const data = line.slice(6);
                    try {
                        const parsed = JSON.parse(data);
                        const content = this.extractStreamContent(parsed);
                        if (content) {
                            fullContent += content;
                            onChunk(content);
                        }
                    } catch {
                        // Skip invalid JSON in stream
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
        if (data.message?.content) {
            return data.message.content;
        }
        if (data.content?.[0]?.text) {
            return data.content[0].text;
        }
        if (data.response) {
            return data.response;
        }
        return null;
    }

    private parseResponse(data: any): string {
        if (data.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        if (data.message?.content) {
            return data.message.content;
        }
        if (data.content?.[0]?.text) {
            return data.content[0].text;
        }
        if (data.response) {
            return data.response;
        }
        return JSON.stringify(data, null, 2);
    }
}
