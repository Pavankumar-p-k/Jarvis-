# Jarvis

Offline-first industrial desktop AI assistant for Windows, built with Electron + React + TypeScript.

## Highlights

- Cinematic sci-fi HUD UI (animated grid, scanline, reactive voice orb)
- Local command center with intent parsing and permission gates
- Mission modes: Work, Gaming, Focus, Night
- Reminder and alarm timeline with completion tracking
- Automation cards (`if condition -> actions`)
- Multi-agent tabs (Scheduler, Coder, Media, SysAdmin)
- Process telemetry and process map visualization
- Command history + replay
- Morning briefing generator
- Local plugin store (manifest-driven, offline)
- Optional local LLM adapter (Ollama endpoint)

## Tech Stack

- Electron (secure preload bridge + IPC)
- React + TypeScript + Vite
- Zod input validation
- Vitest for unit tests
- ESLint + Prettier

## Project Structure

```text
src/
  main/               # Electron main process + runtime engine
  renderer/           # React HUD UI
  shared/             # Shared typed contracts/schemas
plugins/              # Local plugin manifests
data/                 # Local persisted assistant data
```

## Security Model

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer gets only a typed, minimal API surface via preload
- Command and plugin input validation through Zod
- Confirmation flow for privileged operations

## Quick Start

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Tests and lint:

```bash
npm run test
npm run lint
```

## Example Commands

- `open chrome`
- `open steam`
- `remind me drink water in 20m`
- `set alarm 07:30`
- `run routine good morning`
- `list reminders`
- `system info`
- `/mode focus`
- `/ask summarize my tasks`

## Plugin Format

Each plugin folder includes `manifest.json`:

```json
{
  "id": "plugin-id",
  "name": "Plugin Name",
  "version": "1.0.0",
  "description": "What this plugin does",
  "entryCommand": "/plugin",
  "permissionLevel": "safe"
}
```

## Notes

- Data is persisted locally in Electron user data (`data/state.json`).
- If local LLM is unavailable, Jarvis gracefully falls back to rules-based intent handling.
- Beginner-friendly documentation: `docs/EASY_GUIDE.md`.
