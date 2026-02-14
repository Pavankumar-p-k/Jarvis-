import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type {
  AgentType,
  AssistantState,
  BackendRuntimeOptions,
  BackendRuntimeOptionsUpdate,
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
import { BackendOptionsPanel } from "./components/BackendOptionsPanel";
import { BootSequence } from "./components/BootSequence";
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

interface ToastNotice {
  id: string;
  text: string;
}

type TerminalTabId = "main" | "2" | "3" | "4" | "5";

type PanelColumn = "left" | "center" | "right";

type PanelId =
  | "clock"
  | "telemetry"
  | "mission"
  | "terminal"
  | "voice"
  | "agents"
  | "network"
  | "planner"
  | "automation"
  | "backend"
  | "customCommands"
  | "plugins"
  | "processes"
  | "briefing"
  | "filesystem";

type PanelOrder = Record<PanelColumn, PanelId[]>;

const PANEL_ORDER_STORAGE_KEY = "jarvis.panel-order.v1";

const PANEL_DEFAULT_COLUMN: Record<PanelId, PanelColumn> = {
  clock: "left",
  telemetry: "left",
  mission: "left",
  terminal: "center",
  voice: "center",
  agents: "center",
  network: "right",
  planner: "right",
  automation: "right",
  backend: "right",
  customCommands: "right",
  plugins: "right",
  processes: "right",
  briefing: "right",
  filesystem: "right"
};

const DEFAULT_PANEL_ORDER: PanelOrder = {
  left: ["clock", "telemetry", "mission"],
  center: ["terminal", "voice", "agents"],
  right: [
    "network",
    "filesystem",
    "planner",
    "automation",
    "backend",
    "customCommands",
    "plugins",
    "processes",
    "briefing"
  ]
};

const PANEL_LABEL: Record<PanelId, string> = {
  clock: "System",
  telemetry: "Telemetry",
  mission: "Mission",
  terminal: "Terminal",
  voice: "Voice",
  agents: "Agents",
  network: "Network",
  planner: "Planner",
  automation: "Automation",
  backend: "Backend",
  customCommands: "Commands",
  plugins: "Plugins",
  processes: "Processes",
  briefing: "Briefing",
  filesystem: "Folders"
};

const PANEL_ALIASES: Record<PanelId, string[]> = {
  clock: ["clock", "system", "system panel"],
  telemetry: ["telemetry", "system telemetry", "cpu"],
  mission: ["mission", "mode", "modes", "mission modes"],
  terminal: ["terminal", "main", "command", "console"],
  voice: ["voice", "orb", "voice orb"],
  agents: ["agent", "agents", "tabs", "agent tabs"],
  network: ["network", "network panel"],
  planner: ["planner", "timeline", "planner timeline"],
  automation: ["automation", "automation cards"],
  backend: ["backend", "backend options", "settings"],
  customCommands: ["custom commands", "commands", "command editor"],
  plugins: ["plugins", "plugin", "plugin store"],
  processes: ["process", "processes", "process map"],
  briefing: ["briefing", "morning briefing"],
  filesystem: ["files", "folders", "folder", "directory", "filesystem"]
};

const TERMINAL_TABS: Array<{ id: TerminalTabId; label: string }> = [
  { id: "main", label: "MAIN-" },
  { id: "2", label: "#2-" },
  { id: "3", label: "#3-" },
  { id: "4", label: "#4-" },
  { id: "5", label: "#5-" }
];

const PANEL_IDS = Object.keys(PANEL_DEFAULT_COLUMN) as PanelId[];

const clonePanelOrder = (value: PanelOrder): PanelOrder => ({
  left: [...value.left],
  center: [...value.center],
  right: [...value.right]
});

const normalizePanelOrder = (value: unknown): PanelOrder => {
  if (!value || typeof value !== "object") {
    return clonePanelOrder(DEFAULT_PANEL_ORDER);
  }

  const maybe = value as Partial<Record<PanelColumn, unknown>>;
  const next: PanelOrder = {
    left: [],
    center: [],
    right: []
  };
  const seen = new Set<PanelId>();

  (["left", "center", "right"] as const).forEach((column) => {
    const list = Array.isArray(maybe[column]) ? maybe[column] : [];
    for (const item of list) {
      if (typeof item !== "string") {
        continue;
      }
      const panelId = item as PanelId;
      if (!PANEL_IDS.includes(panelId) || seen.has(panelId)) {
        continue;
      }
      next[column].push(panelId);
      seen.add(panelId);
    }
  });

  PANEL_IDS.forEach((panelId) => {
    if (!seen.has(panelId)) {
      next[PANEL_DEFAULT_COLUMN[panelId]].push(panelId);
    }
  });

  return next;
};

const loadPanelOrder = (): PanelOrder => {
  if (typeof window === "undefined") {
    return clonePanelOrder(DEFAULT_PANEL_ORDER);
  }
  try {
    const raw = window.localStorage.getItem(PANEL_ORDER_STORAGE_KEY);
    if (!raw) {
      return clonePanelOrder(DEFAULT_PANEL_ORDER);
    }
    return normalizePanelOrder(JSON.parse(raw));
  } catch {
    return clonePanelOrder(DEFAULT_PANEL_ORDER);
  }
};

const normalizeMoveText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bthe\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

const resolvePanelId = (raw: string): PanelId | null => {
  const cleaned = normalizeMoveText(raw).replace(/\bpanel\b/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return null;
  }

  for (const panelId of PANEL_IDS) {
    if (PANEL_ALIASES[panelId].some((alias) => cleaned === alias || cleaned.includes(alias))) {
      return panelId;
    }
  }

  return null;
};

const resolveColumn = (raw: string): PanelColumn | null => {
  const cleaned = normalizeMoveText(raw);
  if (cleaned.includes("left")) {
    return "left";
  }
  if (cleaned.includes("right")) {
    return "right";
  }
  if (cleaned.includes("center") || cleaned.includes("centre") || cleaned.includes("middle")) {
    return "center";
  }
  return null;
};

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

const formatRate = (value: number): string => {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe >= 100) {
    return `${Math.round(safe)} KB/s`;
  }
  if (safe >= 10) {
    return `${safe.toFixed(1)} KB/s`;
  }
  return `${safe.toFixed(2)} KB/s`;
};

