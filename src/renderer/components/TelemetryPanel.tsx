import type { TelemetrySnapshot } from "../../shared/contracts";

interface TelemetryPanelProps {
  telemetry: TelemetrySnapshot;
}

const percent = (v: number): string => `${Math.max(0, Math.min(100, v))}%`;

export const TelemetryPanel = ({ telemetry }: TelemetryPanelProps): JSX.Element => {
  const memPercent = (telemetry.memoryUsedMb / Math.max(1, telemetry.memoryTotalMb)) * 100;

  return (
    <section className="panel telemetry-panel">
      <header className="panel-title">System Telemetry</header>
      <div className="metric">
        <label>CPU</label>
        <div className="bar">
          <span style={{ width: percent(telemetry.cpuPercent) }} />
        </div>
        <strong>{telemetry.cpuPercent}%</strong>
      </div>
      <div className="metric">
        <label>RAM</label>
        <div className="bar">
          <span style={{ width: percent(memPercent) }} />
        </div>
        <strong>
          {telemetry.memoryUsedMb}/{telemetry.memoryTotalMb} MB
        </strong>
      </div>
      <div className="metric-row">
        <span>Uptime</span>
        <strong>{Math.floor(telemetry.uptimeSec / 60)} min</strong>
      </div>
      <div className="metric-row">
        <span>Updated</span>
        <strong>{new Date(telemetry.timestampIso).toLocaleTimeString()}</strong>
      </div>
      <div className="metric-row">
        <span>Net RX</span>
        <strong>{telemetry.networkRxKb} KB</strong>
      </div>
      <div className="metric-row">
        <span>Net TX</span>
        <strong>{telemetry.networkTxKb} KB</strong>
      </div>
      <div className="process-list">
        {telemetry.topProcesses.slice(0, 6).map((proc) => (
          <div key={proc.pid} className="process-item">
            <span>{proc.name}</span>
            <small>{proc.memoryMb} MB</small>
          </div>
        ))}
      </div>
    </section>
  );
};
