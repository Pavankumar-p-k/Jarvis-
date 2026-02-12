import type { ProcessInfo } from "../../shared/contracts";

interface ProcessMapProps {
  processes: ProcessInfo[];
}

export const ProcessMap = ({ processes }: ProcessMapProps): JSX.Element => {
  const max = Math.max(...processes.map((item) => item.memoryMb), 1);
  return (
    <section className="panel process-map">
      <header className="panel-title">Process Map</header>
      <div className="process-map-list">
        {processes.slice(0, 10).map((proc) => (
          <article key={proc.pid} className="process-map-item">
            <div>
              <h4>{proc.name}</h4>
              <small>PID {proc.pid}</small>
            </div>
            <div className="bar mini">
              <span style={{ width: `${Math.round((proc.memoryMb / max) * 100)}%` }} />
            </div>
            <strong>{proc.memoryMb} MB</strong>
          </article>
        ))}
      </div>
    </section>
  );
};
