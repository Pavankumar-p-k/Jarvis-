import type { TelemetrySnapshot } from "../../shared/contracts";

interface TelemetryPanelProps {
  telemetry: TelemetrySnapshot;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const percent = (v: number): string => `${clampPercent(v)}%`;

export const TelemetryPanel = ({ telemetry }: TelemetryPanelProps): JSX.Element => {
  const cpuPercent = clampPercent(telemetry.cpuPercent);
  const memPercent = (telemetry.memoryUsedMb / Math.max(1, telemetry.memoryTotalMb)) * 100;
  const ringBars = Array.from({ length: 42 }, (_item, index) => {
    const angle = (360 / 42) * index;
    const waveBase = (Math.sin(index * 0.58 + cpuPercent * 0.08) + 1) / 2;
    const activity = 0.28 + (cpuPercent / 100) * 0.72;
    const scale = 0.25 + waveBase * activity;
    return { angle, scale };
  });
  const tracePoints = Array.from({ length: 32 }, (_item, index) => {
    const x = (index / 31) * 100;
    const phase = index * 0.55 + cpuPercent * 0.1;
    const amplitude = 2 + (cpuPercent / 100) * 7;
    const y = 12 + Math.sin(phase) * amplitude;
    return `${x},${y.toFixed(2)}`;
  }).join(" ");

  return (
    <section className="panel telemetry-panel">
      <header className="panel-title">System Telemetry</header>
      <div className="metric cpu-wave-metric">
        <label>CPU</label>
        <div className="cpu-wave-meter" style={{ ["--cpu-progress" as string]: `${cpuPercent}%` }}>
          <div className="cpu-wave-ring" aria-hidden="true">
            {ringBars.map((bar, index) => (
              <span
                key={`bar-${index}`}
                className="cpu-wave-bar"
                style={
                  {
                    ["--bar-angle" as string]: `${bar.angle}deg`,
                    ["--bar-scale" as string]: bar.scale
                  } as Record<string, string | number>
                }
              />
            ))}
          </div>
          <div className="cpu-wave-core">
            <strong>{cpuPercent}%</strong>
            <small>load</small>
          </div>
        </div>
        <svg className="cpu-wave-trace" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={tracePoints} />
        </svg>
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
