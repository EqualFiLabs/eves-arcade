# Operator catalog

Rug Pull Rumble serves Operator SVGs and traits from PostgreSQL. No browser or
API runtime calls the chain. No wallet, owner tracking, activation effects or
identity persistence in saved matches/replays is included.

## Provenance

The seed comes from EqualFiLabs/statics-app commit
`36c2dc192c320b510d7a63071dbad71868bcf546`, export version
`3ae699e07a0b5ba9`. All 5,555 source SVG files, including embedded traits and
trailing newlines, match content digest
`sha256:b9639daf8d898b663dc7b040f1698d89336af6bf89e9c0739b979b9a2524f0f5`.

At Robinhood **Mainnet chain 4663, block 89,828,051**, read-only verification
confirmed the collection's renderer binding and runtime hashes for the
collection, metadata renderer and SVG renderer against the deployment manifest.
Base SVGs and traits for IDs 1, 42, 2778 and 5555 matched the deployed renderer.
This was sampled artwork comparison plus complete local export digest checking,
not a fresh onchain rendering of all 5,555 tokens. Base rendering uses no
activation overlay; mutable live tiers do not make this dataset stale.

Addresses, runtime hashes, launch source commit and provenance block are pinned
in `apps/api/src/operator-seed.ts` and embedded in the compressed seed. The
original collection address is
`0xad5E9F96A91D1A6F550580b157af2068A0e8F0BE`.

## Reproduce and import

Use a clean Statics app checkout at the pinned commit, then:

```sh
pnpm --filter @rpr/api operators:package /absolute/path/to/statics-app
pnpm --filter @rpr/api migrate
pnpm --filter @rpr/api operators:import
```

Packaging requires only local export files. Compressed bytes are deterministic
for the same Node/zlib version; decoded content is digest-verified across
versions. Import requires DATABASE_URL, validates all records before storage,
uses one transaction and an advisory lock, and can safely be repeated. Failures
leave existing rows intact. Repeat import repairs missing or altered records.
The importer does not remove unrelated verification data. Production images
bundle the seed and provide `node apps/api/dist/import-operators.js`.

Production Compose imports after migration and before API startup. Readiness
checks the expected catalog digest and 5,555 records; it is not a byte-by-byte
integrity audit on every request. Deployment rollback can use the prior API/web
images; this additive migration preserves existing verification data.

## API and appearance boundary

- GET /api/operators/:tokenId returns ID, name, eight traits, artwork hash and
  a same-origin image URL. IDs are integers 1–5555.
- GET /api/operators/random?exclude=42 selects from stored rows.
- GET /api/operators/:tokenId/image.svg?v=:hash returns original SVG bytes,
  a hash ETag, image/svg+xml, sandbox CSP and bounded cache headers.

Incomplete/unavailable catalog: 503. Invalid IDs: 400. Missing records or
artwork versions: 404. Selection requires both portraits before Fight and
ticket issuance. Player/CPU roles remain distinct even in mirror matches.
Graphics work consumes the frozen appearance pair; changing cosmetics must
never change deterministic combat inputs, rules or result hashes.
