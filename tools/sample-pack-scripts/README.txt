Scripts used on 2026-10-23 to turn Rusty's long recordings (shells, drums, ocean drum, rain stick) into sorted one-shots
and loops. They are the starting point for the pack-maker tool in ROADMAP.md ("Sound packs and pack grooves").
No audio is stored here. Paths inside the scripts point at "..\sample processing" and at ffmpeg in the WinGet folder;
run them with the Python312 interpreter.
  sample_analyze.py   look at each recording: noise floor, how many sounds, how long, how bright
  sample_chop.py     helpers: decode, declip (rebuilds flat-topped peaks), write FLAC, fades (the first cut)
  sample_chop2.py    the second cut: natural loudness (boost limited to 18 dB), drops sounds near the noise, long fading tails
  rhythm_hunt.py     finds stretches of evenly spaced hits
  make_loops2.py     rolls and the pattern cell as seamless loops (cuts at quiet zero crossings)
  shell_features.py  click counting, bursts
  shell_classify.py  solid / medium / soft / light / scattered / pairs; swells and beds sparse or dense
  shell_kit.py       copies the sorted files into "shell kit" and makes eighth-note loops from the pairs
  seam_check.py      measures the ends of loops (clicks)
