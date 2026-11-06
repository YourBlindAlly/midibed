# Loop timing table

`timingtable.py` measures where the hits of every loop in the local flattened loop folders fall against a sixteenth-note grid at the loop's own tempo (from its name) and writes `src/looptiming.ts`: the milliseconds to move each loop so its hits land on the beat (positive = later). Only loops whose hits are consistent (spread 30 ms or less) and whose typical offset is 8 ms or more get an entry.

Run with the Python 3.12 install (needs numpy) and ffmpeg on the path:

    python timingtable.py out.ts

The app now also measures every loop itself when it is added (`LoopPlayer.probe` finds the hit times, `src/timing.ts` applies the same rule), so this table is only the fallback for loops that have not been measured yet. The loops folders are git-ignored; nothing here contains audio.