const normalizeKeyLabel = (key: string): string => {
  const value = key.length === 1 ? key.toUpperCase() : key.toUpperCase();
  if (value === " ") {
    return "SPACE";
  }
  if (value === "BACKSPACE") {
    return "BACK";
  }
  if (value === "CONTROL") {
    return "CTRL";
  }
  if (value === "ALTGRAPH") {
    return "ALT GR";
  }
  if (value === "ARROWUP") {
    return "UP";
  }
  if (value === "ARROWDOWN") {
    return "DOWN";
  }
  if (value === "ARROWLEFT") {
    return "LEFT";
  }
  if (value === "ARROWRIGHT") {
    return "RIGHT";
  }
  if (value === "ESCAPE") {
    return "ESC";
  }
  if (value === "CAPSLOCK") {
    return "CAPS";
  }
  return value;
};

const BOOT_STAGES = [
  "INIT DISPLAY MATRIX",
  "MOUNT LOCAL STORAGE",
  "SPAWN AGENTS",
  "LOAD COMMAND BUS",
  "SYNC VOICE PIPELINE",
  "FINALIZING INTERFACE"
];

const KEYBOARD_LAYOUT = [
  ["ESC", "`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "BACK"],
  ["TAB", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "ENTER"],
  ["CAPS", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "\\", "BLANK"],
  ["SHIFT", "<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "SHIFT", "UP"],
  ["CTRL", "FN", "SPACE", "ALT GR", "CTRL", "LEFT", "DOWN", "RIGHT"]
];

export const App = (): JSX.Element => {
  const [state, setState] = useState<AssistantState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootStage, setBootStage] = useState(BOOT_STAGES[0]);
  const [bootComplete, setBootComplete] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [audioCuesEnabled, setAudioCuesEnabled] = useState(true);
  const [commandInput, setCommandInput] = useState("");
  const [voiceSimulation, setVoiceSimulation] = useState("");
  const [resultMessage, setResultMessage] = useState("Ready.");
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentType>("scheduler");
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [backendOptions, setBackendOptions] = useState<BackendRuntimeOptions | null>(null);
  const [customCommandsHydrated, setCustomCommandsHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState<TerminalTabId>("main");
  const [localTerminalLines, setLocalTerminalLines] = useState<TerminalLine[]>([]);
  const [panelOrder, setPanelOrder] = useState<PanelOrder>(() => loadPanelOrder());
  const [draggedPanelId, setDraggedPanelId] = useState<PanelId | null>(null);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [toastNotices, setToastNotices] = useState<ToastNotice[]>([]);
  const stageToneRef = useRef<string>("");
  const keyToneCooldownRef = useRef<number>(0);
  const keyReleaseTimersRef = useRef<Record<string, number>>({});
  const seenSuggestionIdsRef = useRef<Set<string>>(new Set());
  const micLevel = useMicLevel();

  useVoiceCapture(Boolean(voiceStatus?.enabled));

  const mode: MissionMode = state?.mode ?? "work";
  const commandCount = useMemo(() => state?.commandHistory.length ?? 0, [state]);
  const panelRevealDelayMs = useMemo<Record<PanelId, number>>(() => {
    const order = [...DEFAULT_PANEL_ORDER.left, ...DEFAULT_PANEL_ORDER.center, ...DEFAULT_PANEL_ORDER.right];
    return order.reduce<Record<PanelId, number>>((acc, panelId, index) => {
      acc[panelId] = 3000 + ((index * 673) % 5000);
      return acc;
    }, {} as Record<PanelId, number>);
  }, []);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const stageIndex = Math.min(BOOT_STAGES.length - 1, Math.floor(elapsed / 450));
      setBootStage(BOOT_STAGES[stageIndex]);
      setBootProgress((current) => {
        const ceiling = state ? 100 : 96;
        if (current >= ceiling) {
          return current;
        }
        const step = state ? 3 : current < 55 ? 4 : 2;
        return Math.min(ceiling, current + step);
      });
    }, 85);

    return () => {
      clearInterval(timer);
    };
  }, [state]);

  useEffect(() => {
    if (!state || bootProgress < 100) {
      return;
    }

    const timer = window.setTimeout(() => {
      setBootComplete(true);
    }, 320);

    return () => {
      clearTimeout(timer);
    };
  }, [state, bootProgress]);

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

  useEffect(() => {
    if (bootComplete) {
      return;
    }
    if (stageToneRef.current === bootStage) {
      return;
    }
    stageToneRef.current = bootStage;
    const stageIndex = BOOT_STAGES.indexOf(bootStage);
    const tone = 360 + Math.max(0, stageIndex) * 55;
    playCue(tone, 0.045);
  }, [bootComplete, bootStage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const label = normalizeKeyLabel(event.key);
      if (!label) {
        return;
      }
      setActiveKeys((current) => (current.includes(label) ? current : [...current, label]));

      const existing = keyReleaseTimersRef.current[label];
      if (existing) {
        clearTimeout(existing);
      }
      keyReleaseTimersRef.current[label] = window.setTimeout(() => {
        setActiveKeys((current) => current.filter((item) => item !== label));
        delete keyReleaseTimersRef.current[label];
      }, 160);

      const nowMs = Date.now();
      if (nowMs - keyToneCooldownRef.current > 28 && audioCuesEnabled) {
        const base = 420 + (label.charCodeAt(0) % 7) * 18;
        playCue(base, 0.018);
        keyToneCooldownRef.current = nowMs;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      Object.values(keyReleaseTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      keyReleaseTimersRef.current = {};
    };
  }, [audioCuesEnabled]);

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
    }, 2000);
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

      try {
        const backend = await window.jarvisApi.getBackendOptions();
        if (mounted) {
          setBackendOptions(backend);
        }
      } catch {
        // Keep backend options null when API unavailable.
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

  useEffect(() => {
    if (!state || customCommandsHydrated) {
      return;
    }

    let active = true;
    const hydrate = async (): Promise<void> => {
      try {
        const commands = await window.jarvisApi.listCustomCommands();
        if (active) {
          mergeCustomCommands(commands);
          setCustomCommandsHydrated(true);
        }
      } catch {
        if (active) {
          setCustomCommandsHydrated(true);
        }
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, [customCommandsHydrated, state]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_ORDER_STORAGE_KEY, JSON.stringify(panelOrder));
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [panelOrder]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const seen = seenSuggestionIdsRef.current;
    const fresh = state.suggestions.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return item.reason === "Alarm" || item.reason === "Planner";
    });

    if (fresh.length === 0) {
      return;
    }

    const notices = fresh.slice(0, 3).map<ToastNotice>((item) => ({
      id: item.id,
      text: item.text
    }));
    setToastNotices((current) => [...current, ...notices].slice(-5));

    notices.forEach((notice, index) => {
      window.setTimeout(() => {
        setToastNotices((current) => current.filter((item) => item.id !== notice.id));
      }, 4600 + index * 200);
    });
  }, [state]);

  const appendLocalTerminalLines = (command: string, message: string, ok: boolean): void => {
    const seed = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setLocalTerminalLines((current) =>
      [
        ...current,
        { id: `local-${seed}-cmd`, kind: "command", text: `> ${command}` },
        { id: `local-${seed}-res`, kind: ok ? "reply" : "error", text: message }
      ].slice(-20)
    );
  };

  const movePanel = (panelId: PanelId, targetColumn: PanelColumn, targetIndex?: number): void => {
    setPanelOrder((current) => {
      const next = clonePanelOrder(current);
      (["left", "center", "right"] as const).forEach((column) => {
        next[column] = next[column].filter((item) => item !== panelId);
      });

      const insertionIndex =
        typeof targetIndex === "number"
          ? Math.max(0, Math.min(targetIndex, next[targetColumn].length))
          : next[targetColumn].length;
      next[targetColumn].splice(insertionIndex, 0, panelId);
      return next;
    });
  };

  const readDraggedPanel = (event: DragEvent<HTMLElement>): PanelId | null => {
    const raw = event.dataTransfer.getData("text/jarvis-panel-id") || event.dataTransfer.getData("text/plain");
    if (PANEL_IDS.includes(raw as PanelId)) {
      return raw as PanelId;
    }
    if (draggedPanelId && PANEL_IDS.includes(draggedPanelId)) {
      return draggedPanelId;
    }
    return null;
  };

  const handlePanelDrop = (event: DragEvent<HTMLElement>, column: PanelColumn, index?: number): void => {
    event.preventDefault();
    event.stopPropagation();
    const panelId = readDraggedPanel(event);
    if (!panelId) {
      return;
    }
    movePanel(panelId, column, index);
    setDraggedPanelId(null);
    setResultMessage(`Moved ${PANEL_LABEL[panelId]} panel to ${column} column.`);
    playCue(730, 0.05);
  };

  const handleMovePanelCommand = (command: string): boolean => {
    if (!/^move\s+/i.test(command)) {
      return false;
    }

    const match = command.match(/^move\s+(.+?)\s+to\s+(.+)$/i);
    if (!match) {
      const message = "Move format: move <panel> panel to <left|center|right>";
      setResultMessage(message);
      appendLocalTerminalLines(command, message, false);
      playCue(190, 0.08);
      return true;
    }

    const panelId = resolvePanelId(match[1]);
    const targetColumn = resolveColumn(match[2]);

    if (!panelId) {
      const message = `Unknown panel "${match[1]}".`;
      setResultMessage(message);
      appendLocalTerminalLines(command, message, false);
      playCue(190, 0.08);
      return true;
    }

    if (!targetColumn) {
      const message = `Unknown target "${match[2]}". Use left, center, or right.`;
      setResultMessage(message);
      appendLocalTerminalLines(command, message, false);
      playCue(190, 0.08);
      return true;
    }

    movePanel(panelId, targetColumn, 0);
    const message = `Moved ${PANEL_LABEL[panelId]} panel to ${targetColumn} column.`;
    setResultMessage(message);
    setPendingConfirmation(null);
    appendLocalTerminalLines(command, message, true);
    playCue(730, 0.05);
    return true;
  };

  const runCommand = async (raw: string, bypassConfirmation = false): Promise<void> => {
    const command = raw.trim();
    if (!command || busy) {
      return;
    }
    if (handleMovePanelCommand(command)) {
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

  const handleSaveBackendOptions = async (updates: BackendRuntimeOptionsUpdate): Promise<void> => {
    const next = await window.jarvisApi.updateBackendOptions(updates);
    setBackendOptions(next);
    const status = await window.jarvisApi.getVoiceStatus();
    setVoiceStatus(status);
    setResultMessage("Backend options updated.");
    playCue(680, 0.05);
  };

  const handleResetBackendOptions = async (): Promise<void> => {
    const next = await window.jarvisApi.resetBackendOptions();
    setBackendOptions(next);
    const status = await window.jarvisApi.getVoiceStatus();
    setVoiceStatus(status);
    setResultMessage("Backend options reset.");
    playCue(420, 0.05);
  };

  const handleCopyResult = async (): Promise<void> => {
    const text = `[${mode}] ${resultMessage}`;
    try {
      await navigator.clipboard.writeText(text);
      playCue(790, 0.04);
    } catch {
      playCue(180, 0.08);
      setResultMessage("Copy failed.");
    }
  };

  const terminalLines = useMemo<TerminalLine[]>(() => {
    if (!state) {
      return localTerminalLines;
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
    return [...historyLines, ...hints, ...localTerminalLines].slice(-24);
  }, [localTerminalLines, state]);

  if (!bootComplete) {
    return <BootSequence progress={bootProgress} stage={bootStage} ready={Boolean(state)} error={bootError} />;
  }

  if (!state) {
    return <BootSequence progress={bootProgress} stage={bootStage} ready={false} error={bootError} />;
  }

  const clock = now.toLocaleTimeString(undefined, {
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const rxRateKbPerSec = state.telemetry.networkRxKbPerSec ?? 0;
  const txRateKbPerSec = state.telemetry.networkTxKbPerSec ?? 0;
  const totalRateKbPerSec = rxRateKbPerSec + txRateKbPerSec;
  const networkState =
    totalRateKbPerSec > 0.2
      ? "ONLINE"
      : state.telemetry.networkRxKb + state.telemetry.networkTxKb > 0
        ? "IDLE"
        : "OFFLINE";
  const systemLines: TerminalLine[] = [
    { id: "sys-mode", kind: "hint", text: `[system] mode ${state.mode}` },
    { id: "sys-cpu", kind: "reply", text: `CPU ${state.telemetry.cpuPercent}%` },
    {
      id: "sys-ram",
      kind: "reply",
      text: `RAM ${state.telemetry.memoryUsedMb}/${state.telemetry.memoryTotalMb} MB`
    },
    {
      id: "sys-net",
      kind: "reply",
      text: `NET RX ${state.telemetry.networkRxKb} KB | TX ${state.telemetry.networkTxKb} KB`
    },
    { id: "sys-uptime", kind: "reply", text: `UPTIME ${Math.floor(state.telemetry.uptimeSec / 60)} min` }
  ];

  const visibleTerminalLines = (() => {
    if (activeTerminalTab === "2") {
      return terminalLines.filter((line) => line.kind === "command");
    }
    if (activeTerminalTab === "3") {
      return terminalLines.filter((line) => line.kind === "reply" || line.kind === "error");
    }
    if (activeTerminalTab === "4") {
      return terminalLines.filter((line) => line.kind === "hint");
    }
    if (activeTerminalTab === "5") {
      return systemLines;
    }
    return terminalLines;
  })();

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
        {(["left", "center", "right"] as const).map((column) => (
          <aside
            key={column}
            className={`hud-column ${column}-col`}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              handlePanelDrop(event, column);
            }}
          >
            {panelOrder[column].map((panelId, index) => {
              const panelContent = (() => {
                if (panelId === "clock") {
                  return (
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
                  );
                }
                if (panelId === "telemetry") {
                  return <TelemetryPanel telemetry={state.telemetry} />;
                }
                if (panelId === "mission") {
                  return (
                    <MissionModes
                      activeMode={state.mode}
                      onModeChange={async (nextMode) => {
                        const updated = await window.jarvisApi.setMode(nextMode);
                        setState(updated);
                        setResultMessage(`Mode changed to ${nextMode}`);
                        playCue(640, 0.05);
                      }}
                    />
                  );
                }
                if (panelId === "terminal") {
                  return (
                    <section className="panel terminal-panel">
                      <header className="edex-stream-head">
                        <div className="edex-tab-strip">
                          {TERMINAL_TABS.map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              className={activeTerminalTab === tab.id ? "active" : undefined}
                              onClick={() => setActiveTerminalTab(tab.id)}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </header>
                      <div className="terminal-stream">
                        {visibleTerminalLines.length > 0 ? (
                          visibleTerminalLines.map((line) => (
                            <p key={line.id} className={`terminal-line ${line.kind}`}>
                              {line.text}
                            </p>
                          ))
                        ) : (
                          <p className="empty">No lines in this tab yet.</p>
                        )}
                      </div>
                      <div className="result-line-wrap">
                        <div className="result-line">[{mode}] {resultMessage}</div>
                        <button type="button" className="mini-btn copy-result-btn" onClick={() => void handleCopyResult()}>
                          Copy
                        </button>
                      </div>
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
                          placeholder="open chrome | /mode focus | /cmd dir | /ps Get-Date | move network panel to right"
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
                  );
                }
                if (panelId === "voice") {
                  return (
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
                  );
                }
                if (panelId === "agents") {
                  return (
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
                  );
                }
                if (panelId === "network") {
                  return (
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
                          <label>RX RATE</label>
                          <strong>{formatRate(rxRateKbPerSec)}</strong>
                        </div>
                        <div>
                          <label>TX RATE</label>
                          <strong>{formatRate(txRateKbPerSec)}</strong>
                        </div>
                      </div>
                      <div className="network-grid network-grid-secondary">
                        <div>
                          <label>LINK</label>
                          <strong>{totalRateKbPerSec > 0.2 ? "ACTIVE" : "LOCAL"}</strong>
                        </div>
                        <div>
                          <label>TOTAL</label>
                          <strong>{formatRate(totalRateKbPerSec)}</strong>
                        </div>
                      </div>
                      <div
                        className="network-globe"
                        style={
                          {
                            ["--net-intensity" as string]: Math.min(1, totalRateKbPerSec / 280)
                          } as Record<string, string | number>
                        }
                      >
                        <div className="network-globe-shell" aria-hidden="true">
                          <span className="globe-ring ring-a" />
                          <span className="globe-ring ring-b" />
                          <span className="globe-ring ring-c" />
                          <span className="globe-meridian meridian-a" />
                          <span className="globe-meridian meridian-b" />
                          <span className="globe-scan" />
                          <span className="globe-blip blip-a" />
                          <span className="globe-blip blip-b" />
                        </div>
                        <div className="network-globe-readout">
                          <strong>{networkState}</strong>
                          <small>{formatRate(totalRateKbPerSec)}</small>
                        </div>
                      </div>
                    </section>
                  );
                }
                if (panelId === "filesystem") {
                  return (
                    <section className="panel filesystem-panel">
                      <header className="panel-title">
                        <span>FILE SYSTEM</span>
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            void runCommand("ls", true);
                          }}
                        >
                          Refresh
                        </button>
                      </header>
                      <div className="filesystem-path">{state.shell.currentDirectory}</div>
                      <div className="filesystem-actions">
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            void runCommand("cd ..", true);
                          }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            void runCommand("pwd", true);
                          }}
                        >
                          Pwd
                        </button>
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => {
                            void runCommand("dir", true);
                          }}
                        >
                          Dir
                        </button>
                      </div>
                      <div className="filesystem-list">
                        {state.shell.entries.length === 0 && <p className="empty">No entries loaded.</p>}
                        {state.shell.entries.slice(0, 30).map((entry) => (
                          <button
                            key={`${entry.kind}-${entry.name}`}
                            type="button"
                            className={`filesystem-entry ${entry.kind}`}
                            onClick={() => {
                              if (entry.kind === "directory") {
                                void runCommand(`cd "${entry.name}"`, true);
                              }
                            }}
                          >
                            <span>{entry.kind === "directory" ? "[D]" : "[F]"} {entry.name}</span>
                            <small>{entry.kind === "file" ? `${entry.sizeKb ?? 0} KB` : "folder"}</small>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                }
                if (panelId === "planner") {
                  return (
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
                  );
                }
                if (panelId === "automation") {
                  return (
                    <AutomationBoard
                      automations={state.automations}
                      onToggle={async (id, enabled) => {
                        const updated = await window.jarvisApi.setAutomationEnabled(id, enabled);
                        setState(updated);
                        setResultMessage(`Automation ${enabled ? "enabled" : "disabled"}.`);
                        playCue(enabled ? 730 : 320, 0.05);
                      }}
                    />
                  );
                }
                if (panelId === "backend") {
                  return (
                    <BackendOptionsPanel
                      options={backendOptions}
                      onSave={handleSaveBackendOptions}
                      onReset={handleResetBackendOptions}
                    />
                  );
                }
                if (panelId === "customCommands") {
                  return (
                    <CustomCommandsPanel
                      commands={state.customCommands}
                      onCreate={handleCreateCustomCommand}
                      onUpdate={handleUpdateCustomCommand}
                      onDelete={handleDeleteCustomCommand}
                      onTestRun={handleTestRunCustomCommand}
                      onRefresh={handleRefreshCustomCommands}
                    />
                  );
                }
                if (panelId === "plugins") {
                  return (
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
                  );
                }
                if (panelId === "processes") {
                  return (
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
                  );
                }
                if (panelId === "briefing" && briefing) {
                  return (
                    <section className="panel briefing-panel">
                      <header className="panel-title">Briefing</header>
                      <p>{briefing.headline}</p>
                      <small>{briefing.suggestedFocus}</small>
                    </section>
                  );
                }
                return null;
              })();

              if (!panelContent) {
                return null;
              }

              return (
                <div
                  key={panelId}
                  className={`panel-slot ${draggedPanelId === panelId ? "is-dragging" : ""}`}
                  style={{ animationDelay: `${panelRevealDelayMs[panelId] ?? 3000}ms` }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => {
                    handlePanelDrop(event, column, index);
                  }}
                >
                  <div
                    className="panel-drag-handle"
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(event) => {
                      setDraggedPanelId(panelId);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/jarvis-panel-id", panelId);
                      event.dataTransfer.setData("text/plain", panelId);
                    }}
                    onDragEnd={() => {
                      setDraggedPanelId(null);
                    }}
                    aria-label={`Move ${PANEL_LABEL[panelId]} panel`}
                    title={`Drag to move ${PANEL_LABEL[panelId]} panel`}
                  >
                    MOVE
                  </div>
                  {panelContent}
                </div>
              );
            })}
          </aside>
        ))}
      </main>

      {toastNotices.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toastNotices.map((toast) => (
            <div key={toast.id} className="toast-item">
              {toast.text}
            </div>
          ))}
        </div>
      )}

      <footer className="panel-frame hud-footer">
        <div className="footer-kbd iron-kbd-shell">
          <div className="iron-kbd-armor armor-a" />
          <div className="iron-kbd-armor armor-b" />
          <div className="iron-kbd-armor armor-c" />
          <div className="iron-kbd-reactor">
            <span className="reactor-ring ring-1" />
            <span className="reactor-ring ring-2" />
            <span className="reactor-ring ring-3" />
            <span className="reactor-spoke spoke-a" />
            <span className="reactor-spoke spoke-b" />
            <span className="reactor-spoke spoke-c" />
            <span className="reactor-spoke spoke-d" />
            <span className="reactor-core-light" />
          </div>
          <div className="iron-kbd-mark">STARK</div>
          <div className="iron-kbd-front-lip" />
          <div className="iron-kbd-vents left" />
          <div className="iron-kbd-vents right" />
          <div className="iron-kbd-keyfield">
            {KEYBOARD_LAYOUT.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="kbd-row">
                {row.map((key, keyIndex) => {
                  const label = normalizeKeyLabel(key);
                  return (
                    <span
                      key={`${rowIndex}-${keyIndex}-${key}`}
                      className={[
                        key === "SPACE" ? "wide space" : "",
                        key === "BACK" ? "wide back" : "",
                        key === "ENTER" ? "wide enter" : "",
                        key === "TAB" ? "wide tab" : "",
                        key === "CAPS" ? "wide caps" : "",
                        key === "SHIFT" ? "wide shift" : "",
                        key === "BLANK" ? "blank" : "",
                        activeKeys.includes(label) ? "active" : ""
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined}
                    >
                      {key === "BLANK" ? "" : key}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="iron-panel-lines">
            <span className="line line-a" />
            <span className="line line-b" />
            <span className="line line-c" />
            <span className="line line-d" />
          </div>
          <div className="iron-mask-emboss" />
        </div>
        <div className="hud-footer-controls">
          <button className="mini-btn" onClick={() => setAudioCuesEnabled((prev) => !prev)}>
            Audio {audioCuesEnabled ? "ON" : "OFF"}
          </button>
          <button
            className="mini-btn"
            onClick={() => {
              void runCommand("/time", true);
            }}
          >
            Speak Time
          </button>
          <button
            className="mini-btn"
            onClick={() => {
              void runCommand("/greet", true);
            }}
          >
            Greet
          </button>
        </div>
      </footer>
    </div>
  );
};
