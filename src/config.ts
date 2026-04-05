import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProviderConfig } from './provider';

export class ConfigStore {
    private context: vscode.ExtensionContext;
    private configPath: string;
    private config: ProviderConfig | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        const userConfigPath = vscode.workspace.getConfiguration('aiProviderManager').get<string>('configPath');
        
        const homedir = process.env.HOME || process.env.USERPROFILE || '';
        this.configPath = userConfigPath?.replace(/^~/, homedir) || 
            path.join(homedir, '.ai-provider-manager', 'config.json');
    }

    loadConfig(): ProviderConfig {
        if (this.config) {
            return this.config;
        }

        try {
            if (fs.existsSync(this.configPath)) {
                const content = fs.readFileSync(this.configPath, 'utf-8');
                this.config = JSON.parse(content);
                return this.config!;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Fehler beim Laden der Konfiguration: ${error}`);
        }

        this.config = {
            providers: [],
            activeProviderId: null
        };
        return this.config;
    }

    saveConfig(config: ProviderConfig): void {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
            this.config = config;
        } catch (error) {
            vscode.window.showErrorMessage(`Fehler beim Speichern der Konfiguration: ${error}`);
        }
    }

    getConfigPath(): string {
        return this.configPath;
    }
}
