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

        const headers = this.buildHeaders();

        // MiniMax braucht keinen Content-Type bei Streaming
        const requestHeaders: Record<string, string> = { ...headers };
        if (!this.provider.baseUrl.includes('minimaxi')) {
            requestHeaders['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        if (options.stream !== false && onChunk) {
            return this.handleStream(response, onChunk);
        }

        const data = await response.json();
        return this.parseResponse(data);
    }

    private buildChatUrl(): string {
        const url = this.provider.baseUrl.replace(/\/$/, '');
        const lowerUrl = url.toLowerCase();

        if (lowerUrl.includes('openai.com')) {
            return `${url}/chat/completions`;
        }
        if (lowerUrl.includes('anthropic.com')) {
            return `${url}/v1/messages`;
        }
        if (lowerUrl.includes('ollama') || lowerUrl.includes('lmstudio')) {
            return `${url}/api/chat`;
        }
        if (lowerUrl.includes('minimaxi') || lowerUrl.includes('minimax')) {
            return `${url}/v1/text/chatcompletion_v2`;
        }
        if (lowerUrl.includes('deepseek')) {
            return `${url}/chat/completions`;
        }
        return `${url}/chat/completions`;
    }

    private buildRequestBody(messages: ChatMessage[], options: ChatOptions): any {
        const model = this.provider.model.toLowerCase();
        const url = this.provider.baseUrl.toLowerCase();

        // Anthropic Format
        if (model.includes('claude') || model.includes('anthropic') || url.includes('anthropic')) {
            return {
                model: this.provider.model,
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
                model: this.provider.model,
                messages: messages,
                stream: options.stream !== false,
                options: {
                    temperature: options.temperature || 0.7,
                    num_predict: options.maxTokens || 4096
                }
            };
        }

        // MiniMax Format
        if (url.includes('minimaxi') || url.includes('minimax')) {
            return {
                model: this.provider.model,
                messages: messages.map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
                    content: m.content
                })),
                stream: options.stream !== false,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 4096
            };
        }

        // Default OpenAI Format
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

        return headers;
    }

    private async handleStream(response: Response, onChunk: (chunk: string) => void): Promise<string> {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        const url = this.provider.baseUrl.toLowerCase();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() === '') continue;

                    // MiniMax SSE format
                    if (url.includes('minimaxi') || url.includes('minimax')) {
                        if (line.startsWith('data:')) {
                            const data = line.slice(5).trim();
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content ||
                                               parsed.choices?.[0]?.text ||
                                               parsed.content;
                                if (content) {
                                    fullContent += content;
                                    onChunk(content);
                                }
                            } catch { /* skip */ }
                        }
                        continue;
                    }

                    // Standard SSE format
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = this.extractStreamContent(parsed);
                        if (content) {
                            fullContent += content;
                            onChunk(content);
                        }
                    } catch { /* skip invalid JSON */ }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return fullContent;
    }

    private extractStreamContent(data: any): string | null {
        // OpenAI format
        if (data.choices?.[0]?.delta?.content) {
            return data.choices[0].delta.content;
        }
        // OpenAI non-streaming
        if (data.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        // Anthropic format
        if (data.content?.[0]?.text) {
            return data.content[0].text;
        }
        // Generic response
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
