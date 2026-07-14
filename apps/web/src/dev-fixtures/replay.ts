import type { ArcadeReplayAdapter, ArcadeReplayHandle, ReplaySpeed } from '../arcade/types';

export function fixtureReplayAdapter(label: string): ArcadeReplayAdapter {
  return {
    launch(ctx): ArcadeReplayHandle {
      const totalFrames = ctx.replay.evidence.bytes.byteLength >= 5
        ? new DataView(
            ctx.replay.evidence.bytes.buffer,
            ctx.replay.evidence.bytes.byteOffset,
            ctx.replay.evidence.bytes.byteLength,
          ).getUint32(1, false)
        : 0;
      const progress = { frame: 0, totalFrames, playing: true, speed: 1 as ReplaySpeed };
      const surface = document.createElement('div');
      surface.className = 'fixture-replay-surface';
      surface.textContent = `${label} replay`;
      surface.dataset.game = ctx.replay.game.id;
      ctx.mount.append(surface);
      return {
        ready: Promise.resolve(),
        progress,
        play() { progress.playing = true; },
        pause() { progress.playing = false; },
        step() {
          progress.playing = false;
          progress.frame = Math.min(progress.totalFrames, progress.frame + 1);
        },
        setSpeed(speed) { progress.speed = speed; },
        async destroy() { surface.remove(); },
      };
    },
  };
}
