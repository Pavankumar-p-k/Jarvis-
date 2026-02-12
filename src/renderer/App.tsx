import { useEffect, useMemo, useState } from "react";
import type { AgentType, AssistantState, MissionMode, MorningBriefing } from "../shared/contracts";
import { AgentTabs } from "./components/AgentTabs";
import { AutomationBoard } from "./components/AutomationBoard";
import { HudBackground } from "./components/HudBackground";
import { MissionModes } from "./components/MissionModes";
import { PlannerPanel } from "./components/PlannerPanel";
import { PluginStore } from "./components/PluginStore";
import { ProcessMap } from "./components/ProcessMap";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { VoiceOrb } from "./components/VoiceOrb";
import { useMicLevel } from "./hooks/useMicLevel";

const stateAgeLabel = (iso: string): string => {
  const ms = Date.now() - Date.parse(iso);
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${sec}s ago`;
};

export const App = (): JSX.Element => {
  const [state, setState] = useState<AssistantState | null>(null);
  const [commandInput, setCommandInput] = useState("");
  const [resultMessage, setResultMessage] = useState("Ready.");
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>("scheduler");
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [busy, setBusy] = useState(false);
  const micLevel = useMicLevel();

  const mode: MissionMode = state?.mode ?? "work";

  const refreshState = async (): Promise<void> => {
    const next = await window.jarvisApi.getState();
    setState(next);
  };

  useEffect(() => {
    void refreshState();
    const timer = window.setInterval(() => {
      void refreshState();
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  const runCommand = async (raw: string, bypassConfirmation = false): Promise<void> => {
    const command = raw.trim();
    if (!command || busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await window.jarvisApi.runCommand(command, bypassConfirmation);
      setState(response.state);
      setResultMessage(response.result.message);
      if (response.result.needsConfirmation) {
        setPendingConfirmation(command);
      } else {
        setPendingConfirmation(null);
      }
    } catch {
      setResultMessage("Command failed.");
    } finally {
      setBusy(false);
    }
  };

  const commandCount = useMemo(() => state?.commandHistory.length ?? 0, [state]);

  if (!state) {
    return <div className="booting">Booting Jarvis Core...</div>;
  }

  return (
    <div className={`jarvis-app mode-${mode}`}>
      <HudBackground mode={mode} />
      <header className="topbar">
        <div>
          <h1>JARVIS CONTROL MATRIX</h1>
          <p>Offline command center | Mission mode: {state.mode}</p>
        </div>
        <div className="topbar-stats">
          <span>{commandCount} commands logged</span>
          <span>Telemetry {stateAgeLabel(state.telemetry.timestampIso)}</span>
          <button
            className="mini-btn"
            onClick={async () => {
              const data = await window.jarvisApi.generateBriefing();
              setBriefing(data);
              setResultMessage(data.headline);
            }}
          >
            Morning Briefing
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="col left">
          <TelemetryPanel telemetry={state.telemetry} />
          <MissionModes
            activeMode={state.mode}
            onModeChange={async (nextMode) => {
              const updated = await window.jarvisApi.setMode(nextMode);
              setState(updated);
              setResultMessage(`Mode changed to ${nextMode}`);
            }}
          />
          <AutomationBoard
            automations={state.automations}
            onToggle={async (id, enabled) => {
              const updated = await window.jarvisApi.setAutomationEnabled(id, enabled);
              setState(updated);
              setResultMessage(`Automation ${enabled ? "enabled" : "disabled"}.`);
            }}
          />
        </aside>

        <section className="col center">
          <section className="panel orb-panel">
            <VoiceOrb level={micLevel} mode={state.mode} />
          </section>
          <AgentTabs
            activeAgent={activeAgent}
            onChange={setActiveAgent}
            suggestions={state.suggestions}
            commandHistory={state.commandHistory}
            commonCommands={state.memory.commonCommands}
            preferredApps={state.memory.preferredApps}
            plugins={state.plugins}
            onReplay={async (id) => {
              const response = await window.jarvisApi.replayCommand(id);
              setState(response.state);
              setResultMessage(`Replayed: ${response.result.message}`);
            }}
            onRunCommand={(command) => {
              void runCommand(command, true);
            }}
          />
          <ProcessMap
            processes={state.telemetry.topProcesses}
            onTerminate={async (pid, name) => {
              const approved = window.confirm(`Terminate process ${name} (PID ${pid})?`);
              if (!approved) {
                return;
              }
              const response = await window.jarvisApi.terminateProcess(pid, true);
              setState(response.state);
              setResultMessage(response.result.message);
            }}
          />
        </section>

        <aside className="col right">
          <PlannerPanel
            reminders={state.reminders}
            alarms={state.alarms}
            onCompleteReminder={async (id) => {
              const updated = await window.jarvisApi.completeReminder(id);
              setState(updated);
              setResultMessage("Reminder completed.");
            }}
          />
          <PluginStore
            plugins={state.plugins}
            onReload={async () => {
              const updated = await window.jarvisApi.reloadPlugins();
              setState(updated);
              setResultMessage("Plugins reloaded.");
            }}
            onToggle={async (pluginId, enabled) => {
              const updated = await window.jarvisApi.setPluginEnabled(pluginId, enabled);
              setState(updated);
              setResultMessage(`Plugin ${enabled ? "enabled" : "disabled"}.`);
            }}
          />
          {briefing && (
            <section className="panel briefing-panel">
              <header className="panel-title">Briefing</header>
              <p>{briefing.headline}</p>
              <small>{briefing.suggestedFocus}</small>
            </section>
          )}
        </aside>
      </main>

      <footer className="command-footer">
        <div className="result-line">{resultMessage}</div>
        <form
          className="command-form"
          onSubmit={(event) => {
            event.preventDefault();
            void runCommand(commandInput);
            setCommandInput("");
          }}
        >
          <input
            value={commandInput}
            onChange={(event) => setCommandInput(event.target.value)}
            placeholder="Enter command. ex: open chrome | remind me in 15m | /mode focus | /ask summarize my day"
          />
          <button type="submit" disabled={busy}>
            Execute
          </button>
          {pendingConfirmation && (
            <button
              type="button"
              className="confirm-btn"
              onClick={() => {
                void runCommand(pendingConfirmation, true);
                setPendingConfirmation(null);
              }}
            >
              Confirm Action
            </button>
          )}
        </form>
      </footer>
    </div>
  );
};
