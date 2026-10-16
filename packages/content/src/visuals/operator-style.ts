import features from './operator-features.json';

/** Original Statics base portrait geometry. See docs/operator-fighter-art.md. */
export interface OperatorVectorElement {
  readonly tag: string;
  readonly [attribute: string]: string | undefined;
}
export const operatorFeatures: Readonly<Record<'Shell' | 'Interface' | 'Sigil' | 'Boundary', Readonly<Record<string, readonly OperatorVectorElement[]>>>> = features.features;
export const operatorFeatureSourceDigest = features.sourceDigest;

export const operatorSignals: Readonly<Record<string, string>> = {
  'Neon Green': '#8CFF00', Cyan: '#00E5FF', Amber: '#FFB000',
  Red: '#FF3344', Purple: '#B55CFF', 'White Only': '#FFFFFF',
};
export const operatorMantles = ['Minimal Collar', 'High Collar', 'Hood Wrap', 'Armor Neck', 'Tactical Coat', 'Split Mantle'] as const;
export const operatorFields = ['Void', 'Grid', 'Target', 'Split Horizon', 'Static Field', 'Data Panel', 'Signal Bands', 'Vault'] as const;
export const operatorTelemetry = ['None', 'Bar Chart', 'Line Graph', 'Metric Blocks', 'Basket Indicators', 'Liquidity Panel', 'Yield Readout', 'Risk Readout'] as const;

/** Armor paths use a local 130-unit standing rig, facing right. */
export const operatorArmor = {
  torso: 'M-18 0 L-24 8 L-18 28 L-12 37 L12 37 L18 28 L24 8 L18 0 L0 5 Z',
  breastplate: 'M-17 5 L0 10 L17 5 L13 21 L0 27 L-13 21 Z',
  abdomen: 'M-11 28 L11 28 L9 34 L-9 34 Z',
  hip: 'M-15 -5 L15 -5 L19 4 L10 11 L-10 11 L-19 4 Z',
  upperArm: 'M-8 0 L6 -2 L10 7 L6 24 L-4 26 L-9 8 Z',
  forearm: 'M-6 -1 L7 -1 L10 17 L5 26 L-6 24 L-10 12 Z',
  fist: 'M-7 -5 L5 -7 L10 -1 L8 8 L-3 10 L-9 4 Z',
  thigh: 'M-8 -3 L7 -3 L9 9 L5 28 L-5 28 L-10 9 Z',
  shin: 'M-6 -3 L7 -3 L10 7 L7 28 L-6 28 L-9 9 Z',
  boot: 'M-8 -8 L7 -8 L9 -2 L18 3 L18 8 L-9 8 L-12 3 Z',
  shoulder: 'M-12 -3 L-4 -10 L8 -8 L14 3 L6 10 L-8 9 Z',
} as const;
