# MidiBed roadmap (ideas, not promises)

Goal (Rusty, 2026-10-08): a seamless, evolving bed of music and sound that he plays instruments over.
Only the percussion is rhythmic. Everything else is a sustained bed. Add to this file as ideas come up;
move an item to CLAUDE.md's status log when it is built.

## Rusty's ideas

### STATUS 2026-10-08: items 1 and 2 are BUILT (Harmony layer, "Drone follows chords", "Pad follows chords",
### "Fifth only" chord type). Untested on a device until Rusty tries the build. See CLAUDE.md round 12.

### 1. Bass drone follows the chords (on/off)
Root sets the key. With "Drone follows chords" on, the bass plays the root of each chord instead of
staying on the key root.
- Design: separate the chord *progression* (harmony) from the pad *sound*. Today the chord loop lives
  inside the pad. If it becomes its own layer ("Harmony": mode, preset, degrees, bars per chord), then
  the pad AND the bass both follow it, and the bass keeps working even with the pad switched off.
- Engine: JS already computes chord note lists. Add a parallel list of bass notes per chord (the chord
  root in the drone register) and have the drone change at the same chord boundary as the pad. Old bass
  note off, new one on, same instant. A monophonic bass synth (Model D) suits this well.
- Scenes: "follows chords" should be scene-owned. The key root stays global.

### 2. Fifths drone (root + fifth only)
- CLARIFIED by Rusty: he meant a fifths PAD in a HIGHER register than the bass, taking the place of the chord
  pad, on the same sound engine as the pad. Two modes: a steady droning fifth, or following the harmony.
  Built as: pad chord type "Fifth only" + "Pad follows chords" on/off (off = steady tonic fifth).
- The BASS can also do root + fifth already: turn "Add octave" off and leave "Add fifth" on.
- Improvements worth doing: one "Drone voicing" choice (root only, root+octave, root+fifth,
  root+fifth+octave, root+fourth for a suspended feel) instead of two separate switches.
- Not a separate sound engine. It is just which notes are sent. But it could OPTIONALLY go to its own
  channel (an extra "fifth channel"), so the fifth could be a different timbre or a different app, and
  the root could be a clean bass. This is the "two voices, two sounds" idea.

