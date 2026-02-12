import type { AutomationRule } from "../../shared/contracts";

interface AutomationBoardProps {
  automations: AutomationRule[];
}

export const AutomationBoard = ({ automations }: AutomationBoardProps): JSX.Element => {
  return (
    <section className="panel automation-board">
      <header className="panel-title">Automation Cards</header>
      <div className="automation-list">
        {automations.slice(0, 6).map((rule) => (
          <article key={rule.id} className={rule.enabled ? "auto-card on" : "auto-card off"}>
            <h4>{rule.name}</h4>
            <p>
              {rule.conditions.length} condition(s), {rule.actions.length} action(s)
            </p>
            <strong>{rule.enabled ? "Enabled" : "Disabled"}</strong>
          </article>
        ))}
      </div>
    </section>
  );
};
