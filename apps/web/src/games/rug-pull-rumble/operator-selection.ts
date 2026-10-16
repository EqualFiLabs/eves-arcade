import { OPERATOR_TRAIT_NAMES, type OperatorAppearance, type OperatorTraits } from '@rpr/protocol';
import { operatorCopy } from '@rpr/content';
import type { ArcadePreparationContext } from '../../arcade/types';
import './operator-selection.css';

export interface SelectedOperator {
  readonly appearance: OperatorAppearance;
  /** Already decoded before ticket acquisition; reused by the Phaser texture manager. */
  readonly image: HTMLImageElement;
}
export interface RprOperatorSelection {
  readonly player: SelectedOperator;
  readonly cpu: SelectedOperator;
}
type Side = 'player' | 'cpu';

export function prepareOperators({ mount, signal }: ArcadePreparationContext): Promise<RprOperatorSelection> {
  if (signal.aborted) return Promise.reject(new DOMException('Selection cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const listeners = new AbortController();
    const requests: Partial<Record<Side, AbortController>> = {};
    const selected: Partial<Record<Side, SelectedOperator>> = {};
    const inputs = {} as Record<Side, HTMLInputElement>;
    const panels = {} as Record<Side, HTMLElement>;
    let finished = false;
    const section = document.createElement('section');
    section.className = 'operator-selection';
    section.setAttribute('aria-labelledby', 'operator-selection-title');
    const title = document.createElement('h2');
    title.id = 'operator-selection-title';
    title.tabIndex = -1;
    title.textContent = operatorCopy.title;
    const description = document.createElement('p');
    description.textContent = operatorCopy.description;
    const grid = document.createElement('div');
    grid.className = 'operator-grid';
    const fight = button(operatorCopy.fight);
    fight.className = 'operator-fight';
    fight.disabled = true;
    const controls = document.createElement('p');
    controls.className = 'operator-controls';
    controls.textContent = operatorCopy.controls;
    section.append(title, description, grid, controls, fight);
    mount.append(section);

    const updateFight = () => { fight.disabled = !selected.player || !selected.cpu; };
    const invalidate = (side: Side) => {
      requests[side]?.abort();
      requests[side] = undefined;
      delete selected[side];
      panels[side].replaceChildren();
      updateFight();
    };
    const load = async (side: Side, random: boolean) => {
      invalidate(side);
      const controller = new AbortController();
      requests[side] = controller;
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = operatorCopy.loading;
      panels[side].append(status);
      const timer = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const value = inputs[side].value.trim();
        if (!random && (!/^[1-9]\d{0,3}$/.test(value) || Number(value) > 5555)) {
          throw new Error(operatorCopy.invalidId);
        }
        const opposite: Side = side === 'player' ? 'cpu' : 'player';
        let appearance: OperatorAppearance;
        let image: HTMLImageElement;
        for (;;) {
          const other = selected[opposite];
          const url = random
            ? `/api/operators/random${other ? `?exclude=${other.appearance.tokenId}` : ''}`
            : `/api/operators/${value}`;
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error(response.status === 404 ? operatorCopy.notFound : operatorCopy.unavailable);
          appearance = parseAppearance(await response.json());
          image = await loadPortrait(appearance.imageUrl, controller.signal);
          if (finished || requests[side] !== controller || controller.signal.aborted) return;
          // The opposing selection may change while either request is pending.
          // Retry within this operation's original deadline before committing.
          if (!random || selected[opposite]?.appearance.tokenId !== appearance.tokenId) break;
        }
        inputs[side].value = String(appearance.tokenId);
        image.alt = appearance.name;
        const name = document.createElement('h4');
        name.textContent = appearance.name;
        const traits = document.createElement('dl');
        for (const key of OPERATOR_TRAIT_NAMES) {
          const label = document.createElement('dt');
          label.textContent = key;
          const value = document.createElement('dd');
          value.textContent = appearance.traits[key];
          traits.append(label, value);
        }
        panels[side].replaceChildren(image, name, traits);
        selected[side] = Object.freeze({ appearance, image });
        updateFight();
      } catch (error) {
        if (finished || requests[side] !== controller) return;
        status.setAttribute('role', 'alert');
        status.textContent = controller.signal.aborted ? operatorCopy.unavailable
          : error instanceof Error ? error.message : operatorCopy.unavailable;
        const retry = button(operatorCopy.retry);
        retry.addEventListener('click', () => void load(side, random), { signal: listeners.signal });
        panels[side].replaceChildren(status, retry);
      } finally {
        window.clearTimeout(timer);
      }
    };

    for (const side of ['player', 'cpu'] as const) {
      const fieldset = document.createElement('fieldset');
      fieldset.dataset.side = side;
      const legend = document.createElement('legend');
      legend.textContent = side === 'player' ? operatorCopy.player : operatorCopy.cpu;
      const form = document.createElement('form');
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.id = `operator-${side}`;
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.maxLength = 4;
      label.htmlFor = input.id;
      label.textContent = operatorCopy.tokenId;
      inputs[side] = input;
      const submit = button(operatorCopy.load);
      submit.type = 'submit';
      const random = button(operatorCopy.randomize);
      const panel = document.createElement('div');
      panel.className = 'operator-preview';
      panel.setAttribute('aria-live', 'polite');
      panels[side] = panel;
      input.addEventListener('input', () => invalidate(side), { signal: listeners.signal });
      form.addEventListener('submit', (event) => { event.preventDefault(); void load(side, false); }, { signal: listeners.signal });
      random.addEventListener('click', () => void load(side, true), { signal: listeners.signal });
      form.append(label, input, submit, random);
      fieldset.append(legend, form, panel);
      grid.append(fieldset);
    }

    const cleanup = () => {
      finished = true;
      signal.removeEventListener('abort', onAbort);
      listeners.abort();
      requests.player?.abort();
      requests.cpu?.abort();
      section.remove();
    };
    const onAbort = () => { cleanup(); reject(new DOMException('Selection cancelled', 'AbortError')); };
    signal.addEventListener('abort', onAbort, { once: true });
    fight.addEventListener('click', () => {
      if (!selected.player || !selected.cpu || finished) return;
      const result = Object.freeze({ player: selected.player, cpu: selected.cpu });
      cleanup();
      resolve(result);
    }, { signal: listeners.signal });
    title.focus();
  });
}

function button(text: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  return element;
}

function parseAppearance(value: unknown): OperatorAppearance {
  const row = value as Partial<OperatorAppearance> | null;
  if (!row || !Number.isInteger(row.tokenId) || row.tokenId! < 1 || row.tokenId! > 5555
    || typeof row.name !== 'string' || !/^[a-f0-9]{64}$/.test(row.artworkHash ?? '')
    || row.imageUrl !== `/api/operators/${row.tokenId}/image.svg?v=${row.artworkHash}`
    || !row.traits || OPERATOR_TRAIT_NAMES.some((key) => typeof row.traits![key] !== 'string')) {
    throw new Error(operatorCopy.unavailable);
  }
  return Object.freeze({ ...row, traits: Object.freeze({ ...row.traits }) as OperatorTraits }) as OperatorAppearance;
}

function loadPortrait(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.width = 256;
    image.height = 256;
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const onAbort = () => { cleanup(); image.removeAttribute('src'); reject(new DOMException('Image cancelled', 'AbortError')); };
    signal.addEventListener('abort', onAbort, { once: true });
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error(operatorCopy.unavailable)); };
    if (signal.aborted) onAbort();
    else image.src = url;
  });
}
