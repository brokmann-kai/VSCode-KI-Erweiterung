import * as vscode from 'vscode';
import { ProviderManager, AIProvider } from './provider';
import { ApiClient, ChatMessage } from './apiClient';

let chatPanel: vscode.WebviewPanel | undefined;
let providerManager: ProviderManager;
let conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];

export function createChatPanel(context: vscode.ExtensionContext, pm: ProviderManager): void {
    providerManager = pm;
    conversationHistory = [];

    if (chatPanel) {
        chatPanel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    chatPanel = vscode.window.createWebviewPanel(
        'aiChatPanel',
        'KI Chat',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    const active = providerManager.getActiveProvider();
    chatPanel.webview.html = getChatHtml(active);

    chatPanel.onDidDispose(() => {
        chatPanel = undefined;
    });

    chatPanel.webview.onDidReceiveMessage(async message => {
        if (message.type === 'send') {
            await handleSend(message.text, message.systemPrompt);
        } else if (message.type === 'changeProvider') {
            const provider = providerManager.getProviderById(message.id);
            if (provider) {
                providerManager.setActiveProvider(provider.id);
                chatPanel?.webview.postMessage({
                    type: 'updateProvider',
                    name: provider.name,
                    model: provider.model,
                    systemPrompt: provider.systemPrompt
                });
            }
        } else if (message.type === 'readFile') {
            await readFile(message.path);
        } else if (message.type === 'listFiles') {
            await listWorkspaceFiles();
        } else if (message.type === 'readCurrentFile') {
            await readCurrentFile();
        }
    });
}

async function readCurrentFile(): Promise<void> {
    if (!chatPanel) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        chatPanel.webview.postMessage({ type: 'error', message: 'Keine aktive Datei' });
        return;
    }
    const doc = editor.document;
    const content = doc.getText();
    chatPanel.webview.postMessage({
        type: 'fileContent',
        path: doc.uri.fsPath,
        content: content
    });
}

async function readFile(filePath: string): Promise<void> {
    if (!chatPanel) return;
    try {
        const uri = vscode.Uri.file(filePath);
        const content = await vscode.workspace.openTextDocument(uri);
        const text = content.getText();
        chatPanel.webview.postMessage({
            type: 'fileContent',
            path: filePath,
            content: text
        });
    } catch (error: any) {
        chatPanel.webview.postMessage({ type: 'error', message: 'Fehler: ' + error.message });
    }
}

async function listWorkspaceFiles(): Promise<void> {
    if (!chatPanel) return;
    try {
        const files: string[] = [];
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const pattern = new vscode.RelativePattern(folder, '**/*');
                const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);
                files.push(...uris.map(u => u.fsPath));
            }
        }
        chatPanel.webview.postMessage({ type: 'fileList', files: files });
    } catch (error: any) {
        chatPanel.webview.postMessage({ type: 'error', message: 'Fehler: ' + error.message });
    }
}

async function handleSend(text: string, systemPrompt: string): Promise<void> {
    if (!chatPanel) return;

    const provider = providerManager.getActiveProvider();
    if (!provider) {
        chatPanel.webview.postMessage({ type: 'error', message: 'Kein Provider konfiguriert!' });
        return;
    }

    chatPanel.webview.postMessage({ type: 'setLoading', loading: true });

    const client = new ApiClient(provider);
    const messages: ChatMessage[] = [];

    if (systemPrompt && systemPrompt.trim()) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        messages.push({ role: 'system', content: 'Workspace: ' + workspacePath });
    }

    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const doc = editor.document;
        const content = doc.getText();
        const truncated = content.length > 6000 ? content.substring(0, 6000) + '...[gekuerzt]' : content;
        messages.push({
            role: 'system',
            content: 'Aktuelle Datei (' + doc.uri.fsPath + '):\n' + truncated
        });
    }

    messages.push(...conversationHistory.map(h => ({ role: h.role, content: h.content })));
    messages.push({ role: 'user', content: text });

    try {
        const response = await client.sendMessage(messages, { stream: false });
        conversationHistory.push({ role: 'user', content: text });
        conversationHistory.push({ role: 'assistant', content: response });
        chatPanel.webview.postMessage({ type: 'addAiMessage', text: response });
    } catch (error: any) {
        chatPanel.webview.postMessage({ type: 'error', message: error.message });
    }
}

