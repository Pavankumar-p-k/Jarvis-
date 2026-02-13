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
  const scale = 1 + level * 0.28;
  const glow = 0.35 + level * 0.65;

  return (
    <div className={`voice-orb mode-${mode} state-${state}`} style={{ ["--orb-scale" as string]: scale }}>
      <div className="orb-core" style={{ opacity: glow }} />
      <div className="orb-wave orb-wave-a" />
      <div className="orb-wave orb-wave-b" />
      <div className="orb-text">
        <span>JARVIS</span>
        <small>{orbLabel(state)}</small>
      </div>
    </div>
  );
};
