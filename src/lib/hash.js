// Tiny isomorphic, deterministic string hash (FNV-1a, 64-bit expressed as hex).
//
// Used to key the plan cache by evidence content. Not cryptographic; it only
// needs to be stable and collision-resistant enough for a cache key, and to
// produce identical output in the browser and in Node without dependencies.

export function createHash(input) {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  // 64-bit FNV-1a using two 32-bit halves to stay in safe integer range.
  let h1 = 0x811c9dc5; // low
  let h2 = 0xcbf29ce4; // high
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    // multiply by FNV prime 0x100000001b3 across two halves
    const l = (h1 >>> 0) * 0x01000193;
    const hgh = (h2 >>> 0) * 0x01000193 + Math.floor(l / 0x100000000);
    h1 = l >>> 0;
    h2 = (hgh ^ (c << 8)) >>> 0;
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h2) + hex(h1);
}
