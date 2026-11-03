"""Render a MidiBed groove as a MIDI file to listen to in Reaper (or any DAW).

  python groove_midi.py --list [--file my-grooves.json]
  python groove_midi.py --groove "Downtempo" --bpm 88 --bars 8 --out downtempo.mid
  python groove_midi.py --groove "Downtempo" --thin 2          # the same 'Extra drums' setting as the app
  python groove_midi.py --groove "Mine" --file "MidiBed grooves and journeys.json"
  python groove_midi.py --groove "Downtempo" --exact           # every hit, as written, no randomness

The file has one track per drum (named), all on MIDI channel 10 with the app's drum notes (kick 36, snare 38, hat 42,
shaker 82, tambourine 54, low tom 45, mid tom 47, high tom 50). By default the take is one random realization of the
groove the way the app plays it: chance, humanize (a little softer at random), ghost notes, accents and looseness.
--exact leaves the randomness out. --seed N repeats the same take. Swing is applied like the app does (odd sixteenths
are late by swing/100 x half a sixteenth).

Needs mido (installed for the Python312 interpreter). Run `node tools/groove-tools/dump-library.js` first if
library.json is missing or the app's built-in grooves changed.
"""
import argparse
import json
import os
import random
import sys

import mido

HERE = os.path.dirname(os.path.abspath(__file__))
TICKS = 480  # per quarter note
STEP = TICKS // 4  # one sixteenth

THIN_NAMES = ['As written', 'A little sparser', 'Sparser', 'Very sparse', 'Kick and snare only']
THIN_DROP = [[], [], [7, 6], [7, 6, 5, 4], [2, 3, 4, 5, 6, 7]]
THIN_CHANCE = [1, 0.8, 0.6, 0.45, 0]
THIN_VELOCITY = [1, 0.92, 0.85, 0.8, 1]


def load_library(extra_file=None):
    with open(os.path.join(HERE, 'library.json'), encoding='utf8') as f:
        lib = json.load(f)
    grooves = list(lib['grooves'])
    rhythms = list(lib['rhythms'])
    if extra_file:
        with open(extra_file, encoding='utf8') as f:
            extra = json.load(f)
        for r in extra.get('rhythms', []):
            if not any(x['name'] == r['name'] for x in rhythms):
                rhythms.append(r)
        for g in extra.get('grooves', []):
            at = next((i for i, x in enumerate(grooves) if x['name'] == g['name']), None)
            if at is None:
                grooves.append(g)
            else:
                grooves[at] = g
    return lib['kit'], lib['notes'], rhythms, grooves


def euclid_hit(pos, hits, steps):
    return hits > 0 and (pos * hits) % steps < hits


def slot_pattern(spec, rhythms):
    """(steps, set of hit positions) for a drum spec, before rotation."""
    r = next((x for x in rhythms if x['name'] == spec.get('rhythm')), None)
    if r is not None and r['steps'] > 0:
        return r['steps'], set(r['hits'])
    e = spec.get('euclid') or {'hits': 0, 'steps': 16}
    steps = max(1, e['steps'])
    return steps, {p for p in range(steps) if euclid_hit(p, min(steps, e['hits']), steps)}


def thinned(spec, i, thin):
    if spec is None or spec.get('muted') or i in THIN_DROP[thin]:
        return None
    if i < 2:
        return spec
    s = dict(spec)
    s['chance'] = max(1, round(spec.get('chance', 100) * THIN_CHANCE[thin]))
    s['velocity'] = max(1, round(spec['velocity'] * THIN_VELOCITY[thin]))
    if thin > 0:
        s.pop('ghost', None)
    return s


