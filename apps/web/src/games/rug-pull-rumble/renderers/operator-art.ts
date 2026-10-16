import type * as Phaser from 'phaser';
import type { OperatorAppearance, OperatorTraits } from '@rpr/protocol';
import { operatorArmor, operatorFeatures, operatorSignals, operatorFields, operatorTelemetry, type OperatorVectorElement } from '@rpr/content';

const INK = '#080d10';
const PLATE = '#182329';
const WHITE = '#edf3ea';
export const NEUTRAL_OPERATOR_TRAITS: OperatorTraits = Object.freeze({
  Shell: 'Angular Helm', Interface: 'Narrow Visor', Sigil: 'Empty',
  Signal: 'White Only', Mantle: 'Minimal Collar', Field: 'Void',
  Telemetry: 'None', Boundary: 'Single Ring',
});
export type ArmorPart = keyof typeof operatorArmor | 'head' | 'mantle' | 'seal';
export interface ArmorTexture { key: string; frame: ArmorPart; width: number; height: number; originX: number; originY: number }

function shape(ctx: CanvasRenderingContext2D, d: string, fill: string, stroke = WHITE, width = 1.3): void {
  const path = new Path2D(d);
  if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(path); }
  if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(path); }
}

/** Render only trusted, build-time extracted geometry, never arbitrary SVG. */
function feature(ctx: CanvasRenderingContext2D, elements: readonly OperatorVectorElement[], signal: string): void {
  for (const n of elements) {
    const p = new Path2D();
    if (n.tag === 'path') p.addPath(new Path2D(n.d ?? ''));
    else if (n.tag === 'circle') p.arc(Number(n.cx), Number(n.cy), Number(n.r), 0, Math.PI * 2);
    else if (n.tag === 'rect') p.rect(Number(n.x), Number(n.y), Number(n.width), Number(n.height));
    const color = (v: string | undefined): string => v === '$signal' ? signal : v ?? 'none';
    ctx.setLineDash((n['stroke-dasharray'] ?? '').split(/[ ,]+/).filter(Boolean).map(Number));
    if (n.fill && n.fill !== 'none') { ctx.fillStyle = color(n.fill); ctx.fill(p); }
    if (n.stroke && n.stroke !== 'none') {
      ctx.strokeStyle = color(n.stroke); ctx.lineWidth = Number(n['stroke-width'] ?? 1); ctx.stroke(p);
    }
  }
  ctx.setLineDash([]);
}

function paintPart(ctx: CanvasRenderingContext2D, part: ArmorPart, appearance?: OperatorAppearance): Omit<ArmorTexture, 'key' | 'frame'> {
  const t = appearance?.traits ?? NEUTRAL_OPERATOR_TRAITS;
  const signal = operatorSignals[t.Signal] ?? '#FFFFFF';
  const centered = part === 'head' || part === 'seal';
  const width = centered ? 64 : 72;
  const height = centered ? 64 : 72;
  ctx.scale(3, 3);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (centered) {
    ctx.translate(32, 32); ctx.scale(0.215, 0.215); ctx.translate(-128, -128);
    if (part === 'head') {
      feature(ctx, operatorFeatures.Shell[t.Shell] ?? [], signal);
      feature(ctx, operatorFeatures.Interface[t.Interface] ?? [], signal);
    } else feature(ctx, operatorFeatures.Boundary[t.Boundary] ?? [], signal);
  } else {
    ctx.translate(36, 16);
    if (part === 'mantle') {
      const coat = t.Mantle === 'Tactical Coat' || t.Mantle === 'Split Mantle';
      if (coat) {
        shape(ctx, 'M-20 0 L20 0 L27 48 L11 43 L0 30 L-11 43 L-27 48 Z', INK);
        shape(ctx, t.Mantle === 'Split Mantle' ? 'M-20 1 L-13 35 L-21 40 M20 1 L13 35 L21 40' : 'M-20 1 L-24 44 M20 1 L24 44', 'none', signal);
      }
      shape(ctx, t.Mantle === 'Hood Wrap' ? 'M-23 -3 L-13 -12 L0 -7 L13 -12 L23 -3 L15 10 L-15 10 Z'
        : t.Mantle === 'High Collar' ? 'M-17 3 L-16 -14 L-9 -8 L9 -8 L16 -14 L17 3 L0 12 Z'
          : t.Mantle === 'Armor Neck' ? 'M-20 0 L-12 -9 L12 -9 L20 0 L10 10 L-10 10 Z'
            : 'M-18 1 L-10 -5 L10 -5 L18 1 L0 9 Z', PLATE);
      shape(ctx, 'M-15 2 L0 8 L15 2', 'none', signal, 1.6);
    } else {
      shape(ctx, operatorArmor[part], part === 'abdomen' || part === 'hip' ? INK : PLATE);
      if (part === 'torso') {
        shape(ctx, operatorArmor.breastplate, '#26343b');
        shape(ctx, 'M-18 8 L-14 22 M18 8 L14 22', 'none', signal, 2);
        const field = operatorFields.indexOf(t.Field as typeof operatorFields[number]);
        ctx.strokeStyle = '#56706d'; ctx.lineWidth = 0.7;
        if (field > 0) {
          for (let i = 0; i < field; i++) {
            ctx.beginPath(); ctx.moveTo(-10 + i * 3, 12); ctx.lineTo(-7 + i * 3, 19); ctx.stroke();
          }
        }
        ctx.save(); ctx.translate(0, 16); ctx.scale(0.45, 0.45); ctx.translate(-128, -207);
        feature(ctx, operatorFeatures.Sigil[t.Sigil] ?? [], signal); ctx.restore();
        const telemetry = operatorTelemetry.indexOf(t.Telemetry as typeof operatorTelemetry[number]);
        ctx.fillStyle = signal;
        for (let i = 0; i < telemetry; i++) ctx.fillRect(-9 + i * 2.6, 31, 1.2, 1.5 + (i % 3));
      } else if (part !== 'breastplate' && part !== 'abdomen') {
        shape(ctx, part === 'boot' ? 'M-7 5 L14 5' : part === 'shoulder' ? 'M-7 -4 L5 -4 L9 2' : 'M3 4 L5 15', 'none', signal, 1.6);
        if (part === 'shin' || part === 'forearm') shape(ctx, 'M-5 6 L-3 17', 'none', '#668078', 1);
      }
    }
  }
  return { width, height, originX: 0.5, originY: centered ? 0.5 : 16 / height };
}

/** One texture per fighter keeps the articulated rig in a single GPU batch. */
export function bakeOperatorAtlas(scene: Phaser.Scene, key: string, appearance?: OperatorAppearance): Record<ArmorPart, ArmorTexture> {
  const parts: ArmorPart[] = [...Object.keys(operatorArmor) as (keyof typeof operatorArmor)[], 'head', 'mantle', 'seal'];
  const tile = 72 * 3;
  const texture = scene.textures.createCanvas(key, tile * 4, tile * 4);
  if (!texture) throw new Error('Unable to create Operator armor atlas');
  const ctx = texture.getContext();
  const frames = {} as Record<ArmorPart, ArmorTexture>;
  parts.forEach((part, index) => {
    const x = index % 4 * tile, y = Math.floor(index / 4) * tile;
    ctx.save(); ctx.translate(x, y);
    const art = paintPart(ctx, part, appearance);
    ctx.restore();
    texture.add(part, 0, x, y, art.width * 3, art.height * 3);
    frames[part] = { key, frame: part, ...art };
  });
  texture.refresh();
  return frames;
}
