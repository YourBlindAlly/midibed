// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
import { MIDI_ACTIONS, isToggleAction } from '../src/midicontrol';
import { createPedal, PedalButtonConfig } from '../src/pedal';
import { defaultState, toEngineJson } from '../src/config';

function setup() {
  let clock = 1000;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const ran: string[] = [];
  const pedal = createPedal({
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: clock + ms, fn, id });
      return id;
    },
    clearTimer: (h) => {
      const k = timers.findIndex((t) => t.id === h);
      if (k >= 0) timers.splice(k, 1);
    },
    run: (id) => ran.push(id),
  });
  const advance = (ms: number) => {
    clock += ms;
    for (const t of [...timers].sort((a, b) => a.at - b.at)) {
      if (t.at <= clock) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    }
  };
  return { pedal, ran, advance };
}

const cfg = (c: Partial<PedalButtonConfig> = {}): PedalButtonConfig => ({
  tapId: 'freeze',
  holdMs: 700,
  doubleMs: 400,
  tapIsToggle: true,
  assumeReleases: true,
  ...c,
});

describe('pedal: tap, double tap and hold', () => {
  it('a button without a hold runs its tap the instant it is pressed', () => {
    const { pedal, ran } = setup();
    pedal.press('cc:0:20', cfg({ holdId: undefined }));
    expect(ran).toEqual(['freeze']);
  });

  it('a button with a hold waits: let go quickly and the tap runs as you let go', () => {
    const { pedal, ran, advance } = setup();
    pedal.press('cc:0:20', cfg({ holdId: 'play1' }));
    expect(ran).toEqual([]);
    advance(120);
    pedal.release('cc:0:20');
    expect(ran).toEqual(['freeze']);
    advance(2000); // the hold timer is gone
    expect(ran).toEqual(['freeze']);
  });

  it('still down at the hold time: only the hold runs, the tap never does, so nothing is undone', () => {
    const { pedal, ran, advance } = setup();
    pedal.press('cc:0:20', cfg({ holdId: 'play1' }));
    advance(700);
    expect(ran).toEqual(['play1']);
    pedal.release('cc:0:20');
    expect(ran).toEqual(['play1']);
  });

  it('a quick second press does the double instead, putting an on/off tap back first', () => {
    const { pedal, ran, advance } = setup();
    const c = cfg({ holdId: 'play1', doubleId: 'nextScene' });
    pedal.press('k', c);
    advance(80);
    pedal.release('k'); // the tap (freeze on)
    advance(150);
    pedal.press('k', c); // within 400 ms
    expect(ran).toEqual(['freeze', 'freeze', 'nextScene']);
    advance(1000); // no hold from this press
    pedal.release('k');
    expect(ran).toEqual(['freeze', 'freeze', 'nextScene']);
  });

  it('a second press too late is a new tap', () => {
    const { pedal, ran, advance } = setup();
    const c = cfg({ holdId: 'play1', doubleId: 'nextScene' });
    pedal.press('k', c);
    pedal.release('k');
    advance(900);
    pedal.press('k', c);
    pedal.release('k');
    expect(ran).toEqual(['freeze', 'freeze']);
  });

  it('a pedal not known to send releases keeps the instant tap (a hold would never run its tap)', () => {
    const { pedal, ran } = setup();
    pedal.press('k', cfg({ holdId: 'play1', assumeReleases: false }));
    expect(ran).toEqual(['freeze']);
    // after a release has been seen the button waits
    pedal.release('k');
    pedal.press('k', cfg({ holdId: 'play1', assumeReleases: false }));
    expect(ran).toEqual(['freeze']);
  });

  it('works for the scene buttons: tap does its own thing, hold plays or stays', () => {
    const { pedal, ran, advance } = setup();
    for (const n of [1, 2, 3, 4]) {
      pedal.press(`b${n}`, cfg({ tapId: 'fill', tapIsToggle: false, holdId: `play${n}` }));
      advance(700);
    }
    expect(ran).toEqual(['play1', 'play2', 'play3', 'play4']);
  });
});

describe('the new pedal actions and stay', () => {
  it('has a play-from-scene action for each scene, a stop-only action and a stay toggle, added at the end', () => {
    const ids = MIDI_ACTIONS.map((a) => a.id);
    expect(ids.slice(-7, -1)).toEqual(['play1', 'play2', 'play3', 'play4', 'stopOnly', 'stay']);
    expect(ids[ids.length - 1]).toBe('lane5');
    expect(isToggleAction(MIDI_ACTIONS.find((a) => a.id === 'stay')!.action)).toBe(true);
  });

  it('stay sets the scene\'s own move-on aside in what the engine gets, and is never saved as on', () => {
    const rule = { mode: 1, count: 4, unit: 0, target: 0 };
    const base = { ...defaultState, advance: rule };
    expect(JSON.parse(toEngineJson(base)).advance.mode).toBe(1);
    const stayed = JSON.parse(toEngineJson({ ...base, stayHere: true }));
    expect(stayed.advance).toEqual({ mode: 0, bars: 0, target: -1 });
    expect(defaultState.stayHere).toBe(false);
  });

  it('the engine drops an ending the scene had set up when the scene stays', () => {
    const e = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(e).toContain('staying on the scene sets aside an ending the scene had set up');
  });
});
