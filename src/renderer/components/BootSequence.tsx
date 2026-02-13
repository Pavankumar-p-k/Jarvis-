interface BootSequenceProps {
  progress: number;
  stage: string;
  ready: boolean;
  error: string | null;
}

const BOOT_LINES = [
  "Kernel handshake .......... OK",
  "Local storage mount ....... OK",
  "Plugin bus sandbox ........ OK",
  "Voice pipeline warmup ..... OK",
  "Scheduler agent sync ...... OK",
  "Telemetry channels ........ OK"
];

/**
 * Startup loader inspired by retro sci-fi terminals.
 */
export const BootSequence = ({ progress, stage, ready, error }: BootSequenceProps): JSX.Element => {
  return (
    <div className="boot-sequence" role="status" aria-live="polite">
      <div className="boot-grid" />
      <div className="boot-shell">
        <div className="boot-topline">
          <span>JARVIS // BOOTSTRAP</span>
          <span>{ready ? "READY" : "INITIALIZING"}</span>
        </div>

        <div className="boot-core">
          <div className="boot-readout">
            {BOOT_LINES.map((line, index) => {
              const active = progress >= Math.round(((index + 1) / BOOT_LINES.length) * 100);
              return (
                <p key={line} className={active ? "on" : "off"}>
                  {line}
                </p>
              );
            })}
          </div>

          <div className="boot-meters">
            <div className="boot-stage">{stage}</div>
            <div className="boot-progress">
              <span style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
            </div>
            <div className="boot-percent">{Math.round(progress)}%</div>
          </div>
        </div>

        {error && <div className="boot-error">{error}</div>}
      </div>
      <div className="boot-scan" />
    </div>
  );
};
