# AI Provider Manager

Eine Extension für VS Code, mit der du verschiedene KI-Provider verwalten und direkt im Chat mit ihnen kommunizieren kannst.

## Features

- **Mehrere Provider verwalten**: OpenAI, Anthropic, Ollama, Custom
- **Pro Provider konfigurierbar**:
  - Modell-Auswahl
  - API-URL (Basis-URL)
  - Custom Headers (z.B. Authorization, API-Version)
- **Integrierter Chat**: Direkt in VS Code mit `@openai`, `@anthropic`, `@ollama` oder `@ai` chatten
- **Streaming Responses**: Echtzeit-Ausgabe der KI-Antworten
- **JSON-Konfiguration** für einfache Bearbeitung

## Installation

```bash
npm install
npm run compile
```

## Verwendung

### Chatten mit KI-Providern

1. **Chat Panel öffnen**: `Ctrl+Shift+P` → "Chat: Open Chat"
2. **Provider auswählen**:
   - `@openai` - OpenAI (GPT-4, GPT-4o)
   - `@anthropic` - Anthropic (Claude 3.5)
   - `@ollama` - Lokales Ollama Modell
   - `@ai` - Aktuell aktiver Provider

### Provider konfigurieren

**Command Palette** (`Ctrl+Shift+P`):
- `AI Provider: Konfigurieren` - Öffnet die Einstellungs-UI
- `AI Provider: Aktiv setzen` - Wählt den aktiven Provider

### Beispiel-Chats

```
@openai Erkläre mir this in JavaScript

@anthropic Schreibe eine Python Funktion für Fibonacci

@ollama Übersetze diesen Code nach TypeScript
```

## Konfigurationsdatei

Die Konfiguration wird in `~/.ai-provider-manager/config.json` gespeichert:

```json
{
  "providers": [
    {
      "id": "openai_default",
      "name": "OpenAI",
      "model": "gpt-4",
      "baseUrl": "https://api.openai.com/v1",
      "headers": [
        { "key": "Authorization", "value": "Bearer YOUR_API_KEY", "enabled": true }
      ],
      "enabled": true
    }
  ],
  "activeProviderId": "openai_default"
}
```

## Requirements

- VS Code 1.90+ (Chat API erforderlich)
- Node.js 18+
- KI-Provider API-Key (für Cloud-Provider)

## Lizenz

MIT
