import { defaultState, migrateState } from '../src/config';
import { defaultLane, lanesForEngine, setLoopDir, timingKey, autoNudgeFor, LibraryLoop, NUDGE_RANGE } from '../src/looplib';
import { LOOP_TIMING } from '../src/looptiming';

const fs = require('fs');
const path = require('path');
const swift = (f: string) => fs.readFileSync(path.join(process.cwd(), 'modules', 'midibed-engine', 'ios', f), 'utf8');

const loop = (id: string, name: string): LibraryLoop => ({ id, name, folder: 'F', file: `F__${name}.flac`, seconds: 4.8, bpm: 100, bars: 2, repeats: 1, peak: 0.8, rms: 0.1 });

describe('loop timing nudge', () => {
  beforeAll(() => setLoopDir('file:///loops/'));

  it('builds the table key from a name', () => {
    expect(timingKey('TAMBOURINE STR 8THS NO ACCENT 90bpm.flac')).toBe('tambourinestr8thsnoaccent90bpm');
    expect(timingKey('Set90-01 StrangeConga - Djembe_90')).toBe('set9001strangecongadjembe90');
  });

  it('the table holds whole milliseconds in a sensible range', () => {
    const vals = Object.values(LOOP_TIMING);
    expect(vals.length).toBeGreaterThan(0);
    for (const v of vals) {
      expect(Number.isInteger(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(80);
    }
  });

  it('a lane starts with no manual nudge, and the engine gets the automatic plus the manual nudge', () => {
    expect(defaultLane.nudge).toBe(0);
    const key = Object.keys(LOOP_TIMING)[0];
    const l = loop('a', key); // the key is already in table form, which timingKey leaves alone
    const lib = JSON.stringify([l]);
    const auto = autoNudgeFor(l);
    expect(auto).toBe(LOOP_TIMING[key]);
    const lanes = [{ ...defaultLane, loop: 'a', on: true }, { ...defaultLane, loop: 'a', on: true, nudge: 7 }, defaultLane, defaultLane, defaultLane];
    const out = lanesForEngine(lanes, lib, 100, 0, '[]', true);
    expect(out[0].nudge).toBe(auto);
    expect(out[1].nudge).toBe(auto + 7);
    expect(lanesForEngine(lanes, lib, 100, 0, '[]', false)[1].nudge).toBe(7);
    expect(NUDGE_RANGE).toBe(60);
  });

  it('a pool member carries its own automatic correction and the lane nudge', () => {
    const keys = Object.keys(LOOP_TIMING);
    const a = loop('a', keys[0]);
    const b = loop('b', keys[1]);
    const lib = JSON.stringify([a, b]);
    const pools = JSON.stringify([{ id: 'p1', name: 'P', loops: ['a', 'b'] }]);
    const lanes = [{ ...defaultLane, on: true, pool: 'p1', nudge: 3 }, defaultLane, defaultLane, defaultLane, defaultLane];
    const out = lanesForEngine(lanes, lib, 100, 0, pools, true)[0];
    expect(out.pool?.map((m) => m.nudge)).toEqual([LOOP_TIMING[keys[0]] + 3, LOOP_TIMING[keys[1]] + 3]);
  });

  it('the ambience lane is never nudged', () => {
    const key = Object.keys(LOOP_TIMING)[0];
    const lib = JSON.stringify([loop('a', key)]);
    const lanes = [defaultLane, defaultLane, defaultLane, defaultLane, { ...defaultLane, loop: 'a', on: true, nudge: 20 }];
    expect(lanesForEngine(lanes, lib)[4].nudge).toBe(0);
  });

  it('the automatic fix is on by default, and a saved choice is kept', () => {
    expect(defaultState.loopAutoNudge).toBe(true);
    expect(migrateState({ ...defaultState, loopAutoNudge: false }).loopAutoNudge).toBe(false);
    const old: any = { ...defaultState };
    delete old.loopAutoNudge;
    expect(migrateState(old).loopAutoNudge).toBe(true);
  });

  it('the native side starts a nudged lane part-way round its loop', () => {
    const lp = swift('LoopPlayer.swift');
    expect(lp).toContain('func setNudge(');
    expect(lp).toContain('nudgeMs');
    expect(lp).toContain('lanes[lane].pos = startPos');
    const eng = swift('MidiBedEngine.swift');
    expect(eng).toContain('synth.loops.setNudge(lane: i, ms: lane.nudge ?? 0)');
    expect(eng).toContain('l.nudge = c.nudge');
  });
});
