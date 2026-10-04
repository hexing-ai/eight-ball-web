import type { Vec } from './types.js';

// Display hints in table metres. Keep the physical prediction unchanged.
export const GUIDE_LENGTH = { incoming: .65, target: .20, cue: .17 };
export function trimPath(points: Vec[], limit: number): Vec[] {
  if (!points.length || limit <= 0) return [];
  const result = [{ ...points[0] }];
  let remaining = limit;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < 1e-9) continue;
    const fraction = Math.min(1, remaining / distance);
    result.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
    remaining -= distance;
    if (remaining <= 0) break;
  }
  return result;
}
