import type { AgentType, CommandRecord, SuggestionItem } from "../../shared/contracts";

interface AgentTabsProps {
  activeAgent: AgentType;
  onChange: (agent: AgentType) => void;
  suggestions: SuggestionItem[];
  commandHistory: CommandRecord[];
  onReplay: (id: string) => void;
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
  onReplay
}: AgentTabsProps): JSX.Element => {
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
          <article>
            <strong>Offline code mode</strong>
            <small>Use /ask for local model responses when available.</small>
          </article>
          <article>
            <strong>Plugin commands</strong>
            <small>Use plugin entry commands to extend assistant behaviors.</small>
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
            <strong>Media controls</strong>
            <small>Try: play music, pause music.</small>
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
