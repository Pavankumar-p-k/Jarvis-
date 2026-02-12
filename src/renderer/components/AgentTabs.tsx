import type { AgentType, CommandRecord, PluginState, SuggestionItem } from "../../shared/contracts";

interface AgentTabsProps {
  activeAgent: AgentType;
  onChange: (agent: AgentType) => void;
  suggestions: SuggestionItem[];
  commandHistory: CommandRecord[];
  commonCommands: string[];
  preferredApps: string[];
  plugins: PluginState[];
  onReplay: (id: string) => void;
  onRunCommand: (command: string) => void;
}

const tabs: Array<{ id: AgentType; label: string }> = [
  { id: "scheduler", label: "Scheduler" },
  { id: "coder", label: "Coder" },
  { id: "media", label: "Media" },
  { id: "sysadmin", label: "SysAdmin" }
];

export const AgentTabs = ({
  activeAgent,
  onChange,
  suggestions,
  commandHistory,
  commonCommands,
  preferredApps,
  plugins,
  onReplay,
  onRunCommand
}: AgentTabsProps): JSX.Element => {
  const recentAsk = commandHistory.filter((item) => item.command.startsWith("/ask")).slice(0, 4);

  return (
    <section className="panel agent-tabs">
      <header className="panel-title">Agents</header>
      <div className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeAgent === tab.id ? "tab active" : "tab"}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeAgent === "scheduler" && (
        <div className="tab-content">
          {suggestions.slice(0, 8).map((item) => (
            <article key={item.id}>
              <strong>{item.text}</strong>
              <small>{item.reason}</small>
            </article>
          ))}
        </div>
      )}

      {activeAgent === "coder" && (
        <div className="tab-content">
          {recentAsk.length > 0 ? (
            recentAsk.map((item) => (
              <article key={item.id}>
                <strong>{item.command}</strong>
                <small>{item.resultMessage}</small>
              </article>
            ))
          ) : (
            <article>
              <strong>No local LLM requests yet</strong>
              <small>Try command: /ask create today coding plan</small>
            </article>
          )}
          <article>
            <strong>Quick code memory</strong>
            <small>
              {commonCommands.slice(0, 3).join(" | ") || "No command history yet."}
            </small>
          </article>
          <article>
            <strong>Plugin commands</strong>
            <small>
              {plugins.map((plugin) => plugin.manifest.entryCommand).join(" | ") || "No plugins loaded."}
            </small>
          </article>
        </div>
      )}

      {activeAgent === "media" && (
        <div className="tab-content">
          <article>
            <strong>Voice + command hybrid</strong>
            <small>Mic orb reacts to live audio amplitude.</small>
          </article>
          <article>
            <strong>Quick media controls</strong>
            <div className="quick-actions">
              <button type="button" onClick={() => onRunCommand("play music")}>
                Play/Pause
              </button>
              <button type="button" onClick={() => onRunCommand("pause music")}>
                Pause
              </button>
              <button type="button" onClick={() => onRunCommand("open spotify")}>
                Open Spotify
              </button>
            </div>
            <small>Preferred apps: {preferredApps.slice(0, 4).join(", ") || "none"}</small>
          </article>
        </div>
      )}

      {activeAgent === "sysadmin" && (
        <div className="tab-content">
          {commandHistory.slice(0, 8).map((item) => (
            <article key={item.id}>
              <strong>{item.command}</strong>
              <small>{item.resultMessage}</small>
              <button onClick={() => onReplay(item.id)}>Replay</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
