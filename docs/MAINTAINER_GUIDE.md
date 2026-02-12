# Jarvis Maintainer Guide

This file explains what Jarvis has, how to run it, and how to maintain it as your own UI project.

## 1. What This Project Has

- Custom sci-fi desktop UI (not eDEX).
- Real system telemetry panel (CPU, RAM, network, processes).
- Process control (end process by PID from UI).
- Reminders and alarms.
- Mission modes (Work, Gaming, Focus, Night).
- Automation cards (enable/disable rules).
- Plugin panel (reload + enable/disable plugin).
- Command bar with local intent parsing and action execution.
- Command history replay.
- Morning briefing panel.

## 2. How To Run

From project root:

```bash
npm install --ignore-scripts
npm run ensure:deps
npm run typecheck
npm run test
npm run build
```

For development mode:

```bash
npm run dev
```

## 3. How To Maintain Your Own UI

- UI files: `src/renderer`
- Backend runtime files: `src/main`
- Shared types: `src/shared`
- Styles/theme: `src/renderer/styles.css`

If you want new UI blocks:
- Create component in `src/renderer/components`.
- Connect it to real backend action via `window.jarvisApi` in `src/renderer/App.tsx`.
- Add IPC in `src/main/ipc/register-ipc.ts`.
- Add runtime logic in `src/main/core/jarvis-runtime.ts`.

## 4. How To Add Future Features

Example flow for any new feature:

1. Add contract in `src/shared/contracts.ts`.
2. Add backend function in `src/main/core/jarvis-runtime.ts`.
3. Add IPC handler in `src/main/ipc/register-ipc.ts`.
4. Expose in `src/main/preload.ts`.
5. Use in React UI component.
6. Run:

```bash
npm run typecheck
npm run test
npm run build
```

## 5. GitHub Update Process

```bash
git add .
git commit -m "feat: your update message"
git push origin main
```

## 6. License and Copyright

- License file: `LICENSE` (MIT)
- Copyright file: `COPYRIGHT.md`

This confirms the project in this repo is under your chosen license and your copyright notice.
