import type { MissionMode, VoiceStatus } from "../../shared/contracts";

interface VoiceOrbProps {
  level: number;
  mode: MissionMode;
  voiceStatus?: VoiceStatus;
}

const resolveOrbState = (status?: VoiceStatus): "idle" | "listening" | "transcribing" | "failed" => {
  if (!status || !status.enabled) {
    return "idle";
  }

  if (status.lastError) {
    return "failed";
  }

  if (status.pendingAudioChunks > 0) {
    return "transcribing";
  }

  return "listening";
};

const orbLabel = (state: "idle" | "listening" | "transcribing" | "failed"): string => {
  if (state === "listening") {
    return "LISTENING";
  }
  if (state === "transcribing") {
    return "TRANSCRIBING";
  }
  if (state === "failed") {
    return "RECOGNITION ERROR";
  }
  return "VOICE OFF";
};

export const VoiceOrb = ({ level, mode, voiceStatus }: VoiceOrbProps): JSX.Element => {
  const state = resolveOrbState(voiceStatus);
  const scale = 1 + level * 0.33;
  const glow = 0.35 + level * 0.65;
  const talkBoost = state === "transcribing" ? 1 : state === "listening" ? 0.75 : 0.45;
  const eqBars = Array.from({ length: 18 }, (_item, index) => {
    const phase = index * 0.7 + level * 7 + (state === "transcribing" ? 1.6 : 0.6);
    const wave = (Math.sin(phase) + 1) / 2;
    const value = 0.2 + wave * talkBoost;
    return value;
  });

  return (
    <div
      className={`voice-orb mode-${mode} state-${state}`}
      style={
        {
          ["--orb-scale" as string]: scale,
          ["--voice-level" as string]: level,
          ["--talk-boost" as string]: talkBoost
        } as Record<string, string | number>
      }
    >
      <div className="orb-grid" />
      <div className="orb-halo" />
      <div className="orb-scanline" />
      <div className="orb-eq" aria-hidden="true">
        {eqBars.map((value, index) => (
          <span
            key={`eq-${index}`}
            className="orb-eq-bar"
            style={
              {
                ["--eq-index" as string]: index,
                ["--eq-value" as string]: value
              } as Record<string, string | number>
            }
          />
        ))}
      </div>
      <div className="orb-core" style={{ opacity: glow }} />
      <div className="orb-wave orb-wave-a" />
      <div className="orb-wave orb-wave-b" />
      <div className="orb-wave orb-wave-c" />
      <div className="orb-text">
        <span>JARVIS</span>
        <small>{orbLabel(state)}</small>
      </div>
    </div>
  );
};
