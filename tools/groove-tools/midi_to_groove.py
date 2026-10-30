"""Turn a MIDI drum pattern (for example one edited in Reaper) into a MidiBed grooves file.

  python midi_to_groove.py edited.mid --name "Rainy lounge" --out "rainy lounge.json" [--swing 12]

The file is read as a loop of 16th-note steps. Drums are told apart by MIDI note (kick 35/36, snare 38/40/37,
closed/open/pedal hat 42/44/46, shaker 82/70, tambourine 54, low tom 41/43/45, mid tom 47, high tom 48/50), and each
drum becomes one slot with its own pattern. The loop length is the shortest whole number of bars (1, 2 or 4) that
repeats exactly; anything that does not fit a sixteenth-note grid is rounded to the nearest sixteenth. Velocity is the
middle velocity of that drum's hits. Load the result in MidiBed: Setup > Grooves and journeys from a file.
"""
import argparse
import json
import statistics
import sys

import mido

SLOT_OF_NOTE = {
    35: 0, 36: 0,
    37: 1, 38: 1, 40: 1,
    42: 2, 44: 2, 46: 2,
    82: 3, 70: 3, 69: 3,
    54: 4, 56: 4,
    41: 5, 43: 5, 45: 5,
    47: 6,
    48: 7, 50: 7,
}
KIT = ['Kick', 'Snare', 'Hat', 'Shaker', 'Tambourine', 'Low tom', 'Mid tom', 'High tom']


def read_hits(path):
    """{slot: {step: [velocities]}} on a sixteenth grid, and the number of steps the file spans."""
    mid = mido.MidiFile(path)
    tpb = mid.ticks_per_beat
    hits = {}
    last = 0
    for tr in mid.tracks:
        t = 0
        for m in tr:
            t += m.time
            if m.type == 'note_on' and m.velocity > 0 and m.note in SLOT_OF_NOTE:
                step = round(t / (tpb / 4))
                hits.setdefault(SLOT_OF_NOTE[m.note], {}).setdefault(step, []).append(m.velocity)
                last = max(last, step)
    length_ticks = max(t for t in [sum(m.time for m in tr) for tr in mid.tracks]) if mid.tracks else 0
    spans = max(last + 1, round(length_ticks / (tpb / 4)))
    return hits, spans


def loop_steps(hits, spans):
    """The shortest loop (16, 32 or 64 steps) that the whole file repeats exactly; 16 if the file is shorter."""
    for bars in (1, 2, 4):
        n = bars * 16
        if spans < n:
            break
        if all((s in by) == ((s % n) in by) for by in hits.values() for s in range(spans)):
            return n
    return 64 if spans > 32 else 32 if spans > 16 else 16


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('midi')
    ap.add_argument('--name', required=True)
    ap.add_argument('--about', default='')
    ap.add_argument('--swing', type=int, default=0, help='swing percent to store with the groove (the file itself is read straight)')
    ap.add_argument('--out')
    a = ap.parse_args()
    hits, spans = read_hits(a.midi)
    if not hits:
        sys.exit('No drum notes found (kick 36, snare 38, hat 42 and the rest of the kit).')
    n = loop_steps(hits, spans)
    if n > 32:
        print(f'Note: the pattern is {n} steps long; MidiBed takes at most 32 steps per drum, so only the first 32 are kept.')
        n = 32
    rhythms, slots = [], [None] * 8
    for slot in range(8):
        by = hits.get(slot)
        if not by:
            continue
        positions = sorted({s % n for s in by if s % n < n})
        vels = [v for s, vs in by.items() if s % n < n for v in vs]
        rname = f'{a.name} {KIT[slot].lower()}'
        rhythms.append({'name': rname, 'steps': n, 'hits': positions})
        slots[slot] = {'rhythm': rname, 'velocity': int(statistics.median(vels)), 'humanize': 15}
    out = {
        'app': 'MidiBed', 'grooveFile': 1, 'rhythms': rhythms,
        'grooves': [{'name': a.name, 'about': a.about or 'A groove made from a MIDI pattern.', 'swing': a.swing, 'slots': slots}],
    }
    path = a.out or f'{a.name}.json'
    with open(path, 'w', encoding='utf8') as f:
        json.dump(out, f, indent=1)
    print(f'wrote {path}: {sum(1 for s in slots if s)} drums, {n} steps')


if __name__ == '__main__':
    main()
