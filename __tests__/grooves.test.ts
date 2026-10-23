// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
import { defaultState, toEngineJson } from '../src/config';
import { GROOVES, applyGroove, rememberGroove, restoreGroove } from '../src/grooves';
import { RHYTHMS, rhythmPattern } from '../src/rhythms';

describe('drum grooves', () => {
  it('every groove names real rhythms, has eight slots and sane numbers', () => {
    expect(new Set(GROOVES.map((g) => g.id)).size).toBe(GROOVES.length);
    expect(GROOVES.length).toBeGreaterThanOrEqual(12);
    for (const g of GROOVES) {
      expect(g.slots).toHaveLength(8);
      expect(g.about.length).toBeGreaterThan(30);
      expect(g.swing).toBeGreaterThanOrEqual(0);
      expect(g.swing).toBeLessThanOrEqual(60);
      expect(g.slots.some((s) => s !== null)).toBe(true);
      for (const s of g.slots) {
        if (!s) continue;
        expect(RHYTHMS.some((r) => r.name === s.rhythm)).toBe(true);
        expect(s.velocity).toBeGreaterThan(0);
        expect(s.velocity).toBeLessThanOrEqual(127);
      }
    }
  });

  it('keeps the library numbers it had, and the new single-drum patterns come after them', () => {
    expect(RHYTHMS[18].name).toBe('Kick on 1 and 3');
    for (const n of ['Beat 1 only', 'Heartbeat: lub-dub', 'Downtempo kick: 1, a of 2', 'Trip-hop kick', 'Boom bap kick', 'Lo-fi kick', 'Bossa kick']) {
      expect(RHYTHMS.findIndex((r) => r.name === n)).toBeGreaterThan(18);
    }
    expect(new Set(RHYTHMS.map((r) => r.name)).size).toBe(RHYTHMS.length);
  });

  it('applies to the scene: patterns, swing and which drums play, but not the sounds, notes or channels', () => {
    const tuned = { ...defaultState, drums: defaultState.drums.map((d, i) => ({ ...d, note: 40 + i, voice: i % 4, channel: i === 0 ? 3 : d.channel })) };
    const i = GROOVES.findIndex((g) => g.id === 'one-drop');
    const out = applyGroove(tuned, i);
    expect(out.swing).toBe(GROOVES[i].swing);
    out.drums.forEach((d, k) => {
      expect(d.note).toBe(tuned.drums[k].note);
      expect(d.voice).toBe(tuned.drums[k].voice);
      expect(d.channel).toBe(tuned.drums[k].channel);
      expect(d.enabled).toBe(GROOVES[i].slots[k] !== null);
    });
    // the one-drop kick falls on beat three only
    const kick = out.drums[0];
    expect(rhythmPattern(kick.rhythm, kick.rotation).map((v, n) => (v ? n : -1)).filter((n) => n >= 0)).toEqual([8]);
    expect(kick.keepFirst).toBe(true);
  });

  it('the Euclidean generator is untouched: a groove only sets the library choice, and rhythm 0 still works', () => {
    const out = applyGroove(defaultState, 0);
    const back = { ...out, drums: out.drums.map((d) => ({ ...d, rhythm: 0 })) };
    const json = JSON.parse(toEngineJson(back));
    expect(json.drums[0].useMask).toBeFalsy();
  });

  it('undo brings back every pattern field and the swing exactly', () => {
    const before = { ...defaultState, swing: 33 };
    const mem = rememberGroove(before);
    const changed = applyGroove(before, 5);
    expect(changed.drums).not.toEqual(before.drums);
    const restored = restoreGroove(changed, mem);
    expect(restored.swing).toBe(33);
    expect(restored.drums).toEqual(before.drums);
  });

  it('the Drums page has the chooser and the undo', () => {
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('label="Groove"');
    expect(app).toContain('Undo the groove');
  });
});
