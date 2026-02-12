# Jarvis Easy Guide (Student Friendly)

This guide is written in very simple English.

## 1. What is Jarvis?

Jarvis is your personal AI control app for your laptop.

It can:
- Open apps
- Set reminders
- Set alarms
- Show system details (CPU, RAM, processes)
- Save your command history
- Run routines (many commands in one click)

It works mostly **offline** on your computer.

## 2. How Jarvis Works (Very Simple)

Think Jarvis like this:

1. You type a command  
Example: `open chrome`
2. Jarvis reads your command
3. Jarvis understands the meaning (intent)
4. Jarvis performs the action
5. Jarvis shows result in UI

## 3. Main Features

- Sci-fi UI with animated dashboard
- Voice orb that reacts to microphone sound
- Mission modes:
  - Work
  - Gaming
  - Focus
  - Night
- Reminder + alarm timeline
- Automation cards (if this happens, do that)
- Plugin support (local plugins)
- Morning briefing
- Command replay

## 4. Installation (Windows)

Requirements:
- Node.js installed
- npm installed

Steps:

1. Open terminal in project folder
2. Install dependencies:

```bash
npm install --ignore-scripts
```

Why `--ignore-scripts`?  
In some networks Electron binary download may fail. This keeps install stable.

## 5. Run the Project

### A) Check project health

```bash
npm run typecheck
npm run test
npm run build
```

### B) Start app in dev mode

```bash
npm run dev
```

## 6. Example Commands You Can Try

- `open chrome`
- `open spotify`
- `remind me drink water in 20m`
- `set alarm 07:30`
- `list reminders`
- `system info`
- `/mode focus`
- `/ask give me a short plan for today`

## 7. Project Folders (Easy)

- `src/main` -> backend brain (actions, reminders, IPC)
- `src/renderer` -> frontend UI
- `src/shared` -> common types and contracts
- `plugins` -> local plugin files
- `data` -> saved local data
- `docs` -> documentation

## 8. Safety

- Renderer cannot directly access full Node API
- Sensitive actions can require confirmation
- Input is validated

## 9. If Something Fails

Try this:

```bash
npm run ensure:deps
npm run typecheck
npm run test
npm run build
```

If network blocks Electron download, keep using:

```bash
npm install --ignore-scripts
```

This is enough for code checks and build.
