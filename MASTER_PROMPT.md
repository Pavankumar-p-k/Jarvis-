# Master Prompt

```text
You are a principal software architect and lead engineer. Build a production-grade, offline-first Windows desktop AI assistant project named "Jarvis" with a cinematic sci-fi UI (not eDEX-UI). Deliver complete code, architecture, docs, and tests.

Hard requirements:
- App type: Electron + React + TypeScript desktop app.
- Must run locally/offline on a laptop.
- Local-first AI orchestration with optional local LLM integration (Ollama/llama.cpp adapter).
- Features:
  1) Holographic HUD UI with animated grid/background/scanlines.
  2) Reactive voice orb driven by microphone amplitude.
  3) Left panel live telemetry: CPU, RAM, network, processes.
  4) Right panel reminders, alarms, and timeline.
  5) Bottom command bar for natural language + slash commands.
  6) Mission modes: Work, Gaming, Focus, Night.
  7) Intent-based action engine: open apps, run commands, media controls, routines.
  8) Smart routines (multi-step workflows) with persistence.
  9) Local memory/profile (preferences, usage history, frequent apps).
  10) Context-aware suggestions (time-of-day, active workflows).
  11) Automation cards (if-this-then-that style rules).
  12) Reminder intelligence (snooze/recovery/missed reminders).
  13) Voice + text hybrid interaction.
  14) Permission levels: safe, confirm, admin for risky actions.
  15) Multi-agent tabs: Scheduler, Coder, Media, SysAdmin.
  16) Visual map of running processes and resource usage.
  17) Morning briefing screen.
  18) Command history replay.
  19) Offline plugin store (manifest install/uninstall/enable/disable hooks).
- Modular architecture:
  - /src/main (Electron main, IPC, OS integrations, schedulers)
  - /src/renderer (React UI)
  - /src/shared (types/contracts)
  - /plugins (local plugin packages)
  - /data (local persisted state)
- Security:
  - contextIsolation on, nodeIntegration off
  - preload with typed, minimal API surface
  - input validation for commands and plugin manifests
  - explicit confirmation for privileged operations
- Quality:
  - Strict TypeScript
  - ESLint + Prettier
  - Unit tests for intent parser, permission checks, scheduler logic
  - Robust error handling and logs
  - Clear README with setup/dev/build instructions
- UX:
  - Distinct typography and color system (no default look)
  - Responsive layout behavior
  - Meaningful motion and state feedback
- Output:
  - Complete project files
  - Setup scripts
  - Sample data
  - Example plugins and automations
  - Commit-ready structure

Execution rules:
- Do not use cloud APIs by default.
- If local AI engine unavailable, degrade gracefully to rules-based intents.
- Keep all user data local.
- Prioritize maintainability and extensibility.
```
