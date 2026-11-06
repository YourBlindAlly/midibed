import { defaultState, migrateState } from '../src/config';
import { MIDI_ACTIONS } from '../src/midicontrol';

const fs = require('fs');
const path = require('path');
const swift = (f: string) => fs.readFileSync(path.join(process.cwd(), 'modules', 'midibed-engine', 'ios', f), 'utf8');

describe('hold this chord', () => {
  it('is off by default and never comes back on from saved settings', () => {
    expect(defaultState.chordHold).toBe(false);
    expect(migrateState({ ...defaultState, chordHold: true }).chordHold).toBe(false);
  });

  it('has a MIDI action', () => {
    expect(MIDI_ACTIONS.some((a) => a.id === 'chordHold')).toBe(true);
  });

  it('the engine latches the hold on a bar line, counts the chord loop from the held time, and waits the countdown', () => {
    const eng = swift('MidiBedEngine.swift');
    expect(eng).toContain('private var chordStartTick: Int { padStartTick + chordHoldTicks }');
    expect(eng).toContain('if tickIndex % barTicks == 0 { latchChordHold(at: nextTickTime) }');
    expect(eng).toContain('if chordHeld { chordHoldTicks += 1 }');
    expect(eng).toContain('let rel = tick - chordStartTick');
    expect(eng).toContain('rel % chordTicks == 0, !chordHeld');
    expect(eng).toContain('if cfg.frozen || chordHeld {');
    expect(eng).toContain('!chordHoldWanted && !chordHeld');
    expect(eng).toContain('clearChordHold(tellUI: true)');
    expect(swift('MidiBedEngineModule.swift')).toContain('Function("setChordHold")');
  });

  // The same arithmetic as the engine, to check the chord lands where it should after a hold.
  it('picks the chord loop up exactly where it left off', () => {
    const barTicks = 4;
    const chords = ['G', 'C', 'D'];
    const perChord = 1; // bars
    const chordTicks = barTicks * perChord;
    const holdFrom = 2 * barTicks; // asked for; latches on the bar line that would start D... (bar 2 is D)
    const holdTo = 5 * barTicks;
    let held = 0;
    const played: string[] = [];
    for (let tick = 0; tick < 8 * barTicks; tick++) {
      const holding = tick >= holdFrom + barTicks && tick < holdTo; // latched at the bar line after D began
      if (holding) held += 1;
      const rel = tick - held;
      if (!holding && rel >= 0 && rel % chordTicks === 0) played.push(chords[(rel / chordTicks) % chords.length]);
    }
    // G, C, D, then D is held for bars 3 and 4, then the loop goes on to G, C, D
    expect(played).toEqual(['G', 'C', 'D', 'G', 'C', 'D']);
  });
});