function getChatHtml(provider: AIProvider | null): string {
    const providers = providerManager.getProviders();
    const selectOptions = providers.map(p =>
        '<option value="' + p.id + '"' + (p.id === provider?.id ? ' selected' : '') + '>' + p.name + '</option>'
    ).join('');

    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:system-ui,sans-serif;height:100vh;display:flex;flex-direction:column;background:var(--vscode-editor-background);color:var(--vscode-foreground)}' +
        '.header{padding:8px 12px;background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-widget-border);display:flex;align-items:center;gap:8px}' +
        '.header h1{font-size:14px;font-weight:600}' +
        'select{padding:4px 8px;background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border);border-radius:4px;font-size:12px}' +
        '.btn{padding:4px 8px;background:transparent;border:1px solid var(--vscode-widget-border);color:var(--vscode-foreground);border-radius:4px;cursor:pointer;font-size:11px}' +
        '.btn:hover{background:var(--vscode-toolbar-hoverBackground)}' +
        '.toolbar{padding:6px 12px;background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-widget-border);display:flex;gap:6px;flex-wrap:wrap}' +
        '.toolbar-btn{padding:4px 10px;background:var(--vscode-badge-background);border:none;color:var(--vscode-foreground);border-radius:4px;cursor:pointer;font-size:11px}' +
        '.toolbar-btn:hover{background:var(--vscode-toolbar-hoverBackground)}' +
        '.sys-area{padding:6px 12px;background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-widget-border)}' +
        '.sys-area label{display:block;font-size:10px;opacity:0.7;margin-bottom:2px}' +
        '.sys-area input{width:100%;padding:4px 8px;background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:4px;color:var(--vscode-foreground);font-size:12px}' +
        '.chat{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}' +
        '.msg{max-width:90%;padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}' +
        '.msg.user{align-self:flex-end;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-bottom-right-radius:4px}' +
        '.msg.ai{align-self:flex-start;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-bottom-left-radius:4px}' +
        '.msg.system{align-self:center;background:rgba(100,100,100,0.2);font-size:11px;opacity:0.8;max-width:95%}' +
        '.msg.error{background:rgba(244,67,54,0.1);border:1px solid #f44336;color:#f44336}' +
        '.welcome{text-align:center;padding:30px;opacity:0.7;margin:auto}' +
        '.welcome h2{margin-bottom:8px;font-size:18px}' +
        '.input-area{padding:10px 12px;background:var(--vscode-editorWidget-background);border-top:1px solid var(--vscode-widget-border);display:flex;gap:8px}' +
        '.input-area input{flex:1;padding:8px 12px;background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:6px;color:var(--vscode-foreground);font-size:13px}' +
        '.input-area input:focus{outline:none;border-color:var(--vscode-focusBorder)}' +
        '.input-area button{padding:8px 16px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-size:14px}' +
        '.input-area button:hover{background:var(--vscode-button-hoverBackground)}' +
        '.input-area button:disabled{opacity:0.5;cursor:not-allowed}' +
        '.file-list{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:8px;padding:8px;margin:8px 0;max-height:150px;overflow-y:auto}' +
        '.file-item{padding:4px 8px;cursor:pointer;font-size:12px;font-family:monospace;border-radius:4px}' +
        '.file-item:hover{background:var(--vscode-toolbar-hoverBackground)}' +
        '</style></head><body>' +
        '<div class="header"><h1>KI Chat</h1><select id="provider-select">' + selectOptions + '</select><button class="btn" id="clear-btn">Leeren</button></div>' +
        '<div class="toolbar">' +
        '<button class="toolbar-btn" id="read-current-btn">Aktuelle Datei</button>' +
        '<button class="toolbar-btn" id="list-files-btn">Dateien auflisten</button>' +
        '<button class="toolbar-btn" id="read-clipboard-btn">Aus Zwischenablage</button>' +
        '</div>' +
        '<div class="sys-area"><label>System-Prompt</label><input type="text" id="system-prompt" placeholder="z.B. Du bist ein erfahrener Entwickler..." value="' + (provider?.systemPrompt || '') + '"></div>' +
        '<div class="chat" id="chat-area"><div class="welcome" id="welcome"><h2>Willkommen!</h2><p>Programmiere mit deinem KI-Assistenten</p></div></div>' +
        '<div class="input-area"><input type="text" id="msg-input" placeholder="Nachricht eingeben..."><button id="send-btn">Senden</button></div>' +
        '<script>' +
        'const vscode=acquireVsCodeApi();let loading=false;let aiDiv=null;' +
        'const sendBtn=document.getElementById("send-btn");' +
        'const msgInput=document.getElementById("msg-input");' +
        'const chatArea=document.getElementById("chat-area");' +
        'const clearBtn=document.getElementById("clear-btn");' +
        'const providerSelect=document.getElementById("provider-select");' +
        'const systemPromptInput=document.getElementById("system-prompt");' +
        'const readCurrentBtn=document.getElementById("read-current-btn");' +
        'const listFilesBtn=document.getElementById("list-files-btn");' +
        'const readClipboardBtn=document.getElementById("read-clipboard-btn");' +
        'sendBtn.addEventListener("click",sendMsg);' +
        'msgInput.addEventListener("keypress",e=>{if(e.key==="Enter"){e.preventDefault();sendMsg()}});' +
        'clearBtn.addEventListener("click",()=>{chatArea.innerHTML=\'<div class="welcome"><h2>Chat geleert</h2></div>\';vscode.postMessage({type:"clearHistory"})});' +
        'providerSelect.addEventListener("change",()=>{vscode.postMessage({type:"changeProvider",id:providerSelect.value})});' +
        'readCurrentBtn.addEventListener("click",()=>{vscode.postMessage({type:"readCurrentFile"})});' +
        'listFilesBtn.addEventListener("click",()=>{vscode.postMessage({type:"listFiles"})});' +
        'readClipboardBtn.addEventListener("click",async()=>{try{const t=await navigator.clipboard.readText();addMsg("system","Zwischenablage:\n"+t)}catch(e){addMsg("error","Konnte nicht lesen")}});' +
        'function addMsg(role,txt){const w=document.getElementById("welcome");if(w)w.remove();const d=document.createElement("div");d.className="msg "+role;d.textContent=txt;chatArea.appendChild(d);chatArea.scrollTop=chatArea.scrollHeight;return d}' +
        'function sendMsg(){const txt=msgInput.value.trim();if(!txt||loading)return;msgInput.value="";loading=true;sendBtn.disabled=true;addMsg("user",txt);aiDiv=addMsg("ai","Laden...");vscode.postMessage({type:"send",text:txt,systemPrompt:systemPromptInput.value})}' +
        'window.addEventListener("message",e=>{const m=e.data;' +
        'if(m.type==="addAiMessage"){if(aiDiv){aiDiv.textContent=m.text;aiDiv=null}loading=false;sendBtn.disabled=false}' +
        'else if(m.type==="error"){if(aiDiv){aiDiv.textContent="Fehler: "+m.message;aiDiv.classList.add("error");aiDiv=null}loading=false;sendBtn.disabled=false}' +
        'else if(m.type==="setLoading"){sendBtn.disabled=m.loading}' +
        'else if(m.type==="updateProvider"){systemPromptInput.value=m.systemPrompt||""}' +
        'else if(m.type==="fileList"){let h=\'<div class="file-list"><b>Dateien:</b>\';m.files.forEach(f=>{const n=f.split("/").pop();h+=\'<div class="file-item" onclick="requestF(\\\'\'+f.replace(/\\\\/g,"\\\\\\\\")+\'\\\')">\'+n+\'</div>\'});h+="</div>";const d=document.createElement("div");d.innerHTML=h;chatArea.appendChild(d)}' +
        'else if(m.type==="fileContent"){addMsg("system","Datei: "+m.path+"\n"+m.content.substring(0,3000)+(m.content.length>3000?"...":""))}' +
        '});' +
        'window.requestF=path=>{vscode.postMessage({type:"readFile",path:path})};' +
        'msgInput.focus();' +
        '</script></body></html>';
}
