import type { FighterState } from '@rpr/sim';
import { v1Moves } from '@rpr/content';

export interface Joint { readonly x: number; readonly y: number }
export interface OperatorPose {
  hip: Joint; neck: Joint; head: Joint;
  rearShoulder: Joint; rearElbow: Joint; rearHand: Joint;
  frontShoulder: Joint; frontElbow: Joint; frontHand: Joint;
  rearHip: Joint; rearKnee: Joint; rearAnkle: Joint;
  frontHip: Joint; frontKnee: Joint; frontAnkle: Joint;
  rootX: number; rootY: number; rotation: number;
}
const point = (x: number, y: number): Joint => ({ x, y });
const blend = (a: Joint, b: Joint, t: number): Joint => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const smooth = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

/** Pure presentation sampler. Move timing comes from the existing combat kit. */
export function sampleOperatorPose(f: Readonly<FighterState>, frame: number, previous?: OperatorPose): OperatorPose {
  const knockedOut = f.currentState === 'ko' || f.hasLost;
  // Terminal rounds retain their final hitstop counter forever. The fallen
  // pose must take priority; nonterminal impact freezes the prior joint pose.
  if (!knockedOut && f.hitstopFramesRemaining > 0 && previous) return previous;
  const crouch = f.currentState === 'crouch';
  const bob = knockedOut ? 0 : Math.sin(frame / 14) * 1.1;
  const hipY = crouch ? -24 : -55 + bob;
  const neckY = crouch ? -46 : -94 + bob;
  const p: OperatorPose = {
    hip: point(0, hipY), neck: point(2, neckY), head: point(4, neckY - 17),
    rearShoulder: point(-12, neckY + 7), rearElbow: point(-25, neckY + 29), rearHand: point(-12, neckY + 7),
    frontShoulder: point(14, neckY + 8), frontElbow: point(29, neckY + 24), frontHand: point(35, neckY - 4),
    rearHip: point(-8, hipY + 4), rearKnee: point(-22, crouch ? -12 : -29), rearAnkle: point(-27, -7),
    frontHip: point(8, hipY + 4), frontKnee: point(22, crouch ? -12 : -30), frontAnkle: point(28, -7),
    rootX: 0, rootY: 0, rotation: 0,
  };
  if (f.currentState === 'walk_forward' || f.currentState === 'walk_backward') {
    const stride = Math.sin(frame / 6) * (f.currentState === 'walk_backward' ? -1 : 1);
    p.frontAnkle = point(12 + stride * 23, -7 - Math.max(0, stride) * 9);
    p.rearAnkle = point(-12 - stride * 23, -7 - Math.max(0, -stride) * 9);
    p.frontKnee = point(15 + stride * 12, -31);
    p.rearKnee = point(-12 - stride * 12, -29);
  }
  if (!f.grounded && !knockedOut) {
    p.frontKnee = point(27, -43); p.frontAnkle = point(13, -19);
    p.rearKnee = point(-16, -33); p.rearAnkle = point(-33, -15);
    p.rearHand = point(-27, -109); p.frontHand = point(31, -115);
  }
  if (f.currentState === 'block' || f.currentState === 'blockstun') {
    p.frontElbow = point(29, -79); p.frontHand = point(25, -114);
    p.rearElbow = point(16, -79); p.rearHand = point(19, -103);
    p.head = point(-1, -109);
  }
  if (f.currentMove && f.currentState === 'attack') {
    const move = v1Moves.find(m => m.id === f.currentMove?.moveId);
    if (move) {
      const elapsed = f.currentMove.elapsedFrames;
      const extension = elapsed < move.startupFrames
        ? smooth(elapsed / move.startupFrames)
        : elapsed < move.startupFrames + move.activeFrames ? 1
          : 1 - smooth((elapsed - move.startupFrames - move.activeFrames) / Math.max(1, move.recoveryFrames));
      const low = move.inputCommand.button === 'lightLow' || move.inputCommand.button === 'heavyLow';
      const power = move.category === 'special' || move.category === 'super';
      if (low) {
        p.frontKnee = blend(p.frontKnee, point(37, -43), extension);
        p.frontAnkle = blend(p.frontAnkle, point(71, -32), extension);
        p.head = blend(p.head, point(-4, -110), extension);
        p.frontHand = blend(p.frontHand, point(18, -99), extension);
      } else {
        p.frontElbow = blend(p.frontElbow, point(40, power ? -88 : -105), extension);
        p.frontHand = blend(p.frontHand, point(power ? 78 : 70, power ? -82 : -108), extension);
        if (power) {
          p.rearElbow = blend(p.rearElbow, point(24, -74), extension);
          p.rearHand = blend(p.rearHand, point(61, -78), extension);
        }
        p.head = blend(p.head, point(10, -111), extension);
        p.neck = blend(p.neck, point(9, -94), extension);
      }
    }
  }
  if (f.currentState === 'hitstun') {
    p.neck = point(-8, -91); p.head = point(-14, -110);
    p.frontElbow = point(23, -67); p.frontHand = point(39, -72);
    p.rearHand = point(-36, -82);
  }
  if (knockedOut) {
    p.rootX = -50; p.rootY = -12; p.rotation = Math.PI / 2;
    p.frontHand = point(37, -69); p.rearHand = point(-32, -63);
    p.frontAnkle = point(22, -7); p.rearAnkle = point(-10, -7);
  }
  return p;
}
