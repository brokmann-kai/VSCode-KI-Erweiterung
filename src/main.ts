import * as vscode from 'vscode';
import { ProviderManager } from './provider';
import { ConfigStore } from './config';
import { registerCommands } from './commands';
import { registerChatParticipants } from './chatHandler';

export function activate(context: vscode.ExtensionContext) {
    const configStore = new ConfigStore(context);
    const providerManager = new ProviderManager(configStore);

    providerManager.createDefaultProviders();
    registerCommands(context, providerManager);
    registerChatParticipants(context, providerManager);

    vscode.window.showInformationMessage('AI Provider Manager aktiviert! 💬');
}

export function deactivate() {}
