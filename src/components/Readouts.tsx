import { useCallback, useEffect, useRef } from "react";
import { type MotionValue, useMotionValueEvent } from "motion/react";
import { getBudget, formatBearing } from "../lib/camera";
import type { LensProjection } from "../types";

export function BearingReadout({ value }: { value: MotionValue<number> }) {
  const ref = useRef<HTMLSpanElement>(null);

  useMotionValueEvent(value, "change", (latest) => {
    if (ref.current) ref.current.textContent = formatBearing(latest);
  });

  return <span ref={ref}>{formatBearing(value.get())}</span>;
}

export function PitchReadout({ value }: { value: MotionValue<number> }) {
  const ref = useRef<HTMLSpanElement>(null);

  useMotionValueEvent(value, "change", (latest) => {
    if (ref.current) ref.current.textContent = `${latest >= 0 ? "+" : ""}${latest.toFixed(1)}°`;
  });

  return <span ref={ref}>{value.get().toFixed(1)}°</span>;
}

export function BudgetReadout({
  focal,
  pitch,
  horizontalPxPerDegree,
  verticalPxPerDegree,
  projection,
}: {
  focal: number;
  pitch: MotionValue<number>;
  horizontalPxPerDegree: number;
  verticalPxPerDegree: number;
  projection: LensProjection;
}) {
  const sourceRef = useRef<HTMLSpanElement>(null);
  const upscaleRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const polarRef = useRef<HTMLParagraphElement>(null);

  const render = useCallback((pitchValue: number) => {
    const budget = getBudget(focal, pitchValue, horizontalPxPerDegree, verticalPxPerDegree, 1920, 1080, projection);
    if (sourceRef.current) {
      sourceRef.current.textContent = `${Math.round(budget.sourceW)} × ${Math.round(budget.sourceH)} px`;
    }
    if (upscaleRef.current) upscaleRef.current.textContent = `${budget.upscale.toFixed(2)}×`;
    if (badgeRef.current) {
      badgeRef.current.textContent = budget.badge;
      badgeRef.current.dataset.badge = budget.badge.toLowerCase();
    }
    if (meterRef.current) meterRef.current.style.setProperty("--budget", `${budget.level}%`);
    if (polarRef.current) {
      polarRef.current.hidden = Math.abs(pitchValue) + budget.vFov / 2 <= 60;
      polarRef.current.textContent = `Steep angle. Estimated effective detail is ${budget.effectivePxPerDegree.toFixed(1)} px/°.`;
    }
  }, [focal, horizontalPxPerDegree, projection, verticalPxPerDegree]);

  useEffect(() => render(pitch.get()), [pitch, render]);
  useMotionValueEvent(pitch, "change", render);

  const initial = getBudget(focal, pitch.get(), horizontalPxPerDegree, verticalPxPerDegree, 1920, 1080, projection);

  return (
    <div className="budget-block">
      <div className="budget-title">
        <span>Resolution budget</span>
        <span ref={badgeRef} className="budget-badge" data-badge={initial.badge.toLowerCase()}>
          {initial.badge}
        </span>
      </div>
      <div ref={meterRef} className="budget-meter" style={{ "--budget": `${initial.level}%` } as React.CSSProperties}>
        <i />
      </div>
      <dl className="budget-data">
        <div><dt>Source</dt><dd ref={sourceRef}>{Math.round(initial.sourceW)} × {Math.round(initial.sourceH)} px</dd></div>
        <div><dt>Export</dt><dd>1920 × 1080 px</dd></div>
        <div><dt>Upscale</dt><dd ref={upscaleRef}>{initial.upscale.toFixed(2)}×</dd></div>
      </dl>
      <p ref={polarRef} className="polar-warning" hidden>Steep angle.</p>
    </div>
  );
}
