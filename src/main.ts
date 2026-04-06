import * as vscode from 'vscode';
import { ProviderManager } from './provider';
import { ConfigStore } from './config';
import { registerCommands } from './commands';
import { registerChatParticipants } from './chatHandler';
import { registerTreeView } from './treeView';

export function activate(context: vscode.ExtensionContext) {
    const configStore = new ConfigStore(context);
    const providerManager = new ProviderManager(configStore);

    providerManager.createDefaultProviders();

    // Status Bar Button - IMMER sichtbar unten links
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.text = `$(hubot) AI: ${providerManager.getActiveProvider()?.name || 'Keiner'}`;
    statusBarItem.tooltip = 'KI Provider Manager - Klicken für Optionen';
    statusBarItem.command = 'aiProviderManager.showQuickPick';
    statusBarItem.show();

    // Zweiter Button für Einstellungen
    const settingsItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        99
    );
    settingsItem.text = '$(settings) Provider';
    settingsItem.tooltip = 'Provider Einstellungen öffnen';
    settingsItem.command = 'aiProviderManager.configure';
    settingsItem.show();

    registerTreeView(context, providerManager);
    registerCommands(context, providerManager);
    registerChatParticipants(context, providerManager);

    vscode.window.showInformationMessage('AI Provider Manager aktiviert! 💬 Klicke unten links auf "AI: Provider".');
}

export function deactivate() {}
