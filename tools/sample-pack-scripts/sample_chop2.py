"""Second cut: keeps each hit's natural loudness (no boosting of quiet hits beyond 18 dB), drops hits too close to the room
noise, leaves much longer tails with a smooth fade, and never lets a tail run into the next hit."""
import os, glob, shutil
import numpy as np
from sample_chop import decode, declip, write_flac, fade, NAMES, SRC, OUT, SR

HOP = 480  # 10 ms
MAX_BOOST_DB = 18.0
MIN_SNR_DB = 30.0  # a hit must peak at least this far above the room noise to be kept


def frames_db(mono):
    n = len(mono) // HOP
    fr = mono[: n * HOP].reshape(n, HOP)
    return 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-12)


def find_events(db):
    floor = np.percentile(db, 10)
    above = db > floor + 12
    n = len(db)
    ev = []
    i = 0
    while i < n:
        if above[i]:
            j = i
            gap = 0
            k = i
            while k < n and gap < 15:
                if above[k]:
                    j = k
                    gap = 0
                else:
                    gap += 1
                k += 1
            ev.append([i, j + 1])
            i = j + 1
        else:
            i += 1
    return ev, floor


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)
    summary = []
    for path in sorted(glob.glob(os.path.join(SRC, "*.flac"))):
        base = os.path.basename(path)
        label, kind = NAMES[base[:2]]
        x, ch = decode(path)
        x, nruns, top = declip(x, ch)
        mono = x.mean(axis=1) if ch == 2 else x
        db = frames_db(mono)
        ev, floor = find_events(db)
        outdir = os.path.join(OUT, label)
        os.makedirs(outdir, exist_ok=True)
        counts = {}
        dropped = {"too quiet or too short": 0}
        for idx, (fa, fb) in enumerate(ev):
            a, b = fa * HOP, fb * HOP
            dur = (b - a) / SR
            pk = float(np.abs(mono[a:b]).max())
            pk_db = 20 * np.log10(pk + 1e-12)
            # the ocean drum and rain stick are noise-like by nature, so a looser gate for them
            gate = MIN_SNR_DB if kind in ('drum', 'shells') else 14.0
            if dur < 0.04 or pk_db < floor + gate:
                dropped["too quiet or too short"] += 1
                continue
            cat = "hit" if dur < 0.5 else "stroke" if dur < 2.0 else "swell" if dur < 6.0 else "bed"
            short = cat in ("hit", "stroke")
            # follow the decay down towards the room noise (not just to 12 dB above it), up to 1.5 s more
            k = fb
            while k < len(db) and k - fb < 150 and db[k] > floor + 5:
                k += 1
            end_frame = k
            tail = int((0.2 if short else 0.4) * SR)
            s = max(0, a - int(0.006 * SR))
            e = min(len(mono), end_frame * HOP + tail)
            # a tail must not run into the next sound
            if idx + 1 < len(ev):
                e = min(e, ev[idx + 1][0] * HOP - int(0.012 * SR))
            if cat == "bed" and (e - s) > 20 * SR:
                e = s + 20 * SR
            if e - s < int(0.03 * SR):
                continue
            seg = x[s:e]
            peak_dbfs = 20 * np.log10(float(np.abs(seg).max()) + 1e-12)
            boost = min(-3.0 - peak_dbfs, MAX_BOOST_DB)
            seg = seg * (10 ** (boost / 20))
            length = len(seg) / SR
            # a smooth fade out over the last part: up to 0.25 s for hits and strokes, 0.5 s otherwise
            fade_len = int(min(0.25 if short else 0.5, length * 0.5) * SR)
            seg = fade(seg, int(0.003 * SR), fade_len)
            level = "loud" if pk_db > -12 else "medium" if pk_db > -26 else "soft"
            counts[cat] = counts.get(cat, 0) + 1
            tsec = a / SR
            name = f"{label} {cat} {counts[cat]:03d} {level} {length:.1f}s at {int(tsec//60)}m{int(tsec%60):02d}s.flac"
            write_flac(os.path.join(outdir, name), seg, ch)
        summary.append((label, len(ev), counts, dropped["too quiet or too short"], floor))
    print("Written to", OUT)
    for label, n, counts, d, floor in summary:
        print(f"  {label}: {n} sounds found, {d} left out (too quiet or too short), kept {counts}")


if __name__ == "__main__":
    main()
