/** Shared normalized timeline: ignition, bloom, peak, breakup, smoke, fade. */
export const stageStarts = [0, 0.1, 0.24, 0.42, 0.62, 0.82, 1];
export function explosionProgress(explosion, time) {
  return Math.max(
    0,
    ((time - explosion.startedAt) * explosion.animationSpeed) /
      explosion.duration,
  );
}
export function explosionStage(progress) {
  for (let stage = 0; stage < 5; stage++)
    if (progress < stageStarts[stage + 1]) return stage;
  return 5;
}
export function expansionRadius(progress, radius) {
  return (
    radius *
    Math.min(
      1,
      0.45 +
        0.55 *
          Math.max(
            0,
            (progress - stageStarts[1]) / (stageStarts[2] - stageStarts[1]),
          ),
    )
  );
}
