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

### 3. Multiple sets of scenes ("songs")
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

### 4c. Fills (Rusty, 2026-10-08)
A fill option, probably just the sample player told to play a particular sample as a fill or transition
before, during or after the 4th, 8th (or any) bar. Ties together with scene breathing and 4b:
- Trigger points: a bar number counted from the scene start, "every N bars", or "when a breakdown ends".
- Timing: before (lead-in that ends exactly on the bar line), during, or after the bar.
- Samples: imported by Rusty (the same import mechanism as the ambience player).
- Natural first uses: a fill as the drums return from a breakdown, a swell before a scene change.

### 5. Repeat a scene, or auto-advance after N repeats
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
