# Groove tools (for working on grooves with Rusty in Reaper)

- `dump-library.js` writes `library.json` (the app's built-in rhythms and grooves). Run `node tools/groove-tools/dump-library.js` from the project folder after the built-in grooves change.
- `groove_midi.py` renders a groove as a .mid file (one track per drum, channel 10, the app's drum notes, swing applied, one random take like the app plays it, or `--exact`). `--thin N` is the app's "Extra drums in a groove" setting. `--file` adds the grooves and rhythms from a MidiBed grooves file.
- `midi_to_groove.py` reads a drum pattern edited in Reaper (exported .mid) and writes a MidiBed grooves file (custom rhythms plus a groove) to load in Setup > Grooves and journeys from a file.

Use the Python312 interpreter (it has mido). Round trip checked: Organic world rendered exactly, read back, and every drum's pattern matched.
