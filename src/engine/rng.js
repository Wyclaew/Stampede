// Seeded PRNG (mulberry32) so a chaos run can be replayed with the same seed.
export function createRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
    weighted(items) {
      const total = items.reduce((s, it) => s + Math.max(0, it.weight), 0);
      if (total <= 0) return null;
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, it.weight);
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 900000) + 100000;
}
