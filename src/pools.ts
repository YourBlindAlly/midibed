/**
 * Loop pools: named lists of library loops. A lane can use a pool instead of one loop; the engine then
 * plays the pool's loops one after another (in order or shuffled), changing on a bar line when a new scene
 * starts and, if wanted, every N bars. Pools are global (shared by all journeys) and saved as JSON text.
 */
export type Pool = { id: string; name: string; loops: string[] };

export const POOL_MODE_NAMES = ['In order', 'Shuffled, no repeats until all have played'];
/** How often a lane changes loop besides when a scene starts: bars (0 = only when the scene starts). */
export const POOL_EVERY_CHOICES = [0, 2, 4, 8, 16, 32];

export function parsePools(json: string): Pool[] {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p) => p && typeof p.id === 'string')
      .map((p) => ({
        id: String(p.id),
        name: String(p.name ?? 'Pool').slice(0, 40),
        loops: Array.isArray(p.loops) ? p.loops.filter((x: unknown) => typeof x === 'string') : [],
      }));
  } catch {
    return [];
  }
}

export function stringifyPools(pools: Pool[]): string {
  return JSON.stringify(pools);
}

export function newPool(pools: Pool[], name = ''): Pool[] {
  let n = pools.length + 1;
  while (pools.some((p) => p.id === `pool${n}`)) n++;
  return [...pools, { id: `pool${n}`, name: name.trim() || `Pool ${pools.length + 1}`, loops: [] }];
}

export function addLoopToPool(pools: Pool[], poolId: string, loopId: string): Pool[] {
  return pools.map((p) => (p.id === poolId && !p.loops.includes(loopId) ? { ...p, loops: [...p.loops, loopId] } : p));
}

export function addLoopsToPool(pools: Pool[], poolId: string, loopIds: string[]): Pool[] {
  return pools.map((p) => {
    if (p.id !== poolId) return p;
    const have = new Set(p.loops);
    return { ...p, loops: [...p.loops, ...loopIds.filter((id) => !have.has(id))] };
  });
}

export function removeLoopFromPool(pools: Pool[], poolId: string, loopId: string): Pool[] {
  return pools.map((p) => (p.id === poolId ? { ...p, loops: p.loops.filter((x) => x !== loopId) } : p));
}

export function renamePool(pools: Pool[], poolId: string, name: string): Pool[] {
  return pools.map((p) => (p.id === poolId ? { ...p, name: name.slice(0, 40) } : p));
}

export function deletePool(pools: Pool[], poolId: string): Pool[] {
  return pools.filter((p) => p.id !== poolId);
}
