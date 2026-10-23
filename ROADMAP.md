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

### 6. v1 (Call and Response) BUILT 2026-10-09, round 26; see CLAUDE.md. MidiDancer (Rusty's name): improvises on the key and chords, single notes, MIDI to a channel
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

- CALL AND RESPONSE ANSWERS (Rusty, 2026-10-09): (1) FREEZE DOES NOT PAUSE MidiDancer / Call and Response: it is meant to be a tool for frozen scenes. (2) SPACE LENGTH = the number of COMPLETE BARS the phrase occupies, counted from the bar line before it starts. Example: a phrase from beat 3 of bar 1 to beat 1 of bar 2 occupies bars 1-2, so the response space is bars 3-4 (starts on the downbeat of bar 3, ends at the end of bar 4); then the next call can begin. (3) NO self-answer rule for now (shelved; only makes sense if MidiBed gets MIDI input and the player has a MIDI instrument). (4) The phrase may start ANYWHERE in the bar; phrase shape is governed by rules instead: density, busyness (and more to come: note length, rests, range, direction/contour, repeat vs vary, chance of a rest-led start).


### 6b. BUILT 2026-10-10 (round 35): MidiDancer SOLO mode: plays by itself (Rusty, 2026-10-10)
- Separate from Call and Response: a mode where MidiDancer just keeps playing on its own, so Rusty can take a break or do setup on the phone while the bed carries on with a living melodic line. Same scales, register, density, busyness, rests and contour rules; no response gaps for the player.
- Ideas (not yet agreed): phrases follow each other with a short rest between (a 'breath' of one beat to one bar, settable); an optional slow drift in density/register so it does not loop audibly; picks a new phrase in turn or at random; follows the scene's key and scale; one-key shortcut and a layer toggle to switch between Call and Response and Solo (maybe a 'Mode' stepper: Call and response / Solo). Relationship with Intermission (item 8): a break could start Solo mode and quieten the rest.
- Open questions for Rusty: how continuous (a phrase right after a phrase, or a rest between), whether it should thin out on its own over time, and whether Solo should stop when he switches scene or carry on.

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

### Sound scout (SHELVED by Rusty, 2026-10-09)
- Idea: a Sounds-tab mode that plays a test note on every program step, with Keep/Next/Back, remembered rejects per app and bank, optional auto-step, and category tags (bass, pad, lead) on favorites to filter the favorites list. Rusty prefers to scroll sounds while MidiBed is playing. Not planned. (Only favorites with names exist; category tags could be added later if the lists grow unwieldy.)

