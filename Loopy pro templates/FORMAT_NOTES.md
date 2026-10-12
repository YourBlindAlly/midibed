# Loopy Pro project format - findings (2026-10-12)

Found by unpacking COPIES of the templates Rusty downloaded (originals untouched; extracted copies went to the
session scratchpad). Nothing here has been loaded into Loopy Pro yet.

## Package layout (`*.lpproj`, delivered zipped from Patchstorage)
- `Info.plist` (Build, Date, Version), `Resources.plist` (list of `*.moduleState` files in `Resources/`),
  `Thumbnail.jpg`.
- `Project.sqlite`: SQLite with two tables, `meta(name, value)` and `objects(id INTEGER, type TEXT, contents BLOB)`.
  `contents` is plain JSON. Object types seen: Project, Scene, Group, Track, TrackPlaybackSequenceTrack, Clock,
  MasterOutputChannel, HardwareAudioSource, Effect, Sequence, ButtonWidget, ButtonGridWidget, TutorialWidget.
  Objects refer to each other as `{"_type":"Track","_value":8}`. The ids (e.g. 8, 55, 59) are what bindings
  call `Subject` (`#8`).
- `Control Profile.lpcontrolprofile/Internal.Internal.controllerprofile` and
  `Control Profiles/<Name>.lpcontrolprofile/<deviceId>.MIDI.<device name>.controllerprofile`: XML property
  lists holding the bindings. Shape:
  `{Type: 'MIDI'|'Internal', Device, Device Name, Bindings: [{Trigger, Actions: [{Identifier, Subject, Parameters, Timing}]}]}`.
- `Save Points/` hold older copies (the RC-30 style one has many). SL4's `.lpproj` is itself a zip containing
  `Project.sqlite`.
- The Serial Looper template zip downloaded as 0 bytes (needs downloading again).

## Triggers seen
- MIDI CC: `b0147f` = status 0xB0 (CC, channel 1), controller 0x14 (20), value 0x7f (127).
- `d:b014` looks like a double tap of that controller; other prefixes (`15..`, `42..`, `H:`) not decoded yet.
- Internal (on-screen) widgets: `55:Press` = press widget id 55.
- NO typing-keyboard binding appears in these templates, so its encoding is unknown. One sample is needed: a
  project exported after binding a key by MIDI Learn on the phone.

## Actions seen (Identifier)
Track Record/Stop, Track Play/Stop, Track Select, Clear Track, Peel Track, Reverse Track, Trigger Widget,
Switch Control Profile, Set Play Group Mode, Assign Clip Settings, Set Master Length, Clock Pause, Clock Reset,
Tap Tempo, Toggle Metronome, Toggle Session Recording, Toggle Mixer, Send MIDI, Adjust Effect Parameter,
Enable/Disable Effect, Audio Source Mute.

## Padded template design (useful for a pedal or a few keys)
Three control profiles (Always, Record, Play). A play/record radio widget switches which profile is active, so
the same four triggers mean play/stop in Play mode and record/overdub in Record mode. All clips are phase-locked
to the length of the first clip. Clear All needs a long press. The tutorial text is stored in TutorialWidget objects.

## Trigger grammar (decoded from Serial Looper, Padded, Stan Loops, RC-30 style)
MIDI triggers are hex strings, status byte first:
- `b0147f` = Control Change (0xB0, channel 1), controller 0x14 = 20, value 0x7f = 127 (a press); `b01400` = value 0 (release).
- `d:b014` double tap, `h:b014` hold, `H:b014` long hold (gesture prefixes on the same controller).
- `c001`, `c43f` = Program Change (0xC0 = channel 1; 0xC4 = channel 5) with the program number: used by the
  FootCtrl/Mvave pedals in Stan Loops.
- Internal (on-screen) widgets: `<id>:Press`, `:Long Press`, `:Double-Tap`, `:Swipe`, `:Value`, `:Hold`,
  `:Select#<n>`, plus project events `Load Project`, `Clock Start`, `Clock Stop`, `AllTracks:Play`,
  `AllTracks:Begin Initial Record` and `AllTracks:Finish Initial Record`.
