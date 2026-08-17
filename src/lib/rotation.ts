/** Column-major rotation matrix matching Three.js Euler order YXZ. */
export function cameraRotationMatrix(pitchDegrees: number, yawDegrees: number, rollDegrees: number) {
  const x = pitchDegrees * Math.PI / 180;
  const y = -yawDegrees * Math.PI / 180;
  const z = rollDegrees * Math.PI / 180;
  const a = Math.cos(x); const b = Math.sin(x);
  const c = Math.cos(y); const d = Math.sin(y);
  const e = Math.cos(z); const f = Math.sin(z);
  const ce = c * e; const cf = c * f;
  const de = d * e; const df = d * f;
  return new Float32Array([
    ce + df * b,
    a * f,
    cf * b - de,
    de * b - cf,
    a * e,
    df + ce * b,
    a * d,
    -b,
    a * c,
  ]);
}
