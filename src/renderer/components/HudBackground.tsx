import type { MissionMode } from "../../shared/contracts";

interface HudBackgroundProps {
  mode: MissionMode;
}

export const HudBackground = ({ mode }: HudBackgroundProps): JSX.Element => {
  return (
    <div className={`hud-bg hud-${mode}`} aria-hidden="true">
      <div className="hud-grid" />
      <div className="hud-ring hud-ring-a" />
      <div className="hud-ring hud-ring-b" />
      <div className="hud-scanline" />
    </div>
  );
};