- Typing-keyboard triggers: STILL UNKNOWN (no template contains one).

## Serial Looper Unquantized (espiegel123, Aug 11 2026): the best base for a screen-free looper
- Three loops, A/B/C, plus D for peel (tap) and replace (hold). Completely unquantized, free loop lengths; tempo can
  be ignored. Record-play-overdub (RPO) or record-overdub-play (ROP). Retro record. Reverse. Clear all by holding two
  controls. Fade out and stop. Auto audio-threshold recording start.
- Play Mode / Record Mode: a stepped dial (#66) switches control profile. Record Mode: press = record if stopped, or
  overdub if playing; double tap = toggle playback. Play Mode: press = play/stop; double tap = overdub.
- DESIGNED FOR A PEDALBOARD: buttons A, B, C, D (widget ids 1663, 1664, 1665, 1666) are bound ONLY in the profile
  `Pedalboard.lpcontrolprofile` (device SINCO) as `b014`..`b017` -> Trigger Widget (Hold). Those buttons send MIDI
  to an internal group (`Group#1670`, 'Midi Commands') which the Play Mode / Record Mode profiles act on. So putting
  a different controller (a typing keyboard) on the project needs only FOUR bindings (A, B, C, D) plus optional keys
  for: Play/Record mode dial (#66), Clear (#347 long press), Retro record (#904), INIT (#550).
- No metronome in this one; RC-30 style has `Toggle Metronome` and `Tap Tempo`.

## Files checked (2026-10-12), none contains a typing-keyboard binding
Padded, SL4 IP5 slim, RC-30 style, Serial Looper Unquantized, Stan Loops SOLO V22, Verse-Chorus Looper Unquantized,
Zoom UAC Guitars vocals. Device types in all of them are only `MIDI` (iRig BlueBoard, SINCO, FootCtrl, Quad Cortex,
AIRSTEP, ...) and `Internal`. Plan: when a file with a key binding arrives, decode its device Type/Trigger, then add
key triggers beside the pedal's MIDI triggers on the same widgets (a 4-button MIDI pedal AND the Hable keys).

## Typing-keyboard bindings DECODED (from KeyboardLoopy, 2026-10-12)
- A keyboard controller is a profile file of `Type: Keyboard`, `Device: Keyboard`, `Device Name: Keyboard`, stored as
  `Control Profiles/<ProfileName>.lpcontrolprofile/Keyboard.Keyboard.controllerprofile`.
- A binding's `Trigger` is the plain key name: `a`, `1`, `Spacebar`, `Equal Sign`, `Hyphen`. Actions are the same as
  for MIDI: e.g. `Trigger Widget` with `Widget Action: Press`, or `Track Record/Stop` directly on a `Subject: #<track id>`.
- A profile is switched on by its NAME in the Project object's `activeControlProfileNames` (a Set) inside
  Project.sqlite. Serial Looper has Pedalboard, Record Mode, Always On, Clear All Multi-Switch; Play Mode / Record Mode
  are swapped by the Mode dial.
- A `.lpproj` file is a zip whose root holds Project.sqlite, Info.plist, Resources.plist, Thumbnail.jpg and the control
  profile folders. (Patchstorage wraps it in another zip.)
- Other things KeyboardLoopy shows: `Toggle Metronome` (key 0), `Set Tempo` +/-10, `Undo`, `Track Select`,
  `Clear Track` on `Selected Track`, `Track Play/Stop` on `All Tracks`.

## Built variant (tools/build_keyboard_variant.py -> built/Serial Looper Keyboard.lpproj)
Serial Looper Unquantized unchanged, plus a Keyboard profile: A S D record/overdub loops A B C, Q W E play/stop,
F peel, G replace, R retro record, V reverse, X clear all, O fade out, M pedal mode, I init. Only the Project object's
activeControlProfileNames differs from the original (verified by diffing every object). UNTESTED inside Loopy Pro.
