import { useEffect, useMemo, useState } from "react";
import type {
  AgentType,
  AssistantState,
  CommandFeedbackEvent,
  CreateCustomCommandInput,
  MissionMode,
  MorningBriefing,
  UpdateCustomCommandInput,
  VoiceEvent,
  VoiceStatus
} from "../shared/contracts";
import { AgentTabs } from "./components/AgentTabs";
import { AutomationBoard } from "./components/AutomationBoard";
import { CustomCommandsPanel } from "./components/CustomCommandsPanel";
import { HudBackground } from "./components/HudBackground";
import { MissionModes } from "./components/MissionModes";
import { PlannerPanel } from "./components/PlannerPanel";
import { PluginStore } from "./components/PluginStore";
import { ProcessMap } from "./components/ProcessMap";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { VoiceOrb } from "./components/VoiceOrb";
import { useMicLevel } from "./hooks/useMicLevel";
import { useVoiceCapture } from "./hooks/useVoiceCapture";

type TerminalLineKind = "command" | "reply" | "error" | "hint";

interface TerminalLine {
  id: string;
  kind: TerminalLineKind;
  text: string;
}

const stateAgeLabel = (iso: string): string => {
  const ms = Date.now() - Date.parse(iso);
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${sec}s ago`;
};

const dateStamp = (value: Date): string =>
  value
    .toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit"
    })
    .toUpperCase();

export const App = (): JSX.Element => {
  const [state, setState] = useState<AssistantState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [audioCuesEnabled, setAudioCuesEnabled] = useState(true);
  const [commandInput, setCommandInput] = useState("");
  const [voiceSimulation, setVoiceSimulation] = useState("");
  const [resultMessage, setResultMessage] = useState("Ready.");
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>("scheduler");
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const micLevel = useMicLevel();

  useVoiceCapture(Boolean(voiceStatus?.enabled));

  const mode: MissionMode = state?.mode ?? "work";
  const commandCount = useMemo(() => state?.commandHistory.length ?? 0, [state]);

  const playCue = (frequency: number, durationSec = 0.06): void => {
    if (!audioCuesEnabled) {
      return;
    }
    try {
      const context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.026, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
      oscillator.start(start);
      oscillator.stop(start + durationSec);
      oscillator.onended = () => {
        void context.close();
      };
    } catch {
      // Ignore WebAudio failures on restricted devices.
    }
  };

  const refreshState = async (): Promise<void> => {
    if (typeof window.jarvisApi?.getState !== "function") {
      throw new Error("Desktop bridge unavailable. Start Jarvis in Electron (npm run dev), not browser-only Vite.");
    }
    const next = await window.jarvisApi.getState();
    setState(next);
    setBootError(null);
  };

  const mergeCustomCommands = (commands: AssistantState["customCommands"]): void => {
    setState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        customCommands: commands
      };
    });
  };

  useEffect(() => {
    let active = true;
    const sync = async (): Promise<void> => {
      try {
        await refreshState();
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to initialize Jarvis runtime.";
        setBootError(message);
      }
    };
    void sync();
    const timer = window.setInterval(() => {
      void sync();
    }, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribeVoice: () => void = () => {};
    let unsubscribeFeedback: () => void = () => {};

    const handleVoiceEvent = (event: VoiceEvent): void => {
      if (!mounted) {
        return;
      }
      if (event.status) {
        setVoiceStatus(event.status);
      }
      if (event.type === "wake") {
        setResultMessage("Wake word detected. Listening for a command.");
      }
      if (event.type === "error" && event.message) {
        setResultMessage(event.message);
      }
    };

    const handleCommandFeedback = (event: CommandFeedbackEvent): void => {
      if (!mounted) {
        return;
      }
      setResultMessage(`[${event.source}] ${event.result.message}`);
      void refreshState();
    };

    const initRealtime = async (): Promise<void> => {
      try {
        const status = await window.jarvisApi.getVoiceStatus();
        if (mounted) {
          setVoiceStatus(status);
        }
      } catch {
        // Keep voice status null if API unavailable.
      }

      if (typeof window.jarvisApi?.onVoiceEvent === "function") {
        unsubscribeVoice = window.jarvisApi.onVoiceEvent(handleVoiceEvent);
      }

      if (typeof window.jarvisApi?.onCommandFeedback === "function") {
        unsubscribeFeedback = window.jarvisApi.onCommandFeedback(handleCommandFeedback);
      }
    };

    void initRealtime();

    return () => {
      mounted = false;
      unsubscribeVoice();
      unsubscribeFeedback();
    };
  }, []);

  const runCommand = async (raw: string, bypassConfirmation = false): Promise<void> => {
    const command = raw.trim();
    if (!command || busy) {
      return;
    }
    playCue(420, 0.045);
    setBusy(true);
    try {
      const response = await window.jarvisApi.runCommand(command, bypassConfirmation);
      setState(response.state);
      setResultMessage(response.result.message);
      if (response.result.needsConfirmation) {
        playCue(260, 0.09);
        setPendingConfirmation(command);
      } else {
        playCue(response.result.ok ? 720 : 180, response.result.ok ? 0.05 : 0.1);
        setPendingConfirmation(null);
      }
    } catch {
      playCue(160, 0.1);
      setResultMessage("Command failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshCustomCommands = async (): Promise<void> => {
    const commands = await window.jarvisApi.listCustomCommands();
    mergeCustomCommands(commands);
    setResultMessage("Custom command list refreshed.");
  };

  const handleCreateCustomCommand = async (input: CreateCustomCommandInput): Promise<void> => {
    const updated = await window.jarvisApi.createCustomCommand(input);
    setState(updated);
    setResultMessage(`Custom command "${input.name}" created.`);
    playCue(700, 0.05);
  };

  const handleUpdateCustomCommand = async (
    id: string,
    updates: UpdateCustomCommandInput
  ): Promise<void> => {
    const updated = await window.jarvisApi.updateCustomCommand(id, updates);
    setState(updated);
    setResultMessage("Custom command updated.");
    playCue(680, 0.05);
  };

  const handleDeleteCustomCommand = async (id: string): Promise<void> => {
    const approved = window.confirm("Delete this custom command?");
    if (!approved) {
      return;
    }
    const updated = await window.jarvisApi.deleteCustomCommand(id);
    setState(updated);
    setResultMessage("Custom command deleted.");
    playCue(320, 0.06);
  };

  const handleTestRunCustomCommand = async (name: string): Promise<void> => {
    const response = await window.jarvisApi.runCustomCommandByName(name, true);
    setState(response.state);
    setResultMessage(response.result.message);
    playCue(response.result.ok ? 740 : 210, 0.05);
  };

  const terminalLines = useMemo<TerminalLine[]>(() => {
    if (!state) {
      return [];
    }
    const historyLines = [...state.commandHistory.slice(0, 8)].reverse().flatMap<TerminalLine>((item) => [
      { id: `${item.id}-cmd`, kind: "command", text: `> ${item.command}` },
      {
        id: `${item.id}-res`,
        kind: item.success ? "reply" : "error",
        text: item.resultMessage
      }
    ]);
    const hints = state.suggestions.slice(0, 4).map<TerminalLine>((item) => ({
      id: item.id,
      kind: "hint",
      text: `[hint] ${item.text}`
    }));
    return [...historyLines, ...hints].slice(-18);
  }, [state]);

  if (!state) {
    return (
      <div className="booting">
        <div>
          <div>Booting Jarvis Core...</div>
          {bootError && <small>{bootError}</small>}
        </div>
      </div>
    );
  }

  const clock = now.toLocaleTimeString(undefined, {
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const networkState = state.telemetry.networkRxKb + state.telemetry.networkTxKb > 0 ? "ONLINE" : "OFFLINE";

  return (
    <div className={`jarvis-app mode-${mode}`}>
      <HudBackground mode={mode} />

      <header className="panel-frame hud-header">
        <div className="hud-headline">
          <h1>JARVIS SCIENTIFIC TERMINAL</h1>
          <p>eDEX-style command cockpit | mode {state.mode}</p>
        </div>
        <div className="hud-metrics">
          <span>{clock}</span>
          <span>{dateStamp(now)}</span>
          <span>{commandCount} commands</span>
          <span>Telemetry {stateAgeLabel(state.telemetry.timestampIso)}</span>
          <button
            className="mini-btn"
            onClick={async () => {
              const data = await window.jarvisApi.generateBriefing();
              setBriefing(data);
              setResultMessage(data.headline);
              playCue(880, 0.05);
            }}
          >
            Morning Briefing
          </button>
        </div>
      </header>

      <main className="hud-layout">
        <aside className="hud-column left-col">
          <section className="panel clock-panel">
            <header className="panel-title">
              <span>PANEL</span>
              <span>SYSTEM</span>
            </header>
            <div className="clock-time">{clock}</div>
            <div className="clock-date">{dateStamp(now)}</div>
            <div className="clock-grid">
              <div>
                <label>UPTIME</label>
                <strong>{Math.floor(state.telemetry.uptimeSec / 60)}m</strong>
              </div>
              <div>
                <label>MODE</label>
                <strong>{state.mode.toUpperCase()}</strong>
              </div>
              <div>
                <label>RX</label>
                <strong>{state.telemetry.networkRxKb} KB</strong>
              </div>
              <div>
                <label>TX</label>
                <strong>{state.telemetry.networkTxKb} KB</strong>
              </div>
            </div>
          </section>

          <div className="column-scroll">
            <TelemetryPanel telemetry={state.telemetry} />
            <MissionModes
              activeMode={state.mode}
              onModeChange={async (nextMode) => {
                const updated = await window.jarvisApi.setMode(nextMode);
                setState(updated);
                setResultMessage(`Mode changed to ${nextMode}`);
                playCue(640, 0.05);
              }}
            />
          </div>
        </aside>

        <section className="hud-column center-col">
          <section className="panel terminal-panel">
            <header className="panel-title">
              <span>MAIN</span>
              <span>COMMAND STREAM</span>
            </header>
            <div className="terminal-stream">
              {terminalLines.length > 0 ? (
                terminalLines.map((line) => (
                  <p key={line.id} className={`terminal-line ${line.kind}`}>
                    {line.text}
                  </p>
                ))
              ) : (
                <p className="empty">No command history yet. Try: open chrome or /mode focus</p>
              )}
            </div>
            <div className="result-line">[{mode}] {resultMessage}</div>
            <form
              className="command-form terminal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void runCommand(commandInput);
                setCommandInput("");
              }}
            >
              <span className="terminal-prompt">{busy ? "..." : ">"}</span>
              <input
                value={commandInput}
                onChange={(event) => setCommandInput(event.target.value)}
                placeholder="open chrome | start sprint | /mode focus | /ask summarize pending tasks"
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
                  Confirm
                </button>
              )}
            </form>
          </section>

          <div className="center-split">
            <section className="panel orb-panel">
              <header className="panel-title">
                <span>VOICE</span>
                <button
                  className="mini-btn"
                  type="button"
                  onClick={async () => {
                    const next = await window.jarvisApi.setVoiceEnabled(!voiceStatus?.enabled);
                    setVoiceStatus(next);
                    setResultMessage(`Voice listening ${next.enabled ? "enabled" : "disabled"}.`);
                  }}
                >
                  {voiceStatus?.enabled ? "Disable" : "Enable"}
                </button>
              </header>
              <VoiceOrb level={micLevel} mode={state.mode} voiceStatus={voiceStatus ?? undefined} />
              <div className="voice-status-grid">
                <small>Wake word: {voiceStatus?.wakeWord ?? "jarvis"}</small>
                <small>Backend: {voiceStatus?.backend ?? "stub"}</small>
                <small>Queue: {voiceStatus?.pendingAudioChunks ?? 0}</small>
              </div>
              <form
                className="voice-sim-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!voiceSimulation.trim()) {
                    return;
                  }
                  void window.jarvisApi.simulateVoiceTranscript(voiceSimulation.trim());
                  setVoiceSimulation("");
                }}
              >
                <input
                  value={voiceSimulation}
                  onChange={(event) => setVoiceSimulation(event.target.value)}
                  placeholder="simulate transcript (debug)"
                />
                <button type="submit" className="mini-btn">
                  Inject
                </button>
              </form>
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
                playCue(580, 0.045);
              }}
              onRunCommand={(command) => {
                void runCommand(command, true);
              }}
            />
          </div>
        </section>

        <aside className="hud-column right-col">
          <section className="panel network-panel">
            <header className="panel-title">
              <span>PANEL</span>
              <span>NETWORK</span>
            </header>
            <div className="network-grid">
              <div>
                <label>STATUS</label>
                <strong>{networkState}</strong>
              </div>
              <div>
                <label>STATE</label>
                <strong>IPv4</strong>
              </div>
              <div>
                <label>PING</label>
                <strong>-- ms</strong>
              </div>
              <div>
                <label>LINK</label>
                <strong>LOCAL</strong>
              </div>
            </div>
            <div className="network-globe">{networkState}</div>
          </section>

          <div className="column-scroll">
            <PlannerPanel
              reminders={state.reminders}
              alarms={state.alarms}
              onCompleteReminder={async (id) => {
                const updated = await window.jarvisApi.completeReminder(id);
                setState(updated);
                setResultMessage("Reminder completed.");
                playCue(760, 0.05);
              }}
            />
            <AutomationBoard
              automations={state.automations}
              onToggle={async (id, enabled) => {
                const updated = await window.jarvisApi.setAutomationEnabled(id, enabled);
                setState(updated);
                setResultMessage(`Automation ${enabled ? "enabled" : "disabled"}.`);
                playCue(enabled ? 730 : 320, 0.05);
              }}
            />
            <CustomCommandsPanel
              commands={state.customCommands}
              onCreate={handleCreateCustomCommand}
              onUpdate={handleUpdateCustomCommand}
              onDelete={handleDeleteCustomCommand}
              onTestRun={handleTestRunCustomCommand}
              onRefresh={handleRefreshCustomCommands}
            />
            <PluginStore
              plugins={state.plugins}
              onReload={async () => {
                const updated = await window.jarvisApi.reloadPlugins();
                setState(updated);
                setResultMessage("Plugins reloaded.");
                playCue(690, 0.05);
              }}
              onToggle={async (pluginId, enabled) => {
                const updated = await window.jarvisApi.setPluginEnabled(pluginId, enabled);
                setState(updated);
                setResultMessage(`Plugin ${enabled ? "enabled" : "disabled"}.`);
                playCue(enabled ? 760 : 280, 0.05);
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
                playCue(response.result.ok ? 240 : 150, response.result.ok ? 0.08 : 0.12);
              }}
            />

            {briefing && (
              <section className="panel briefing-panel">
                <header className="panel-title">Briefing</header>
                <p>{briefing.headline}</p>
                <small>{briefing.suggestedFocus}</small>
              </section>
            )}
          </div>
        </aside>
      </main>

      <footer className="panel-frame hud-footer">
        <div className="footer-kbd">
          {["ESC", "TAB", "CAPS", "SHIFT", "CTRL", "ALT", "ENTER"].map((key) => (
            <span key={key}>{key}</span>
          ))}
        </div>
        <button className="mini-btn" onClick={() => setAudioCuesEnabled((prev) => !prev)}>
          Audio {audioCuesEnabled ? "ON" : "OFF"}
        </button>
      </footer>
    </div>
  );
};
