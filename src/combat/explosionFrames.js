import { explosionStage, stageStarts } from "./ultimateTimeline.js";

const tau = Math.PI * 2;
function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, tau);
  ctx.fill();
}
function star(ctx, r, color, rotation = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * tau + rotation,
      s = i % 2 ? r * 0.24 : r;
    const x = Math.cos(a) * s,
      y = Math.sin(a) * s;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Pure cel-art frame painter. No images, filters, downloads, or per-frame texture uploads. */
export function drawExplosionFrame(ctx, progress, size, palette) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 200, size / 200);
  const stage = explosionStage(progress);
  const local =
    (progress - stageStarts[stage]) /
    (stageStarts[stage + 1] - stageStarts[stage]);
  if (stage === 0) {
    const pulse = Math.sin((Math.min(1, local) * Math.PI) / 2);
    star(ctx, 12 + pulse * 38, palette.orange, 0.12);
    star(ctx, 10 + pulse * 33, palette.light, 0);
    star(ctx, 8 + pulse * 25, palette.core, 0);
  } else {
    const expansion =
      stage === 1 ? 0.45 + 0.55 * Math.sin((local * Math.PI) / 2) : 1;
    const spread = stage < 3 ? 0 : (progress - 0.42) * 35;
    const fade = stage === 5 ? 1 - local : 1;
    ctx.globalAlpha = fade;
    // Dark, scalloped silhouette with offset cel-colored inner lobes.
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * tau + 0.2;
      const orbit = (36 + spread) * expansion;
      const x = Math.cos(angle) * orbit,
        y = Math.sin(angle) * orbit * 0.82;
      const size =
        (24 + (i % 3) * 3) * expansion * (stage === 5 ? 1 - local * 0.45 : 1);
      disc(ctx, x, y, size + 4, palette.edge);
      disc(ctx, x, y, size, palette.smoke);
      if (stage <= 3) {
        const hot = stage === 3 ? 1 - local * 0.85 : 1;
        disc(ctx, x - 2, y - 3, size * 0.9 * hot, palette.amber);
        disc(ctx, x - 4, y - 5, size * 0.76 * hot, palette.orange);
        disc(ctx, x - 5, y - 7, size * 0.55 * hot, palette.light);
        if (stage < 3) disc(ctx, x - 6, y - 8, size * 0.36, palette.core);
      } else if (stage === 4) {
        // Hollow, broken smoke crescents: destination-out exposes real terrain.
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        disc(ctx, x - 5, y - 4, size * 0.65, "#000");
        ctx.restore();
      }
    }
    if (stage <= 2) {
      disc(ctx, 0, 0, 34 * expansion, palette.orange);
      star(ctx, (stage === 2 ? 58 : 40) * expansion, palette.light, 0.15);
      disc(ctx, 0, 0, 27 * expansion, palette.core);
      for (let i = 0; i < 4; i++)
        disc(
          ctx,
          Math.cos((i * tau) / 4) * 16 * expansion,
          Math.sin((i * tau) / 4) * 12 * expansion,
          16 * expansion,
          palette.core,
        );
    }
    if (stage >= 3) {
      // An actual transparent cavity replaces the extinguished core.
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      disc(ctx, 0, 0, stage === 3 ? local * 30 : 30 + local * 8, "#000");
      ctx.restore();
      for (let i = 0; i < 11; i++) {
        const a = (i * tau) / 11 + 0.3,
          r = 54 + (progress - 0.42) * 60;
        ctx.save();
        ctx.translate(Math.cos(a) * r, Math.sin(a) * r * 0.85);
        ctx.rotate(a);
        ctx.fillStyle =
          i % 3 === 0
            ? palette.light
            : stage === 3
              ? palette.smoke
              : palette.orange;
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          ((i % 3) + 2) * (stage === 5 ? 1 - local : 1),
          1.5,
          0,
          0,
          tau,
        );
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
