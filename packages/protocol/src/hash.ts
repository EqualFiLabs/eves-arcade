/** Minimal cross-runtime Web Crypto shape used without DOM or Node type imports. */
interface CryptoLike {
  subtle: {
    digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer>;
  };
}

/** SHA-256 hex digest of exact bytes, shared by browser and Node verification. */
export async function sha256HexBytes(data: Uint8Array): Promise<string> {
  const crypto = (globalThis as unknown as { crypto?: CryptoLike }).crypto;
  if (!crypto?.subtle) throw new Error('SHA-256 is unavailable in this runtime');

  // Copy the view so digest receives exactly this slice, never unrelated bytes
  // from a larger backing buffer.
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
