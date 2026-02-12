import type { MissionMode } from "../../shared/contracts";

interface MissionModesProps {
  activeMode: MissionMode;
  onModeChange: (mode: MissionMode) => void;
}

const modes: Array<{ id: MissionMode; label: string; hint: string }> = [
  { id: "work", label: "Work", hint: "Balanced notifications + productivity" },
  { id: "gaming", label: "Gaming", hint: "Low interruption + media focus" },
  { id: "focus", label: "Focus", hint: "Deep work guidance and timers" },
  { id: "night", label: "Night", hint: "Low brightness + calm prompts" }
];

export const MissionModes = ({ activeMode, onModeChange }: MissionModesProps): JSX.Element => {
  return (
    <section className="panel mode-panel">
      <header className="panel-title">Mission Modes</header>
      <div className="mode-grid">
        {modes.map((mode) => (
          <button
            key={mode.id}
            className={mode.id === activeMode ? "mode-card active" : "mode-card"}
            onClick={() => onModeChange(mode.id)}
          >
            <h4>{mode.label}</h4>
            <p>{mode.hint}</p>
          </button>
        ))}
      </div>
    </section>
  );
};