def render(groove, kit, notes, rhythms, bpm, bars, thin, exact, seed):
    rng = random.Random(seed)
    mid = mido.MidiFile(type=1, ticks_per_beat=TICKS)
    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage('track_name', name=f"{groove['name']} ({THIN_NAMES[thin]})", time=0))
    meta.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(bpm), time=0))
    meta.append(mido.MetaMessage('time_signature', numerator=4, denominator=4, time=0))
    mid.tracks.append(meta)
    swing = groove.get('swing', 0) / 100.0
    total_steps = bars * 16
    for i, name in enumerate(kit):
        spec = thinned(groove['slots'][i] if i < len(groove['slots']) else None, i, thin)
        if spec is None:
            continue
        steps, hits = slot_pattern(spec, rhythms)
        rot = spec.get('rotation', 0)
        ghost = spec.get('ghost')
        accent = spec.get('accent')
        events = []  # (tick, note_on?, velocity)
        for step in range(total_steps):
            local = step % steps
            pos = (local - rot) % steps
            main = pos in hits
            is_ghost = False
            if not main and ghost and ghost.get('hits', 0) > 0:
                gpos = (local - ghost.get('rotation', 0)) % steps
                is_ghost = euclid_hit(gpos, min(steps, ghost['hits']), steps)
                if is_ghost and not exact and ghost.get('chance', 100) < 100 and rng.random() * 100 > ghost['chance']:
                    is_ghost = False
            if not (main or is_ghost):
                continue
            sure = main and spec.get('keepFirst') and pos == 0
            chance = spec.get('chance', 100) / 100.0
            if not exact and not sure and chance < 1 and rng.random() > chance:
                continue
            vel = float(ghost.get('velocity', 40) if is_ghost else spec['velocity'])
            if main and accent and accent.get('every', 0) > 1:
                rank = sum(1 for j in range(pos) if j in hits)
                shifted = rank - max(0, accent.get('offset', 0))
                if shifted % accent['every'] == 0:
                    vel *= 1 + min(1, accent.get('boost', 30) / 100.0)
            hum = spec.get('humanize', 20) / 100.0
            if not exact and hum > 0:
                vel *= 1 - hum * 0.4 * rng.random()
            v = max(1, min(127, int(vel)))
            start = step * STEP + (round(STEP * 0.5 * swing) if step % 2 == 1 else 0)
            if not exact and spec.get('looseMs', 0) > 0:
                ms = rng.random() * spec['looseMs']
                start += round(ms / 1000.0 * (bpm / 60.0) * TICKS)
            events.append((start, 1, v))
            events.append((start + 45, 0, 0))  # a short note: drum sounds ignore the length
        events.sort(key=lambda e: (e[0], e[1]))  # at the same tick the note-off goes first
        tr = mido.MidiTrack()
        tr.append(mido.MetaMessage('track_name', name=name, time=0))
        last = 0
        for tick, on, v in events:
            tr.append(mido.Message('note_on' if on else 'note_off', channel=9, note=notes[i], velocity=v, time=tick - last))
            last = tick
        tr.append(mido.MetaMessage('end_of_track', time=max(0, total_steps * STEP - last)))
        mid.tracks.append(tr)
    return mid


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--groove')
    ap.add_argument('--file', help='a MidiBed grooves and journeys file with more grooves and rhythms')
    ap.add_argument('--bpm', type=float, default=88)
    ap.add_argument('--bars', type=int, default=8)
    ap.add_argument('--thin', type=int, default=0, choices=range(5))
    ap.add_argument('--exact', action='store_true')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out')
    a = ap.parse_args()
    kit, notes, rhythms, grooves = load_library(a.file)
    if a.list or not a.groove:
        for g in grooves:
            print(f"{g['name']}: {g.get('about', '')}")
        return
    g = next((x for x in grooves if x['name'].lower() == a.groove.lower()), None)
    if g is None:
        sys.exit(f'No groove called {a.groove}. Use --list.')
    out = a.out or f"{g['name']} {int(a.bpm)}bpm.mid"
    render(g, kit, notes, rhythms, a.bpm, a.bars, a.thin, a.exact, a.seed).save(out)
    print(f'wrote {out}')


if __name__ == '__main__':
    main()
