/**
 * Distribution hooks — configurable external links shown after the fight.
 *
 * Hooks are data: enabling, disabling, or editing a hook never touches combat
 * logic (Req 13.4/13.5). Disabled or invalid hooks are hidden, not fatal (13.7).
 * Destination URLs are placeholders for V1; Task 18 wires real destinations.
 */

export type DistributionHookPlacement = 'result-primary' | 'result-secondary' | 'menu';

export interface DistributionHook {
  id: string;
  label: string;
  description?: string;
  url: string;
  enabled: boolean;
  placement: DistributionHookPlacement;
}

export const distributionHooks: DistributionHook[] = [
  {
    id: 'related-project',
    label: 'See the main project',
    description: 'Where the rumble started.',
    url: 'https://example.com',
    enabled: true,
    placement: 'result-primary',
  },
  {
    id: 'merch',
    label: 'Grab the merch',
    url: 'https://example.com',
    enabled: false,
    placement: 'result-secondary',
  },
];
