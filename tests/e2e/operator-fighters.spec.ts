import { expect, test, type Page } from '@playwright/test';
import { chooseRprOperators, launchRprViaShell, runningSceneKey } from './helpers';
import { writeFile } from 'node:fs/promises';

interface ImageView { name: string; x: number; y: number; rotation: number; cameraFilter: number; getBounds(): { top: number; bottom: number }; frame: { cutX: number; cutY: number; cutWidth: number; cutHeight: number }; texture: { key: string; getSourceImage(): HTMLCanvasElement } }
interface ContainerView { name: string; scaleX: number; list: ImageView[]; cameraFilter: number }
interface SceneView { children: { list: (ContainerView & ImageView)[] }; cameras: { cameras: { id: number; worldView: { y: number; height: number } }[] }; scene: { pause(): void; resume(): void } }
interface GameView { scene: { getScene(key: string): SceneView }; textures: { exists(key: string): boolean }; events: { on(name: string, callback: () => void): void } }

async function rigs(page: Page) {
  return page.evaluate(() => {
    const game = (window as unknown as { __game: GameView }).__game;
    const scene = game.scene.getScene('FightScene');
    return scene.children.list.filter(o => o.name.startsWith('operator-rig-')).map(r => {
      const head = r.list.find(o => o.name === 'head')!;
      const canvas = document.createElement('canvas');
      canvas.width = head.frame.cutWidth; canvas.height = head.frame.cutHeight;
      canvas.getContext('2d')!.drawImage(head.texture.getSourceImage(), head.frame.cutX, head.frame.cutY,
        head.frame.cutWidth, head.frame.cutHeight, 0, 0, canvas.width, canvas.height);
      return {
      name: r.name, scaleX: r.scaleX,
      parts: r.list.map(o => ({ name: o.name, x: o.x, y: o.y, rotation: o.rotation, key: o.texture.key })),
      helmet: canvas.toDataURL(),
      hiddenFromHud: !!(r.cameraFilter & scene.cameras.cameras[1]!.id)
        || r.list.every(o => !!(o.cameraFilter & scene.cameras.cameras[1]!.id)),
    }; });
  });
}

test('close camera keeps a real double jump and both fighters inside the viewport', async ({ page }) => {
  await launchRprViaShell(page);
  await page.keyboard.down('ArrowRight');
  const state = () => page.evaluate(() => (window as unknown as { __engine: { state: { frame: number; player: { position: { x: number; y: number }; grounded: boolean; airJumpsUsed: number }; cpu: { position: { x: number } } } } }).__engine.state);
  // Shared CI software rendering advances fewer simulation frames per second.
  // Keep the close-spacing requirement, allowing the same setup time as the
  // existing real movement checks rather than assuming five wall-clock seconds.
  await expect.poll(async () => { const s = await state(); return Math.abs(s.cpu.position.x - s.player.position.x); }, { timeout: 15_000, intervals: [20] }).toBeLessThan(210);
  await page.keyboard.up('ArrowRight');
  await page.evaluate(() => {
    const w = window as unknown as { __game: GameView; __engine: { state: { player: { airJumpsUsed: number } } }; jumpView: { samples: number; margin: number } };
    w.jumpView = { samples: 0, margin: Infinity };
    w.__game.events.on('poststep', () => {
      if (w.__engine.state.player.airJumpsUsed === 0) return;
      const s = w.__game.scene.getScene('FightScene');
      const view = s.cameras.cameras[0]!.worldView;
      for (const rig of s.children.list.filter(o => o.name.startsWith('operator-rig-'))) {
        for (const name of ['head', 'frontBoot', 'rearBoot']) {
          const b = rig.list.find(p => p.name === name)!.getBounds();
          w.jumpView.margin = Math.min(w.jumpView.margin, b.top - view.y, view.y + view.height - b.bottom);
        }
      }
      w.jumpView.samples++;
    });
  });
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state()).player.grounded, { intervals: [20] }).toBe(false);
  await page.keyboard.up('ArrowUp');
  const takeoff = (await state()).frame;
  await expect.poll(async () => (await state()).frame, { intervals: [20] }).toBeGreaterThan(takeoff + 10);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state()).player.airJumpsUsed).toBe(1);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await state()).player.grounded, { timeout: 10_000 }).toBe(true);
  const view = await page.evaluate(() => (window as unknown as { jumpView: { samples: number; margin: number } }).jumpView);
  expect(view.samples).toBeGreaterThan(5);
  expect(view.margin).toBeGreaterThanOrEqual(0);
});

