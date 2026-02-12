import type { AlarmItem, ReminderItem } from "../../shared/contracts";

interface PlannerPanelProps {
  reminders: ReminderItem[];
  alarms: AlarmItem[];
  onCompleteReminder: (id: string) => void;
}

const dueLabel = (iso: string): string => new Date(iso).toLocaleString();

export const PlannerPanel = ({
  reminders,
  alarms,
  onCompleteReminder
}: PlannerPanelProps): JSX.Element => {
  return (
    <section className="panel planner-panel">
      <header className="panel-title">Planner Timeline</header>
      <div className="timeline">
        {reminders.slice(0, 8).map((item) => (
          <article key={item.id} className={`timeline-item status-${item.status}`}>
            <div>
              <h4>{item.title}</h4>
              <p>{dueLabel(item.dueAtIso)}</p>
            </div>
            {item.status === "pending" ? (
              <button onClick={() => onCompleteReminder(item.id)}>Done</button>
            ) : (
              <span>{item.status}</span>
            )}
          </article>
        ))}
      </div>

      <div className="alarm-list">
        <h4>Alarms</h4>
        {alarms.slice(0, 6).map((alarm) => (
          <div key={alarm.id} className="alarm-item">
            <span>{alarm.label}</span>
            <small>{dueLabel(alarm.triggerAtIso)}</small>
            <strong>{alarm.enabled ? "On" : "Done"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
};
