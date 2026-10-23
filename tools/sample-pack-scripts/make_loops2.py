"""Loop candidates, second version.
- Each loop is cut at the quietest zero crossing in the gap just BEFORE a hit's attack (the first version cut inside the
  next hit's attack, which is the click at the end).
- Loudness: no boost beyond 18 dB, and loops whose hits are too close to the room noise are left out.
- The pattern cell is a single pass."""
import subprocess, os, glob, shutil
import numpy as np

FF = r"C:\Users\rusty\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
SRC = r"C:\Users\rusty\OneDrive\Documents\claude code folder\sample processing"
OUT = os.path.join(SRC, "loop candidates v2")
SR = 44100
LABELS = {"03": "Small remo drum", "04": "Bucket lid drum", "05": "Buffalo drum"}
MIN_SNR = 30.0
MAX_BOOST = 18.0


def decode(path):
    p = subprocess.run([FF, "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32)


def write_flac(path, x):
    raw = np.ascontiguousarray(x.astype(np.float32)).tobytes()
    subprocess.run([FF, "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-af", "aresample=dither_method=triangular", "-sample_fmt", "s16", "-compression_level", "8", path], input=raw, check=True)


def env_db(x, hop=441):
    n = len(x) // hop
    fr = x[: n * hop].reshape(n, hop)
    return 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)


def onsets(x, hop=441, thr=9.0, sep=0.08):
    e = env_db(x, hop)
    floor = np.percentile(e, 10)
    out = []
    last = -1000
    for i in range(1, len(e)):
        if e[i] - e[i - 1] > thr and e[i] > floor + 15 and (i - last) * hop / SR > sep:
            out.append(i * hop / SR)
            last = i
    return np.array(out), floor


def quiet_cut(x, t):
    """The sample index of the quietest zero crossing in the 50 ms before a hit at time t (seconds)."""
    a = max(0, int((t - 0.05) * SR))
    b = min(len(x) - 1, int((t - 0.004) * SR))
    w = int(0.002 * SR)
    best = None
    for i in range(a + w, b - w):
        if x[i] <= 0 < x[i + 1] or x[i] >= 0 > x[i + 1]:
            e = float(np.sqrt((x[i - w:i + w] ** 2).mean()))
            if best is None or e < best[0]:
                best = (e, i + 1)
    return best[1] if best else int(((a + b) // 2))


def runs_of(on, W=8):
    ioi = np.diff(on)
    out = []
    i = 0
    while i + W < len(on):
        w = ioi[i:i + W - 1]
        m = np.median(w)
        if np.all(np.abs(w - m) < 0.18 * m) and 0.2 < m < 2.0:
            j = i + W - 1
            while j < len(ioi) and abs(ioi[j] - m) < 0.18 * m:
                j += 1
            out.append((i, min(j, len(on) - 1)))
            i = j + 1
        else:
            i += 1
    return out


def finish(seg, floor_db):
    pk_db = 20 * np.log10(float(np.abs(seg).max()) + 1e-9)
    snr = pk_db - floor_db
    boost = min(-3.0 - pk_db, MAX_BOOST)
    seg = seg * (10 ** (boost / 20))
    # The cuts are at zero crossings in the quiet gap before a hit. The ring of the last hit is still faintly sounding at
    # the end, so it is faded out over 12 ms (inside that gap) instead of being stopped, and the start eases in over 4 ms.
    fi = int(0.004 * SR)
    fo = int(0.012 * SR)
    seg[:fi] *= np.sin(np.linspace(0, np.pi / 2, fi)) ** 2
    seg[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
    return seg, snr, boost


if os.path.isdir(OUT):
    shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(OUT, exist_ok=True)
made = []
skipped = []
for path in sorted(glob.glob(os.path.join(SRC, "0[345]-*.flac"))):
    label = LABELS[os.path.basename(path)[:2]]
    x = decode(path)
    on, floor = onsets(x)
    n = 0
    for (i0, i1) in runs_of(on):
        count = i1 - i0 + 1
        for hits in (16, 8):
            if count > hits:
                t0, t1 = on[i0], on[i0 + hits]
                c0, c1 = quiet_cut(x, t0), quiet_cut(x, t1)
                seg = x[c0:c1].copy()
                T = len(seg) / SR
                bpm = 60.0 * (hits / 2.0) / T
                seg, snr, boost = finish(seg, floor)
                tsec = t0
                if snr < MIN_SNR:
                    skipped.append(f"{label} run at {int(tsec//60)}m{int(tsec%60):02d}s: only {snr:.0f} dB above the room noise")
                    break
                n += 1
                bars = hits // 8
                name = f"{label} roll {n:02d} {hits} hits {bars} bar{'s' if bars > 1 else ''} {round(bpm)}bpm from {int(tsec//60)}m{int(tsec%60):02d}s.flac"
                write_flac(os.path.join(OUT, name), seg)
                made.append((name, snr, boost, abs(float(x[c1 - 1])), abs(float(x[c0]))))
                break

# the pattern cell from the bucket lid: find the sequence of ten hits whose gaps match the cell Rusty marked (found
# earlier: 0.77, 0.48, 0.36, 0.81, 0.51, 0.34, 0.49, 0.36, 0.88 seconds apart), then cut one pass between the quiet gaps
# before its first and last hit
src_lid = decode(glob.glob(os.path.join(SRC, "04-*.flac"))[0])
lid_on, lid_floor = onsets(src_lid)
# the cell is the stretch of the lid recording from the hit at about 119.33 s to the hit about 5.01 s later (the same
# stretch whose hit times were measured on the earlier cut: 0, 0.77, 1.25, 1.62, 2.43, 2.93, 3.27, 3.77, 4.13, 5.02)
near = lambda tt: min(lid_on, key=lambda o: abs(o - tt))
f0 = near(119.33)
f1 = near(f0 + 5.01)
best = (0.0, 0) if abs(f0 - 119.33) < 0.1 and abs(f1 - (f0 + 5.01)) < 0.1 else None
if best and best[0] < 0.08:
    t_first, t_last = f0, f1
    print(f"pattern found at {t_first:.3f}s in the recording ")
    c0, c1 = quiet_cut(src_lid, t_first), quiet_cut(src_lid, t_last)
    seg = src_lid[c0:c1].copy()
    T = len(seg) / SR
    seg, snr, boost = finish(seg, lid_floor)
    name = "Bucket lid pattern loop 1 bar 48bpm (also 2 bars at 96bpm).flac"
    write_flac(os.path.join(OUT, name), seg)
    made.append((name, snr, boost, 0.0, 0.0))
    print(f"pattern cell: {T:.3f}s long = 4 beats at {60*4/T:.1f} bpm, or 2 bars at {60*8/T:.1f} bpm")
else:
    print("could not find the pattern in the recording")

print(f"\nMade {len(made)} loops in {OUT}")
for name, snr, boost, e1, e0 in made:
    print(f"  {name}   (hits {snr:.0f} dB above the room noise, boosted {boost:+.0f} dB)")
if skipped:
    print("\nLeft out:")
    for s in skipped:
        print("  ", s)