### Loop player (Rusty, 2026-10-13): four lanes of percussion loops, built into MidiBed
- Percussion only for now; his purchased loops mostly have the BPM in the file name. Constant tempo, one key, changing the flavour by bringing loops in and out (like a live-looping session). Wants them stretched to fit the tempo within reason, four lanes to start, a set to choose from per journey, the ability to swap a lane's loop, and room to grow (filters and effects later, maybe in another app).
- Plan: a 'Loop player' part (name it differently from the DrumJam 'Loops' part). Lane = file, bars, level, pan, Ugly FX send, on/off with bar-line quantised start and fade. Files come in through the Files app picker first (copied into the app's own storage), Dropbox later. Speed change first (varispeed), real time-stretch later; 'play at original speed' option. Scene-owned lane choices; joins the orchestrated stop. Loops are never committed to the (public) repo.
- Shares the import and playback plumbing with the ambient player (4f), which streams long files.
- Waiting on: a file search of his machine (OneDrive, D: and C: program folders) to see what he has.

### Keys that play along (Rusty, 2026-10-13: a FUTURE module, not now)
- A part that follows the key, the rhythm and the chords and plays along in time, with percussive keyboard sounds such as a Rhodes piano. Different from the pad (which stays pure sustain, no rhythm) and from MidiDancer (single notes, call and response): this one comps the chords rhythmically.
- Likely shape: a new MIDI part like MidiDancer (own channel, own Ugly FX, per-scene), reusing the Euclidean pattern engine (steps/hits/rotation, ghost notes, accents, looseness, evolving) for its comping rhythm, voicings from the harmony loop (voice-led, taking the pad's chord lists), optional built-in Rhodes-like voice (tine + tone bar, tremolo) so it works with no routing.
- Open questions for later: chord voicing style (shell voicings, rootless, spread), rhythm presets (offbeat stabs, anticipations, Charleston), whether it ducks around MidiDancer's phrases, and how it relates to the 'no rhythmic pad' rule (answer: it is its own part, the pad stays sustained).
- Keys notes (Rusty, 2026-10-13, from a live-looping artist he is listening to): the keys play STEADY, REPETITIVE rhythms, sometimes syncopated, and stay in the background (they add harmonic and rhythmic content without getting in the way of MidiDancer-type instruments). Besides the rhythm pattern they OCCASIONALLY play a short run or lick, and sometimes a SUSPENDED chord (sus2/sus4). So: a fixed repeating pattern as the base, a chance per N bars for a run (a few scale notes, ending on a chord tone) and a chance of a sus voicing in place of the triad. Keep the register narrow and quiet so it stays behind MidiDancer.
- Vocabulary note (2026-10-13): Rusty calls these parts 'modules'. Agreed in principle; the on-screen rename (Parts tab -> Modules, Part stepper -> Module) is deferred to a future session. Until then the screen still says Part.

### Loop player: what is on Rusty's machines (searched 2026-10-13, file names only)
- About 3,700 WAV/AIF/FLAC loops (final count; 2,900 at the first look) with the tempo in the folder or file name. Most are Drums On Demand packs (Nothing But Brushes 1.2 and 2.2, v11.24.1 and v11.24.2, Organic, Free Loops; 24-bit WAV, one folder per tempo, tempo like '068 BPM (Midwest Ballad)'), in OneDrive/DOD drum loops and D:/Downloads. Tempos run 59-200 BPM, thickest around 64-135.
- About 7,200 REX2 (.rx2) files (final count, some duplicated across folders) (LoopLoft Art of Brushes, Dry Drums, cinematic, blues, everything but sticks) in OneDrive/loops: NOT playable on iOS as they are; they need converting to WAV first (a REX tool; REAPER may be able to import them).
- The D: drive holds Native Instruments and Kontakt libraries (Battery 4 factory library, Hunter's Percussion World/Orchestral/Kitchen, Splash Epic Percussion): hundreds of thousands of one-shots, not loops. Possible later use: a sampled one-shot drum engine for MidiBed's drums.

### Multi-channel output (Rusty, 2026-10-15: FUTURE)
- Today (round 62): the built-in sound can be mono on both sides, or mono on the left or right only, for a two-channel set-up (one side to the PA, the other a monitor with VoiceOver on it).
- Later: a 4-channel audio interface with a STEREO mix on outputs 3/4 (and the monitor on 1/2). iOS apps normally get one stereo output; reaching channels 3/4 probably means routing through AUM (or a multi-channel route on the audio session, which needs testing with the interface). Questions for then: which interface, whether the phone exposes all four outputs to an app, and whether MidiBed should offer an 'output pair' choice or leave routing to AUM. Revisit when the interface exists.

### Loop pitch (Rusty, 2026-10-15)
- The loops fit the tempo by a plain speed change, so a tempo away from the file's own also moves the pitch. Rusty likes it ('they still sound cool, we might want the pitch change as a feature'). Keep this as the default 'pitch follows tempo' behaviour. A later choice per lane could add 'keep pitch' (real time-stretch) and/or a pitch offset in semitones (which needs the stretch so the loop still fills its bars).

### Loop stretching stays on the map (Rusty, 2026-10-15)
- BUILT 2026-10-16 (rounds 78-79): per-lane 'pitch follows the tempo' toggle plus a whole-semitone pitch shift (circular WSOLA copy made in memory in the background; natural pitch-follows-tempo stays the default). Still to come: live (no-copy) shifting if the wait annoys him, pre-stretching the lanes of other scenes so a scene's new loop never waits, a transient-preserving stretch if WSOLA smears a particular loop, a global default for the toggle.

### Bass that follows the kick (Rusty, 2026-10-15: ON THE MAP)
- A setting for the bass drone to play rhythmically, locked to the kick pattern. This RELAXES the 2026-10-07 rule 'no rhythmic elements in the harmonic instruments': it is opt-in and off by default, so a steady drone stays the default. The rhythmic keys module (above) is the other exception.
- Ideas to choose from when we build it: (1) PLAY ON THE KICK: a bass note on every kick hit, length until the next hit or a set fraction (tight, dance-style); (2) BETWEEN THE KICKS: the offbeat bass (the classic house/techno gap); (3) KICK ACCENTS: the held drone is re-struck or its level/filter jumps on each kick, the drone otherwise sustains (a softer 'pumping' feel); (4) DUCKING: no notes of its own, the bass just dips for a moment on each kick (sidechain feel), which also works for the pad. Follows the current scene's kick (the drum whose role is kick, including a library rhythm and evolving rotation), with a few options: note length, a swing/offset, how much of the pattern (every kick, every other kick, kick + ghosts), and which chord note it plays (root, root and fifth, the octave on alternate hits).
- Built-in bass voice and external synths both get it (it is just note on/off from the engine, like MidiDancer). Pairs naturally with 'bass follows chords'.

### Rework of all the letter commands (Rusty, 2026-10-16: LATER)
- The single-letter keyboard shortcuts have grown organically (1-4 scenes; N B J K; S F P U O X T W V G Y; D C R M L A for layers, capitals to solo) and are getting hard to remember and to keep apart (L is the old loops app, A the new Loop player, R is the bass because B is taken...). Rusty wants a planned rework of the whole set later. Nothing to do now. When we do it: list every key and every MIDI action together, group by meaning (scenes, layers, transport, filters, endings), pick letters that are memorable for a braille keyboard (Hable One), keep one scheme for key, pedal and MIDI actions, and keep the old keys working or migrate them in one go.

### Ugly Loop Player: a spin-off AUM module (Rusty, 2026-10-16)
- The Loop player is shaping up as a good stand-alone AUv3 for AUM ('Ugly Loop Player', in the spirit of Ugly FX): chill-out music leans on loops drenched in reverb, filtered, with momentary delay throws and similar effects. `LoopPlayer.swift` (lanes, bar-line start/restart, best-fit length, loudness matching) and `UglyFX.swift` are self-contained, so they can move into an extension. Needs: an AUv3 app extension target (paid Apple team: he has one), a signed build pipeline instead of the unsigned .ipa, a way to get the loop files into the extension (shared app group container), tempo/transport from AUM (host tempo and play position via AUHostMusicalContext/transport state) instead of MidiBed's clock, MIDI in for lane triggers (AUM routes MIDI to it), and audio out per lane or stereo.
- Effects wanted: big reverb, filter (the preset filters already built: low-pass, high-pass, band-pass), and MOMENTARY DELAY THROWS (hold a pedal button or a pad and the lane's send into the delay opens, release and the echoes ring out). The throw idea also fits MidiBed itself right now: a 'throw' action on the pedal HOLD gesture (Momentary mode) that raises a lane's or the whole mix's delay send while held; reverb throws and a 'filter sweep while held' are the same pattern.

### Free public-domain loop source (Rusty, 2026-10-16: just a NOTE for now)
Rusty found a large collection of free, public-domain loops. The download list is a PDF at https://ln5.sync.com/dl/278346d00/view/pdf/31976989462012?sync_id=0#hienvehh-kqt2wju3-gd9v9x3h-4d7i9bde (a Sync.com share; not opened by Claude). He has grabbed a few packs and will put them in the git-ignored `loops` folder; there is a lot and he does not yet know how much is useful. Nothing to build. When he brings packs in: survey length, tempo (from names), bars, loudness and loop tightness as was done for the shake loops, and check each pack's licence text himself or with Claude before any audio is shared or used in a release (never commit audio; the repo is public). Companion idea: tempo-matched copies of loops (ffmpeg, pitch kept) or real time-stretch in the Loop player; see 'Loop stretching stays on the map'.

### Keys: built v1 (2026-10-16), still to come
- Built: pattern library + generator, Rhodes-style built-in voice, sus 4 chance, ghost notes/accents/looseness, own channel/port/outputs/FX/mixer/layer. Not yet: the occasional run or lick, a voice editor (tone, tremolo depth, release), keys in the starter journeys, ducking around MidiDancer, filter presets for the keys.

### Playlists / flows of journeys (Rusty, 2026-10-19: ON THE MAP)
- Only 12 journeys can be stored today (`MAX_JOURNEYS`). Rusty wants COLLECTIONS of journeys (playlists, flows) as a way to organise and use a bigger library: for example a yoga session set built from journeys at 60-80 BPM, a gig set, a practice set.
- Ideas to settle when we build it: (1) a PLAYLIST = a named, ordered list of journeys (references, not copies, so editing a journey changes it everywhere); (2) many more journeys can be stored (the 12 limit is about the list on screen, not storage; raise it and group them by playlist, with an 'All journeys' list); (3) selecting by tempo: a playlist can be made by rule, 'every journey between 60 and 80 BPM' (and maybe by key or mode), as well as by hand; (4) moving through a playlist in order or at random, with the journey change landing on a bar line like a journey switch, and with the existing 'when scene changes land' and ending rules; (5) optional auto-advance from journey to journey after N bars (the 'songs' idea, now across journeys); (6) export/import of journeys and playlists as files (also for backup and sharing); (7) a pedal/keyboard action 'next in the playlist'. Open questions for Rusty: playlists by hand, by rule, or both; whether playing through should loop; whether a playlist can hold a journey twice.

### Facelift and going public (Rusty, 2026-10-23: ON THE MAP)
- Rusty pays for the Apple developer year anyway and would like MidiBed to earn some of it back. Today the screen is plain by design (VoiceOver-first: long scrolling lists of steppers and switches). For sighted users and for a store page it needs a nicer face, WITHOUT losing anything a VoiceOver user has. Rusty also said to use modern libraries.
- Look and feel (nothing fancy): one set of colour, spacing and type-size tokens used everywhere; cards instead of bare lists; icons for the parts; big clear scene buttons; a Live screen that SHOWS the music: bar and beat position, scene and journey length (the journey-length arithmetic exists), a level meter per part, the current chord, the drum patterns drawn as circles (the Euclidean rings), the breathing state. Every picture is decoration or carries a proper accessibility label; the VoiceOver route must stay as it is (fixed labels, adjustable steppers, the same order). A larger layout for iPad (the app already says it supports tablets).
- Libraries to consider (each must be proven to BUILD on the CI runner first, because there is no Mac to try them on, and checked against Expo SDK 57 / React Native 0.86): react-native-reanimated (smooth animation; may already come with Expo), @shopify/react-native-skia (drawing the rings, meters and waves), expo-linear-gradient, expo-haptics, an icon set (@expo/vector-icons), expo-font with one good typeface. Add one at a time, run the build, check VoiceOver still reads the screen the same.
- Before a public release (the non-visual list): a real name (check the App Store and trademarks; MidiBed is a placeholder; the bundle id com.rustyperez.midibed stays), an app icon, a first-run welcome that adds a starter journey and says what to press, a short help/manual page, a privacy policy and support address, screenshots, an App Privacy and accessibility description. Third-party app names inside the app (DrumJam, Synth One and so on) need care in a store listing. Never ship purchased or downloaded audio; the app already ships none.
- How to distribute (general knowledge, check Apple's current terms): Ad Hoc is for Rusty's own registered phones only (limited number of devices). Public routes are TestFlight (a free beta for musicians, up to a large number of testers, builds expire after a while, the first build of each version gets a short review) and then the App Store (the paid developer membership already covers it; Apple takes a commission, lower under the Small Business Program; needs the paid-apps agreement, tax and bank details). Price ideas: a low one-time price, or free with one unlock. Honest expectation: a small, loyal niche (blind and low-vision musicians, ambient and folktronica players, people who want a generative MIDI bed), not a mass market; its VoiceOver-first design is the thing no other app has.
- Suggested order: (1) a real name and the first-run welcome, (2) the Live screen facelift and tokens, (3) a TestFlight beta with a few musicians, (4) pricing and the store page.

### Name check for "MidiBed" (2026-10-23, web search only, NOT a legal clearance)
- No app, App Store listing or trademark called "MidiBed" turned up. Near names: MidiBud (Maulabs, an iOS MIDI transport controller, one letter away and in the same category, so people could confuse them), and MUSICBED (The Music Bed, LLC, a live US trademark for music software/services, sounds close). "MIDI bed" is also an ordinary phrase (and children's furniture). A proper check means the US trademark database (USPTO), the App Store search, and ideally a short professional opinion before spending on icons and a store page. Cheap fix if worried: pick a more distinctive name; the bundle id com.rustyperez.midibed can stay.

### Style journeys: make a journey in a musical style (Rusty, 2026-10-23: FUTURE)
- A 'Make me a journey' tool: choose a STYLE and get a ready journey (key, tempo, scenes, chord progressions, rhythmic grooves, bass behaviour, keys pattern, breathing, filters, effects), different every time (seeded). Styles as DATA recipes, so new ones are easy to add: for example Ambient (drones, no drums, slow pad movement), Ambient grooves, Folktronica (acoustic-feeling hand percussion, modal chords), Chill EDM, Downtempo, Lo-fi/chillhop, Dub chill, Trip-hop, Organic house, Meditation/yoga (60-80 BPM). Rusty does not know all the style names, so each recipe carries a one-line plain description (tempo range, feel, what it sounds like) shown in the chooser.
- Builds on `src/starters.ts` (scene builders), the rhythm library, bass rhythm, keys patterns and the progression presets; the new part is the recipe layer plus a chooser (style, key/mode or 'surprise me', length, how busy).

### Load journeys from a file (Rusty, 2026-10-23: FUTURE)
- Rusty will ask Claude to create journeys, and rebuilding the app for each batch is slow. Add 'Import journeys from a file': a journey pack is a small text file (a version marker plus one or more journeys), picked from the Files app (the same picker as 'Restore settings'), run through the migration so older packs get today's defaults, and added after his own journeys (renaming duplicates, respecting the limit; raising the 12-journey limit pairs with Playlists). 'Export this journey' shares the same format. Optional later: fetch packs from a web address (for example a file in the bucket repo) so new journeys arrive without Files. Dropbox/Files is the simplest route first.

### Drum grooves: whole-kit style patterns (Rusty, 2026-10-23: IDEA, wandering)
- A 'Groove' chooser on Parts > Drums (and usable by the style journeys): pick a named groove (for example Downtempo, Trip-hop, Boom bap, Lo-fi, Chill house, Dub, Reggae one-drop, Bossa, Afro-Cuban, Folk, Half-time ambient, Light funk) and press apply: it sets the PATTERNS of the kit's drums for the scene (which drums are on, each drum's library rhythm or step mask, rotation, velocity, ghost notes, accents) and may set the swing. It keeps each slot's built-in sound, note and channel. The Euclidean generator and the per-drum 'Drum rhythm' library stay exactly as they are: editing hits or steps on a drum still goes back to Euclidean for that drum. Undo through the same remember/restore as 'Silence all drum patterns'.
- Needs: a grooves table (data), a few more single-drum library rhythms appended to src/rhythms.ts (for example boom-bap kick, trip-hop snare on 3, one-drop kick on 3, dub steppers, bossa hat), an apply function in src/config.ts, tests, and a short plain description for each groove. Style journeys then pick a groove per scene (drone scene: none or very sparse; groove scenes: the style's groove; home: a fuller variation).

### Sounds for the grooves (Rusty, 2026-10-23: IDEAS, order to be agreed)
- (a) ONE-SHOT SAMPLES AS A DRUM SOUND: a new built-in sound type 'My sample' for any drum slot, playing a short audio file Rusty imported (seed shaker, ocean drum, rain stick, kit hits from his collections), with tune, decay, level and velocity response, so grooves and fills can use real recorded one-shots. Import like the loops (a 'oneshots' folder in the app's Documents, flattened FLAC/WAV, library with a name list). Same file also feeds the transition/fill sample ideas (4b, 4c) and the ambience player (4). His Native Instruments (Battery/Kontakt) libraries are proprietary formats and cannot be read directly: render the wanted hits to WAV first. Licence: samples stay import-your-own (never bundled in a released app).
- (b) GRAIN FOR THE NOISE SOUNDS: a 'grain' amount on the noise transitions (Wave, Wind, Thunder, Boom, Crash and the recurring sound): the noise is gated by random micro-bursts so it sounds like rain, dust or crackle instead of smooth hiss; choices of grain size and density; the same generator can make a steady generative RAIN layer (never repeats, no files).
- (c) MORE SYNTHESISED DRUM SOUNDS in the drum synth, designed and level-checked offline first: a dusty/filtered kit (low-passed, bit-reduced kick, snare and hat), a deep sub kick, brush swish, finger snap, side stick, soft clap, vinyl crackle tick, udu/clay pot, rain stick, ocean drum swell, and a few interesting synth blips and FM bells. Possibly a 'dust' control on the drum bus (bit/sample-rate reduction plus tape wobble) for the lo-fi grooves.
- (d) Groove list holes: psybient/chill breakbeat, Balearic/sunset, a 3-beat lullaby groove (needs a waltz feel), and a very soft 'rain' deep-rest groove (loops already cover it today: the Loop player plays a rain loop in a lane under the Ambient pulse groove).

### Sound packs and pack grooves (Rusty, 2026-10-23: IDEA, to design with him)
- A PACK is a folder of Rusty's own recorded sounds, already sorted into groups by a pack-maker tool (the Python scripts now in the scratchpad: analyse, chop, classify, make loops). First pack: the seed shells (`sample processing\shell kit`): solid hits, medium bunches, soft bunches, light ticks, scattered clicks, pairs (two beats) plus their eighth-note loops, sparse/medium/dense swells and beds. Each file keeps its original loudness class (loud/medium/soft) in its name.
- PACK SOUND (the 'My sample' idea, reshaped): a drum slot's built-in sound type 'Sample pack' with a pack and a GROUP chosen; each hit picks a sample from that group at random (never the same twice running), loud hits favour louder samples, with tune, decay, level and a little random pitch. The varied picking is the point: a shaker part never repeats exactly. Plays through the built-in sound only (like the other drum sounds); another app still just gets note + channel.
- PACK GROOVES: 'Make a groove from this pack': rules give each group a job (solid hits = anchor on 1 and 3 or a syncopated pattern; pairs or medium bunches = backbeat or half-time; light ticks = off-beat grace notes with a chance; soft bunches = quiet steady sixteenths; sparse swells = a rare off-beat; beds and loops = Loop player lanes). A style choice (sparse, steady, dancey) and a 'roll again' button (seeded) make new ones; good ones can be saved and then used by the style journeys like any groove.
- Engine work: a sample voice pool in the built-in synth (short buffers in memory, pitch by resampling, started on the exact sample like the other drum voices), a pack library on the phone (import like the loops, into Documents/packs), a manifest per pack built from the folder names.
- Pack maker for new instruments: a double-click tool on the PC that takes long recordings and produces a sorted pack folder (declip, chop, drop the quiet/noisy ones, keep tails, classify, find rolls and pair loops), using what was learned on the shells, drums, ocean drum and rain stick. Pitched instruments (kalimba, bells) could later be sorted by note.
- Rights: Rusty's own recordings are his to use; packs can stay import-your-own, or later be offered as add-ons he sells himself.

### Pack swells as transition sounds (Rusty, 2026-10-23: WANTED)
- The transition sounds (scene entrance, drums break, drums return, the recurring sound, the ending) could play a recorded swell from a sample pack instead of the noise generator: a per-sound choice 'Noise generator / Sample pack' with a pack and group (for example Sparse swells or the pulsing textures).
- How it fits the engine: the scheduling already works in 'pre' (before the bar line) and 'post' (after) seconds. For a sample, `pre` is where its loudest moment sits, found by the loader (smoothed loudness peak), and `post` the rest of it; the engine starts it `pre` before the bar line so the peak lands on the bar line. A sample whose peak is early plays ON the bar like a Boom or Crash. Late triggers join part-way (start inside the sample) by the same rule as the noise lead-ins. Needs: per-sample peak position and length from the loader, a sample-transition voice in the synth that starts at a given time and offset, a choice of sample picked at schedule time (random, not twice running), and the source choice in the Scene tab sound settings. Length cannot be set in beats (a recording has its own length), so the existing 'beats' control is replaced by the sample's own length.

### REMIND RUSTY (said 2026-10-23: 'remind me later')
- The 'Make a groove from this pack' generator (strong beats from solid hits, ticks in between, swells rare; roles read from group names; style + roll again; saved as a groove).