test('keyboard strikes articulate and simulation hitstop freezes the joints', async ({ page }, info) => {
  await launchRprViaShell(page);
  // Observe after real game steps; no simulation fields or input traces are
  // patched. A frame observer catches short active/hitstop windows reliably.
  await page.evaluate(() => {
    const w = window as unknown as { __game: GameView; __engine: { state: { frame: number; player: { hitstopFramesRemaining: number }; cpu: { hitstopFramesRemaining: number } } }; rigMotion: { punch: boolean; kick: boolean; heldSamples: number; movedDuringStop: boolean } };
    w.rigMotion = { punch: false, kick: false, heldSamples: 0, movedDuringStop: false };
    const previous: { frame: number; stopped: boolean; pose: string }[] = [];
    w.__game.events.on('poststep', () => {
      const scene = w.__game.scene.getScene('FightScene');
      const containers = scene.children.list.filter(o => o.name.startsWith('operator-rig-'));
      for (const [index, rig] of containers.entries()) {
        if (index === 0) {
          w.rigMotion.punch ||= rig.list.find(p => p.name === 'frontFist')!.x > 60;
          w.rigMotion.kick ||= rig.list.find(p => p.name === 'frontBoot')!.x > 60;
        }
        const f = index === 0 ? w.__engine.state.player : w.__engine.state.cpu;
        const frame = w.__engine.state.frame;
        const pose = JSON.stringify(rig.list.map(p => [p.x, p.y, p.rotation]));
        const stopped = f.hitstopFramesRemaining > 0;
        const before = previous[index];
        if (stopped && before?.stopped && frame !== before.frame) {
          w.rigMotion.heldSamples++;
          w.rigMotion.movedDuringStop ||= pose !== before.pose;
        }
        previous[index] = { frame, stopped, pose };
      }
    });
  });
  const motion = () => page.evaluate(() => (window as unknown as { rigMotion: { punch: boolean; kick: boolean; heldSamples: number; movedDuringStop: boolean } }).rigMotion);
  await page.keyboard.down('KeyA');
  await expect.poll(async () => (await motion()).punch).toBe(true);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyZ');
  await expect.poll(async () => (await motion()).kick).toBe(true);
  await page.keyboard.up('KeyZ');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await motion()).heldSamples, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.keyboard.up('ArrowRight');
  expect((await motion()).movedDuringStop).toBe(false);
  await page.screenshot({ path: info.outputPath('operators-in-combat.png') });
});

for (const [player, cpu] of [[42, 5555], [24, 123], [520, 16], [16, 16]]) {
  test(`articulated Operators ${player}/${cpu} preserve identity and release owned parts`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/'); await page.locator('.arcade-game').first().click();
    await chooseRprOperators(page, player, cpu);
    await page.getByRole('button', { name: 'Fight', exact: true }).click();
    await expect.poll(() => runningSceneKey(page)).toBe('FightScene');
    const initial = await rigs(page);
    for (const [side, rig] of initial.entries()) await writeFile(info.outputPath(`helmet-${side}.png`), Buffer.from(rig.helmet.split(',')[1]!, 'base64'));
    expect(initial).toHaveLength(2);
    expect(initial.every(r => r.parts.length === 19 && r.hiddenFromHud)).toBe(true);
    expect(initial[0]!.scaleX).toBeGreaterThan(0); expect(initial[1]!.scaleX).toBeLessThan(0);
    if (player === cpu) expect(initial[0]!.helmet).toBe(initial[1]!.helmet);
    else expect(initial[0]!.helmet).not.toBe(initial[1]!.helmet);
    expect(initial[0]!.parts.map(p => p.key).some(k => initial[1]!.parts.some(p => p.key === k))).toBe(false);
    await page.screenshot({ path: info.outputPath(`operators-${player}-${cpu}.png`) });
    await page.keyboard.down('ArrowDown');
    await expect.poll(async () => (await rigs(page))[0]!.parts.find(p => p.name === 'head')!.y).toBeGreaterThan(-80);
    await page.keyboard.up('ArrowDown');
    await expect.poll(async () => (await rigs(page))[0]!.parts.find(p => p.name === 'head')!.y).toBeLessThan(-90);
    // Hold references across the real shell Exit flow to verify owned textures
    // and all container children are released, rather than only hidden.
    await page.evaluate(() => {
      const w = window as unknown as { __game: GameView; heldRigScene: SceneView; heldRigGame: GameView; heldRigKeys: string[] };
      w.heldRigGame = w.__game; w.heldRigScene = w.__game.scene.getScene('FightScene');
      w.heldRigKeys = w.heldRigScene.children.list.filter(o => o.name.startsWith('operator-rig-')).flatMap(r => r.list.map(p => p.texture.key));
    });
    await page.locator('.arcade-back').click();
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(await page.evaluate(() => {
      const w = window as unknown as { heldRigScene: SceneView; heldRigGame: GameView; heldRigKeys: string[] };
      return { objects: w.heldRigScene.children.list.length, textures: w.heldRigKeys.filter(k => w.heldRigGame.textures.exists(k)) };
    })).toEqual({ objects: 0, textures: [] });
    expect(errors).toEqual([]);
  });
}
