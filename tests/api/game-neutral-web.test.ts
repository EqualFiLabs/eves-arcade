// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseReplayEnvelope, showReplayViewer } from '../../apps/web/src/arcade/replay';
import type { ArcadeGameManifest, ArcadeReplayContext } from '../../apps/web/src/arcade/types';

const trace = btoa(String.fromCharCode(1, 0, 0, 0, 1, 13, 0, 0, 0));

describe('game-neutral web platform contracts', () => {
  it('builds distinct landscape and portrait Phaser configurations', async () => {
    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([10, 20, 30, 128]) })),
      putImageData: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const { createGameConfig } = await import('../../apps/web/src/arcade/phaser/config-factory');
    const landscape = createGameConfig({
      parent: 'fighter',
      title: 'Fighter',
      width: 1280,
      height: 720,
      backgroundColor: '#101010',
      scene: [],
    });
    const portrait = createGameConfig({
      parent: 'launcher',
      title: 'Launcher',
      width: 540,
      height: 960,
      backgroundColor: 0x020617,
      scene: [],
      physics: { default: 'matter', matter: { gravity: { y: 0.8 } } },
      input: { keyboard: false, gamepad: true },
    });

    expect(landscape.scale).toMatchObject({ parent: 'fighter', width: 1280, height: 720 });
    expect(landscape).not.toHaveProperty('physics');
    expect(portrait).toMatchObject({ title: 'Launcher', physics: { default: 'matter' } });
    expect(portrait.scale).toMatchObject({ parent: 'launcher', width: 540, height: 960 });
    expect(portrait.scale?.mode).toBe(landscape.scale?.mode);
  });

  it('parses the minimal replay envelope and dispatches through the matching manifest adapter', async () => {
    const launch = vi.fn((ctx: ArcadeReplayContext) => {
      const progress = { frame: 0, totalFrames: 1, playing: true, speed: 1 as const };
      ctx.mount.dataset.adapter = ctx.replay.game.id;
      return {
        ready: Promise.resolve(),
        progress,
        play() { progress.playing = true; },
        pause() { progress.playing = false; },
        step() { progress.frame += 1; },
        setSpeed() {},
        async destroy() {},
      };
    });
    const manifest = fixtureManifest(launch);
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const viewer = showReplayViewer(root, { registry: [manifest], onBack() {} });
    const envelope = JSON.stringify({
      game: manifest.contract.game,
      seed: 7,
      evidence: {
        kind: 'input-trace',
        schema: { id: 'fixture.input', version: 2 },
        encodingVersion: 3,
        data: trace,
      },
    });

    const decoded = parseReplayEnvelope(envelope);
    expect([...decoded.evidence.bytes]).toEqual([1, 0, 0, 0, 1, 13, 0, 0, 0]);
    root.querySelector<HTMLTextAreaElement>('.replay-envelope')!.value = envelope;
    root.querySelector<HTMLButtonElement>('.replay-load')!.click();
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    expect(root.querySelector<HTMLElement>('.arcade-mount')?.dataset.adapter).toBe('fixture-flight');
    await viewer.destroy();
  });

  it('rejects replay metadata that does not match the selected game contract', async () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    showReplayViewer(root, { registry: [fixtureManifest(vi.fn())], onBack() {} });
    root.querySelector<HTMLTextAreaElement>('.replay-envelope')!.value = JSON.stringify({
      game: { id: 'fixture-flight', version: '1.0.0' },
      seed: 7,
      evidence: {
        kind: 'input-trace',
        schema: { id: 'wrong.input', version: 2 },
        encodingVersion: 3,
        data: trace,
      },
    });
    root.querySelector<HTMLButtonElement>('.replay-load')!.click();
    expect(root.querySelector('.replay-error')?.textContent).toContain('does not match');
  });

  it('keeps shared arcade modules free of game code and RPR content imports', () => {
    const arcadeDir = resolve(process.cwd(), 'apps/web/src/arcade');
    for (const file of sourceFiles(arcadeDir)) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain("from '@rpr/content'");
      if (!file.endsWith('/registry.ts')) {
        expect(source, file).not.toMatch(/from ['"]\.\.\/games\//);
      }
    }
  });
});

function fixtureManifest(launch: ReturnType<typeof vi.fn>): ArcadeGameManifest {
  return {
    contract: {
      game: { id: 'fixture-flight', version: '1.0.0' },
      resultSchema: { id: 'fixture.result', version: 1 },
      verification: {
        kind: 'input-trace',
        schema: { id: 'fixture.input', version: 2 },
        encodingVersion: 3,
      },
    },
    title: 'Fixture Flight',
    orientation: 'portrait',
    capabilities: {
      input: { keyboard: true, pointer: true, touch: true, gamepad: false },
      suspension: true,
    },
    leaderboards: [],
    replay: { load: async () => ({ launch }) },
    load: async () => ({ launch: () => ({ ready: Promise.resolve(), async destroy() {} }) }),
  };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}
