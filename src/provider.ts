export interface ProviderHeader {
    key: string;
    value: string;
    enabled: boolean;
}

export interface AIProvider {
    id: string;
    name: string;
    model: string;
    baseUrl: string;
    headers: ProviderHeader[];
    enabled: boolean;
}

export interface ProviderConfig {
    providers: AIProvider[];
    activeProviderId: string | null;
}

export class ProviderManager {
    private config: ProviderConfig;
    private configStore: any;

    constructor(configStore: any) {
        this.configStore = configStore;
        this.config = this.configStore.loadConfig();
    }

    getConfigPath(): string {
        return this.configStore.getConfigPath();
    }

    getProviders(): AIProvider[] {
        return this.config.providers;
    }

    getActiveProvider(): AIProvider | null {
        if (!this.config.activeProviderId) return null;
        return this.config.providers.find(p => p.id === this.config.activeProviderId) || null;
    }

    getProviderById(id: string): AIProvider | undefined {
        return this.config.providers.find(p => p.id === id);
    }

    addProvider(provider: Omit<AIProvider, 'id'>): AIProvider {
        const newProvider: AIProvider = {
            ...provider,
            id: `provider_${Date.now()}`
        };
        this.config.providers.push(newProvider);
        this.configStore.saveConfig(this.config);
        return newProvider;
    }

    updateProvider(id: string, updates: Partial<AIProvider>): AIProvider | null {
        const index = this.config.providers.findIndex(p => p.id === id);
        if (index === -1) return null;

        this.config.providers[index] = { ...this.config.providers[index], ...updates };
        this.configStore.saveConfig(this.config);
        return this.config.providers[index];
    }

    deleteProvider(id: string): boolean {
        const index = this.config.providers.findIndex(p => p.id === id);
        if (index === -1) return false;

        this.config.providers.splice(index, 1);
        if (this.config.activeProviderId === id) {
            this.config.activeProviderId = this.config.providers[0]?.id || null;
        }
        this.configStore.saveConfig(this.config);
        return true;
    }

    setActiveProvider(id: string): boolean {
        const provider = this.getProviderById(id);
        if (!provider) return false;

        this.config.activeProviderId = id;
        this.configStore.saveConfig(this.config);
        return true;
    }

    createDefaultProviders(): void {
        if (this.config.providers.length === 0) {
            this.config.providers = [
                {
                    id: 'openai_default',
                    name: 'OpenAI',
                    model: 'gpt-4',
                    baseUrl: 'https://api.openai.com/v1',
                    headers: [
                        { key: 'Authorization', value: 'Bearer YOUR_API_KEY', enabled: true }
                    ],
                    enabled: true
                },
                {
                    id: 'anthropic_default',
                    name: 'Anthropic',
                    model: 'claude-3-sonnet',
                    baseUrl: 'https://api.anthropic.com',
                    headers: [
                        { key: 'x-api-key', value: 'YOUR_API_KEY', enabled: true },
                        { key: 'anthropic-version', value: '2023-06-01', enabled: true }
                    ],
                    enabled: true
                },
                {
                    id: 'ollama_default',
                    name: 'Ollama',
                    model: 'llama3',
                    baseUrl: 'http://localhost:11434',
                    headers: [],
                    enabled: true
                }
            ];
            this.config.activeProviderId = 'openai_default';
            this.configStore.saveConfig(this.config);
        }
    }
}
