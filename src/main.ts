import * as vscode from 'vscode';
import { ProviderManager } from './provider';
import { ConfigStore } from './config';
import { registerCommands } from './commands';
import { registerAllChatParticipants } from './chatHandler';

export function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage('✅ AI Provider Manager geladen!');

    const configStore = new ConfigStore(context);
    const providerManager = new ProviderManager(configStore);

    providerManager.createDefaultProviders();

    // Status Bar
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = `$(hubot) AI: ${providerManager.getActiveProvider()?.name || 'Keiner'}`;
    statusBarItem.tooltip = 'KI Provider wechseln';
    statusBarItem.command = 'aiProviderManager.showQuickPick';
    statusBarItem.show();

    const settingsItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        99
    );
    settingsItem.text = '$(settings) Provider';
    settingsItem.tooltip = 'Provider Einstellungen';
    settingsItem.command = 'aiProviderManager.configure';
    settingsItem.show();

    registerCommands(context, providerManager);
    registerAllChatParticipants(context, providerManager);
}

export function deactivate() {}
