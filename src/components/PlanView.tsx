import { motion, type MotionValue, useTransform } from "motion/react";
import { Crosshair, SunHorizon, X } from "@phosphor-icons/react";
import type { Shot } from "../types";

type PlanViewProps = {
  yaw: MotionValue<number>;
  fov: number;
  shots: Shot[];
  onClose: () => void;
  onAim: (yaw: number) => void;
};

export function PlanView({ yaw, fov, shots, onClose, onAim }: PlanViewProps) {
  const coneRotation = useTransform(yaw, (value) => value);
  const wedge = `${Math.max(16, Math.min(170, fov))}deg`;

  return (
    <motion.section
      className="plan-panel glass-panel"
      initial={{ opacity: 0, scale: 0.96, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 18 }}
      transition={{ type: "spring", stiffness: 230, damping: 28 }}
      aria-label="Top-down room plan"
    >
      <header className="panel-heading">
        <div>
          <span className="section-kicker">Live plan</span>
          <h2>The Color Suite</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close plan view">
          <X size={16} weight="bold" />
        </button>
      </header>

      <div className="plan-stage">
        <div className="distance-ring ring-one" />
        <div className="distance-ring ring-two" />
        <div className="room-shell">
          <button className="plan-target target-screen" type="button" onClick={() => onAim(0)}>
            Projection wall
          </button>
          <button className="plan-target target-client" type="button" onClick={() => onAim(-76)}>
            Client bay
          </button>
          <button className="plan-target target-seam" type="button" onClick={() => onAim(180)}>
            Seam column
          </button>
        </div>
        <motion.div className="plan-cone-wrap" style={{ rotate: coneRotation }}>
          <div className="plan-cone" style={{ "--cone": wedge } as React.CSSProperties} />
        </motion.div>
        <div className="standpoint">
          <Crosshair size={18} weight="fill" />
        </div>
        <div className="sun-bearing" aria-label="Key light at 42 degrees">
          <SunHorizon size={16} weight="fill" />
        </div>
        {shots.map((shot) => (
          <button
            key={shot.id}
            className="shot-bearing"
            style={{ transform: `rotate(${shot.yaw}deg) translateY(-104px) rotate(${-shot.yaw}deg)` }}
            onClick={() => onAim(shot.yaw)}
            type="button"
            aria-label={`Aim at ${shot.name}`}
          />
        ))}
      </div>

      <footer className="plan-footer">
        <div><span>Standpoint</span><strong>2.8, 4.1 m</strong></div>
        <div><span>Camera</span><strong>1.60 m</strong></div>
        <div><span>View cone</span><strong>{fov.toFixed(1)}°</strong></div>
      </footer>
    </motion.section>
  );
}
