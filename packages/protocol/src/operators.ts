/** Cosmetic catalog data. Never part of a signed ticket or combat result. */
export const OPERATOR_TRAIT_NAMES = [
  'Field', 'Boundary', 'Shell', 'Interface', 'Mantle', 'Telemetry', 'Sigil', 'Signal',
] as const;
export type OperatorTraitName = typeof OPERATOR_TRAIT_NAMES[number];
export type OperatorTraits = Readonly<Record<OperatorTraitName, string>>;

export interface OperatorAppearance {
  readonly tokenId: number;
  readonly name: string;
  readonly traits: OperatorTraits;
  readonly artworkHash: string;
  readonly imageUrl: string;
}
