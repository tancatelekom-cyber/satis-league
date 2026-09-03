export function calculateAdjustedGoalTarget(target: number, increasePercent: number) {
  if (!Number.isFinite(target) || target <= 0) return target;
  const safeIncreasePercent = Number.isFinite(increasePercent) ? Math.max(0, increasePercent) : 0;
  const adjustedTarget = target * (1 + safeIncreasePercent / 100);
  return Math.ceil(adjustedTarget - 1e-9);
}
