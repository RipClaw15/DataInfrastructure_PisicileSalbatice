export type Axes = { x: number; y: number; z: number };


export function angleDeg(a: Axes, b: Axes): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const norms = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  if (norms === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / norms))) * 180) / Math.PI;
}


export function meanAxes(samples: Axes[]): Axes {
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const sum = samples.reduce((s, a) => ({ x: s.x + a.x, y: s.y + a.y, z: s.z + a.z }), { x: 0, y: 0, z: 0 });
  return { x: round3(sum.x / samples.length), y: round3(sum.y / samples.length), z: round3(sum.z / samples.length) };
}