### 3. BUILT 2026-10-08 (round 25): journeys + per-scene key + relative major/minor. Still to do: export/import, tuning offset. Original notes ("songs"):
- UPDATE 2026-10-08 (Rusty): "Journeys" (his word) can be PER INSTRUMENT. Example: his Native American Flute is in G# minor / B
  (G#m pentatonic = B major pentatonic), a key he would never choose for guitar or ocarina. So the KEY (root note) belongs to the
  journey, not the whole app. A journey holds: name (e.g. "Native flute, G# minor"), key, tempo, its scenes, and the program
  choices per sound slot (loading it can switch the synths to suitable sounds). Global: routing, device profiles, outputs,
  transition sound settings. Optional later: a tuning offset in cents per journey (pitch bend; flutes are not always A=440).
  Do this before many scenes are built in one key, since it changes how settings are saved (needs a careful migration).
- TONIC CHANGE PER SCENE (Rusty, 2026-10-08): a scene in a journey may change tonic, e.g. G# minor -> B major on the flute
  (relative major: the SAME seven notes, only the home note moves). Plan: a scene stores its key as a semitone OFFSET from
  the journey key (so changing the journey key transposes every scene) plus its mode (scenes already own the mode).
  Helper button "relative major/minor" sets offset +3 and Aeolian<->Ionian (or the reverse) in one step, and renumbers the
  chord degrees so the CHORDS KEEP SOUNDING THE SAME (degree d of the minor becomes ((d-3) mod 7)+1 in the relative major);
  only the centre of gravity moves. A steady bass drone moves G# -> B on the bar line of the scene change; a following bass
  and the pad keep their notes. Other helpers possible later: up a fourth, up a fifth, parallel major/minor (changes the
  notes, so not flute-friendly). MidiDancer's pentatonic on the new tonic holds the same notes with different landing notes.
  DECIDED: the root changes right on the bar line.
  CLARIFIED: a scene owns its own progression (mode, preset, degrees, bars). Chords are stored as DEGREES counted from the home
  note, so moving the home note with the same degrees CHANGES the chords (G#m: 1,7,4,7 = G#m F# C#m F#; in B major the same
  numbers give B, A#dim, E, A#dim). So offer two ways: (1) "Relative major/minor, keep the chords" renumbers the degrees so the
  same chords keep sounding; (2) "Fresh progression": switch key/mode and pick a new progression. Also make the preset list
  mode-aware (tag each preset with the modes it suits; add major-key ones such as 1-5-6-4, 1-4-5-1, 1-6-4-5).


A control you flick up/down to move to the next one. Each has a name. Possibly other overall settings.
- Name ideas: Song, Set, Bed, Journey, Mood. "Bed" fits the app, "Journey" fits the non-traditional form.
- Per song (suggested): name, tempo, key (drone root), its scenes (4 now, maybe up to 8), scene order and
  auto-advance plan (see 5), notes. Global (not per song): routing/channels, device profiles, outputs,
  fade times, sound slots.
- UI: a "Song" stepper (flick to change, reads the name), Rename (a text field), Duplicate, Delete.
- Switching: queued to the next bar line, same as scenes. Tempo and key can change at that point.
- Storage: state becomes a list of songs plus the active one. Needs a careful migration that wraps
  today's saved settings into "Song 1" (use `migrateState`).
- Export/import of songs as files is worth planning early so nothing is lost with the phone.

### 4. Background ambience player (ocean, rain, wind...)
- A different kind of layer: audio files, not MIDI. MidiBed would play them itself (it already has an
  audio engine for the test synth, and its audio session mixes with other apps).
- Looping: gapless, with a cross-fade at the loop point so there is no click or hole. One-shot mode that
  fires at random intervals (distant thunder, a bird) is a nice extra.
- Per-scene: which sound, level, on/off, with the usual fade in/out. Possibly a low-pass filter.
- Where do the sounds come from? Best: let Rusty IMPORT his own files (Files app / document picker).
  Avoids licensing and keeps the app small. Optionally bundle a few public-domain/CC0 loops later.
- Alternative: a dedicated ambience app driven by MidiBed's loops layer (start/stop/choose). Works today
  with the right app, but one player inside MidiBed gives better scene control.

### 4b. Transitional sounds (Rusty's idea, 2026-10-08)
Short clips, played by the same sample engine, tied to scene changes: e.g. an ocean-drum swell that starts a
beat or two BEFORE the change and lands on it, or a short sound that fades the old scene out within a beat
or two as the change happens.
- Needs lead time. The engine already knows exactly when a queued change will land (the next bar line), and
  for auto-advance (item 5) it knows far ahead, so that case is easy.
- Manual switch: if fewer beats remain before the next bar line than the clip's lead (say a 2-beat swell
  pressed on beat 4), defer the switch to the bar after, so the swell still has room. Make that a visible rule.
- Rusty's refinement (arranger-keyboard behavior): if you trigger too close to the bar line, don't always
  wait a whole bar. Play PART of the fill/swell, starting the clip partway through so it still ends exactly on
  the change. His old keyboard's limit was about one beat, possibly half a beat: closer than that and the fill
  is skipped (or the change waits for the next bar). Make the minimum remaining time a setting. Options for
  a late trigger: partial clip / wait for the next bar / skip the clip and just change.
- Per scene (or per song): "transition in" clip, lead in beats, level; a "transition out" clip for fades.
- The ambience layer's own fade could also be used as the "fade out within a beat or two" transition.

### 5a. BUILT 2026-10-08 (round 17), awaiting device test. Scene "breathing": automatic variations (Rusty's design)
After hearing "bass follows chords" and the fifths pad, Rusty likes the subtle or not so subtle shifts and wants
a scene to make them by itself. His design: independent per-layer rules, counted in bars from the start of the
scene.
- BASS: flip "Bass follows chords" every X bars (4, 8, whatever). Maybe with a probability.
- PAD: the same kind of flip for the chord pad (its "follows chords", and/or full chords vs fifths only).
- DRUMS: a "breakdown" option: every so often the drums drop out for a while, then return.
- STAYS FIXED: the scene's initial settings (where it starts), the chords (harmony) and the key.
Claude's refinements (to confirm with Rusty):
- Each flip happens ON a bar line, counted from when the scene started (scene switch or Play). The scene's saved
  setting is the starting state; the first change comes after X bars. Shared notes keep ringing, so a flip sounds
  like movement, not a restart. If X is a multiple of "bars per chord" it also lands on a chord change.
- Optional CHANCE per interval (100% = always flip, lower = sometimes skip), so it never feels mechanical.
- Optionally two lengths ("follow for 8 bars, steady for 4") instead of one, for uneven breathing.
- Breakdown: every X bars, for Y bars, either ALL drums out or a LIGHT version (kick and snare out, hats and
  shaker stay). Uses the drum fade times so it eases out and back in. Later it can trigger a transition sound
  (see 4b) on the way back in.
- Engine: pure bar-counting at the bar line, in native code (like scene switches). JS sends BOTH note lists for
  bass and pad (following and steady) plus the rules; the engine picks the active one. It should tell the
  screen the current state (for a "Currently: following / steady" readout) and can announce changes if wanted.
- Scene-owned settings (each scene has its own rules). A manual change to the base setting restarts the count.
- Small enough to build BEFORE the full auto-advance plan (item 5); they will share the bar counter.
- Open questions: what exactly the pad flips (follows on/off, full chords vs fifths, or both); uneven lengths
  wanted or not; breakdown styles wanted; announce changes or only show them.

### 4d. Built-in noise transitions. v1 BUILT 2026-10-08 (round 20): scene start + drum return triggers; see CLAUDE.md. Original plan:
A noise generator inside MidiBed (white, pink, brown) shaped by a filter and a volume envelope into the usual
producer transitions. No sample files, no licensing, tiny, and fully timed by the engine.
- Colors: white (bright hiss), pink (balanced, natural), brown (deep rumble, good for subtle washes).
- Shapes: RISER (low-pass opens up and gets louder, ending exactly on the bar line), DOWNLIFT (after the change,
  the filter closes and fades), SWELL (volume swell that cuts at the change), IMPACT (short burst on the bar
  line, with a decay), WASH (long gentle brown/pink bed under a change).
- Settings: color, shape, length in beats (a half beat to 8), level, filter range.
- Triggers: before / on / after a scene change; just before the drums return from a breakdown (a riser into the
  kick); when a bass or pad drop-out ends; every N bars inside a scene; a manual button. Each scene owns its settings.
- Late triggers (Rusty's arranger-keyboard example): because a synthesized riser's shape is a function of time left
  until the bar line, starting late simply joins the curve part-way. Smooth, no glitch, and exactly on the beat.
  A minimum remaining time (about one beat) below which it is skipped can be a setting.
- Where the sound comes from: MidiBed's own audio output (like the built-in test sound). It mixes with other apps
  at the iPhone/Bluetooth output but is NOT routed through another app's mixer (e.g. AUM strips), and its level is
  set in MidiBed only.
- Same trigger system will later drive imported samples (4b, 4c, the ambience player), so build the triggers once.
- Related, separate: generated DRUM fills (a short rising snare/tom burst on the last beat of every Nth bar, as MIDI to
  DrumJam or whatever plays the drums). Probably better than noise for rhythmic fills.

### 4c. Fills (Rusty, 2026-10-08)
A fill option, probably just the sample player told to play a particular sample as a fill or transition
before, during or after the 4th, 8th (or any) bar. Ties together with scene breathing and 4b:
- Trigger points: a bar number counted from the scene start, "every N bars", or "when a breakdown ends".
- Timing: before (lead-in that ends exactly on the bar line), during, or after the bar.
- Samples: imported by Rusty (the same import mechanism as the ambience player).
- Natural first uses: a fill as the drums return from a breakdown, a swell before a scene change.

### 5. BUILT 2026-10-09 (round 24): auto-advance + Freeze. Original notes:
- Per scene: "repeat N times, then go to": next scene / a chosen scene / random of a few / stay (hold).
  Length counted in bars or in chord-loops.
- This must happen NATIVELY on the bar line (like scene switches do), not from the UI, so it stays in
  time. Plan: send the engine the whole song (all scene configs plus the advance rules); the engine
  switches by itself and tells the UI which scene is now playing via an event. The UI follows.
- Needs a "Hold / freeze" control: stop auto-advancing right now while Rusty is mid-solo, and resume later.

## Suggestions (Claude) for the evolving bed

A. **Evolve on repeat.** Each time a scene repeats, nudge a few things within safe limits: a drum's hits
   by one, its rotation, a chord swapped for a neighbour (relative major/minor, add a 9th), pad voicing
   inversion, strum, filter range. An "Evolve amount" per scene (0 = identical repeats, higher = more
   change). This is probably the biggest single step toward "seamless and evolving". Combine with 5.
B. **Energy macro.** One control (0-100) that scales drum density, velocities, pad brightness and filter
   range together. A single flick to ease the bed down when Rusty wants room, or up for a build.
C. **Transitions.** Choose how a scene change sounds: instant, one-bar drum drop, filter sweep, drums
   thinning out before the change. Makes changes feel composed.
D. **Freeze / panic.** Freeze = stop evolving and auto-advancing. Panic = all notes off on every channel
   (cures any hung note in a receiving app).
E. **Pedal control.** Bluetooth pedal for next scene, next song, freeze (see LyriCue's pedal module in
   CLAUDE.md for the lessons about key capture).
F. **Gradual tempo changes.** When a song changes, glide the tempo over a few bars instead of jumping.
G. **MIDI file capture.** Record what the bed played to a .mid file so a good passage can be reused in
   Reaper. (Uses the same code the engine already has to know when notes happen.)
H. **Backups.** Export/import all settings to the Files app. Settings now live only on the phone.
I. **Spoken status (optional).** Quiet announcements of scene or song changes, off by default.

## Interface structure (BUILT 2026-10-08 as round 14; bottom tab bar, tempo+swing on Live)

Problem: one very long screen. Proposal: tabs, with the live controls always one gesture away.
- A slim strip at the TOP of every tab: Play/Stop, bar.beat position, and the four scene buttons. Never hidden.
- Tabs (each a short list):
  1. Live: layer switches, tempo and swing, later song/scene advance controls, Freeze, Energy.
  2. Harmony: harmony loop, chord pad, drone and bass.
  3. Rhythm: percussion (each drum can become a collapsible group) and loops.
  4. Sound: filter wanderers, fades, sounds in the other app (program/bank/favorites).
  5. Setup: output switches, MIDI clock, apps and devices, routing, test buttons.
- Tab bar position: bottom (conventional) or top (faster for VoiceOver swiping). Rusty to choose.
- Tabs are plain buttons with role "tab" and a selected state; NO custom swipe gestures (one-finger swipes
  belong to VoiceOver). Keep every control's state in the one shared settings object so nothing resets when
  switching tabs.
- Within a tab, headings stay (VoiceOver rotor > Headings jumps between sections).

VoiceOver magic tap (two-finger double tap anywhere): BUILT 2026-10-08, starts/stops playback and announces
"Playing" / "Stopped". Other possible magic-tap uses are not planned.

## Layers as internal modules (Rusty's idea, 2026-10-08)
Rusty asked whether smaller "plugins" like the noise generator should be a pattern, and whether the ambient sound
player should be one too. Decision to propose: INTERNAL LAYERS (modules inside MidiBed with a common contract), not
real AUv3 plug-ins. A layer receives the clock (bar lines, tempo), the harmony (key, mode, current chord, chord loop),
the scene on/off and fades, and outputs either MIDI (to a channel) or audio (MidiBed's own output). Splitting the
big engine file into layer modules should happen as these are added. A true AUv3 only matters for the noise
generator, and only if Rusty wants it on an AUM strip with effects.

### 6. MidiDancer (Rusty's name): improvises on the key and chords, single notes, MIDI to a channel
- DECIDED: Rusty agreed to all three scale questions (auto by mode with a manual override; include Hirajoshi and In-sen from the start; per scene). Locrian is not needed (see below), so no special case.
- SCALES (Rusty, 2026-10-08): stick to PENTATONIC scales, with a few to choose from depending on the situation.
  Candidates (intervals from the root): major pentatonic 1 2 3 5 6; minor pentatonic 1 b3 4 5 b7; suspended/Egyptian
  1 2 4 5 b7; blues minor/Man Gong 1 b3 4 b6 b7; Hirajoshi 1 2 b3 5 b6; In-sen 1 b2 4 5 b7. Keep the list as DATA so
  scales can be added later. Choice: Auto by the harmony's mode (Ionian/Lydian/Mixolydian -> major; Dorian ->
  minor or suspended; Aeolian/Phrygian -> minor; Locrian special-cased) with a manual override, saved per scene.
  Plan: scale rooted on the KEY, landing on tones of the current chord on strong beats; avoid or thin out a scale note a
  half step from a chord tone. MidiPick-Up may use the same notes but its last note may be a chord tone outside the scale.
- CHARACTER VOCABULARY (keep adding as Rusty finds new rules): busy/sparse, narrow/wide range, smooth/leapy,
  repeats/varies, pull toward chord tones, note length (held/short). Later: personality presets (Whisper, Drift, Curious, Playful).
- Knows key, mode and current chord: chord tones at strong moments, steps and small skips between, lots of rests.
- Controls: how busy, note range, phrase length (bars), repeat/vary a phrase it just played (motif memory), chance of
  resting, velocity changes, MIDI channel, per-scene on/off, fades. Reuse the Euclid rhythm code for note timing.
- It is the first rhythmic element besides percussion, so keep it sparse and gentle by default.

- HANDPAN / MEDITATIVE SCALES (Rusty, 2026-10-09): the handpan, tongue drum and meditative-music communities use many scales beyond the pentatonics above (names like Kurd, Celtic minor, Hijaz, Pygmy, Integral, Equinox, Amara, Annapurna, Saladin, Aegean, Oxalis are common; the exact notes differ by maker, so VERIFY each scale's notes from a maker's chart before encoding it, do not trust memory). Plan: scales are DATA (name, intervals from the home note, a note on the mood). Best fit is when a STEADY DRONE is playing (bass drone not following chords, pad off or steady fifths): then the scale colours a fixed home note and nothing clashes. Scales with a flat second or odd intervals (Hijaz-type) clash with changing chords, so offer them only for "steady drone" scenes, or warn. Some are just our modes under another name (Kurd = Aeolian); list those as aliases. MidiDancer picks from the scale list per scene; the chord layers keep using the six modes. Possible later: a drone-only "scale" for the whole scene (home note + scale, no chord loop).

- DECIDED 2026-10-09 (Rusty): no favourite scales; use CANONICAL music-theory definitions, not maker-specific handpan layouts. Starting list: natural minor (alias Kurd), Phrygian dominant (alias Hijaz), harmonic minor, double harmonic major (Byzantine), whole tone, plus the pentatonics (major, minor, Egyptian/suspended, Man Gong, Hirajoshi, In-sen, Iwato, Yo). Skip Celtic minor, Pygmy, Integral, Equinox and other layouts that differ by maker.
- CALL AND RESPONSE mode for MidiDancer (Rusty, 2026-10-09; also called Question and Answer): MD plays a short phrase (3-6 notes from the scene's scale, ending unresolved on the 2nd or 5th = the question), then goes silent for a set number of bars so the live player can repeat or answer. Settings to build: phrase length, space length (default = phrase length, or longer), next call = repeat / vary slightly / new each round, optional self-answer every Nth round landing on the home note (MidiBed cannot hear the player unless MIDI input exists, so it is a simple rule, not detection), phrase starts on the downbeat or just after. Freeze pauses it; per-scene on/off. Open questions sent to Rusty: space length default, self-answer yes/no, downbeat or just after.

### 7. MidiPick-Up (Rusty's name, 2026-10-08)
- A short single-note phrase in the last stretch of a chord (the last beat, half bar, or a length he sets) that lands on
  the DOWNBEAT of the next chord. Rusty: "a small portion of the scale which fits over the last chord and ends on the
  downbeat with a note either the root, or a chord tone for the new chord".
- Notes from the scale, chosen to fit over the chord that is ending; the final note is the target: the new chord's root
  or another chord tone (setting: root / chord tone / random). Single notes to a MIDI channel he chooses.
- Shapes (variety option like the noise sound): rising run, falling run, approach from a step above or below, arpeggio of
  the old chord stepping to the target, one note on the last beat held into the downbeat.
- Settings: number of notes (1-8), length in beats, target, direction, chance, level, per-scene switch.
- Rhythm choices: steady eighths, steady sixteenths, or a mix (Rusty to confirm).
- Shares phrase-building with MidiDancer. Can fire together with a noise transition at the loop boundary.

### 8. Intermission (a break for Rusty: water, or changing things on the phone)
- One button (could be on the magic tap or pedal later): the bed carries on by itself for a set time, with scenes
  auto-advancing (item 5), breathing, MidiDancer and the turnaround coming forward, then it fades out gently.
- Needs auto-advance with Freeze first.

### 4f. Ambient sound player as a layer
- Same audio path and triggers as the noise generator (scene start, breakdown...). Import Rusty's own files,
  loop without a click, per-scene level and fades. Largest piece because of file handling.

### E. Pedal actions (Rusty, 2026-10-08)
- Now: Rusty has a 2 button pedal (it acts as keyboard keys). Use for Start/Stop and Freeze/Unfreeze (button 1 = start/stop, button 2 = freeze/unfreeze; make the mapping a setting). Reference: LyriCue `modules/cueme-pedal-input` (native first-responder view with pressesBegan/pressesEnded, GCKeyboard only for connect/disconnect, debounce disconnect ~1.5 s, reclaim focus after a text field).
- Later: Rusty is strongly considering a new MIDI pedal for use with StageTraxx4. So MidiBed should also RECEIVE MIDI (a CoreMIDI virtual destination, plus connected sources) and map incoming Program Change / CC / notes to actions. Make the action list the same for both kinds of pedal.
- Action list to support: start/stop, freeze/unfreeze, next/previous scene, go to scene N, next/previous journey, drums mute/return (breakdown), fill / transition now, panic (all notes off), intermission.
- Learn mode: press the pedal, pick the action ("Learn" button), so no CC numbers have to be typed. Keep per-journey mappings out of it: pedal mappings are global.

## Suggested build order
1. Harmony as its own layer + "Drone follows chords" + drone voicing choices (items 1 and 2). Small,
   audible payoff, and the rest builds on it.
2. Auto-advance and the engine learning the whole song (5), with Freeze. Then Evolve on repeat (A).
3. Songs (3), including export/import.
4. Ambience player (4).
5. Energy macro (B), transitions (C), pedal (E).

## Decisions needed from Rusty
- Name for songs (Song / Set / Bed / Journey / something else).
- How many scenes per song: stay at 4, or allow up to 8?
- Ambience sounds: import-your-own only, or also bundle a few?
- Should key and tempo be allowed to change per song? (Assumed yes. Within a song they stay fixed.)

### 4e. Recurring noise sound (Rusty, 2026-10-08; design agreed in principle, awaiting 3 answers)
- A fourth transition sound, global on the Sound tab, with a per-scene on/off switch (Breathe tab).
- WHEN: every N bars from the scene start, OR at the end of each chord loop (barsPerChord x chords).
- CHANCE rolled once per boundary before anything is scheduled. Lead-ins start exactly (pre length) before the boundary, so a long rise gets its full length (pendingNoise already takes arbitrary start times).
- VARIETY: fixed shape / random from ticked shapes / in turn through the ticked shapes; optional random colour each time.
- Engine plan: per-boundary state (recurBoundary, recurPlay, recurShape, recurScheduled) rolled when a boundary is reached; at each bar line schedule the sound whose start falls inside the coming bar. Overlaps allowed (4 noise voices).
- Open questions: random/in-turn/both; one length or per shape; skip the first loop?
