import subprocess, os, glob, re, sys
import numpy as np
from scipy.interpolate import CubicSpline

FF = r"C:\Users\rusty\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
SRC = r"C:\Users\rusty\OneDrive\Documents\claude code folder\sample processing"
OUT = os.path.join(SRC, "chopped")
SR = 48000
OUT_SR = 44100

NAMES = {
    "02": ("Shells", "shells"),
    "03": ("Small remo drum", "drum"),
    "04": ("Bucket lid drum", "drum"),
    "05": ("Buffalo drum", "drum"),
    "06": ("Ocean drum", "ocean"),
    "07": ("Rain stick", "rain"),
    "08": ("Ocean drum stereo", "ocean"),
}


def decode(path):
    r = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True, text=True)
    ch = 2 if "stereo" in r.stderr else 1
    p = subprocess.run([FF, "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le", "-"], capture_output=True)
    x = np.frombuffer(p.stdout, dtype=np.float32)
    if ch == 2:
        x = x.reshape(-1, 2)
    return x, ch


def declip(x, ch):
    """Rebuild flat-topped (clipped) peaks: fit a smooth cubic curve through the good samples either side of each
    run of samples at full scale and replace the run with it. Returns the repaired audio, the number of runs, and the
    highest rebuilt peak (above 1.0 means the rebuilt wave goes past full scale; it is brought down when chopped)."""
    y = x.copy().astype(np.float32)
    chans = [y] if ch == 1 else [y[:, 0], y[:, 1]]
    runs_total = 0
    top = 0.0
    for c in chans:
        hit = np.abs(c) >= 0.999
        idx = np.flatnonzero(hit)
        if len(idx) == 0:
            continue
        runs = []
        s = prev = idx[0]
        for i in idx[1:]:
            if i != prev + 1:
                runs.append((s, prev))
                s = i
            prev = i
        runs.append((s, prev))
        for a, b in runs:
            lo = max(0, a - 12)
            hi = min(len(c), b + 13)
            pts = [i for i in range(lo, hi) if not (a <= i <= b) and abs(c[i]) < 0.999]
            if len(pts) < 6:
                continue
            cs = CubicSpline(pts, c[pts])
            fill = cs(np.arange(a, b + 1))
            sign = 1.0 if c[a] > 0 else -1.0
            # a clipped peak can only have been LOUDER than full scale, never quieter, and not wildly louder (capped at 1.8 times full scale)
            fill = sign * np.clip(sign * fill, 0.999, 1.8)
            c[a:b + 1] = fill
            top = max(top, float(np.abs(fill).max()))
            runs_total += 1
    return y, runs_total, top


def write_flac(path, x, ch):
    raw = np.ascontiguousarray(x.astype(np.float32)).tobytes()
    cmd = [FF, "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
           "-af", f"aresample={OUT_SR}:dither_method=triangular", "-sample_fmt", "s16", "-compression_level", "8", path]
    subprocess.run(cmd, input=raw, check=True)


def fade(x, fin, fout):
    n = len(x)
    fin = min(fin, n // 2)
    fout = min(fout, n // 2)
    y = x.copy()
    ramp_in = np.linspace(0, 1, fin) ** 1.0 if fin else None
    ramp_out = np.cos(np.linspace(0, np.pi / 2, fout)) ** 2 if fout else None
    if fin:
        y[:fin] *= ramp_in[:, None] if y.ndim == 2 else ramp_in
    if fout:
        y[-fout:] *= ramp_out[:, None] if y.ndim == 2 else ramp_out
    return y


def events_of(mono, hop=480):
    n = len(mono) // hop
    frames = mono[: n * hop].reshape(n, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    floor = np.percentile(db, 10)
    thr = floor + 12
    above = db > thr
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
            ev.append((i * hop, (j + 1) * hop))
            i = j + 1
        else:
            i += 1
    return ev, floor


def main():
    os.makedirs(OUT, exist_ok=True)
    report = []
    clip_report = []
    for path in sorted(glob.glob(os.path.join(SRC, "*.flac"))):
        base = os.path.basename(path)
        key = base[:2]
        label, kind = NAMES[key]
        x, ch = decode(path)
        clipped = int((np.abs(x) >= 0.999).sum())
        x, nruns, top = declip(x, ch)
        mono = x.mean(axis=1) if ch == 2 else x
        clip_report.append((label, clipped, nruns, top))
        ev, floor = events_of(mono)
        counts = {}
        outdir = os.path.join(OUT, label)
        os.makedirs(outdir, exist_ok=True)
        for (a, b) in ev:
            dur = (b - a) / SR
            pk = float(np.abs(mono[a:b]).max())
            pk_db = 20 * np.log10(pk + 1e-12)
            # leave out tiny clicks and handling noise: very short AND quiet
            if dur < 0.04 or pk_db < -52:
                continue
            if dur < 0.5:
                cat = "hit"
            elif dur < 2.0:
                cat = "stroke"
            elif dur < 6.0:
                cat = "swell"
            else:
                cat = "bed"
            pre = int(0.006 * SR)
            tail = int(0.12 * SR) if cat in ("hit", "stroke") else int(0.4 * SR)
            s = max(0, a - pre)
            e = min(len(mono), b + tail)
            if cat == "bed" and (e - s) > 20 * SR:
                e = s + 20 * SR
            seg = x[s:e]
            # peak-normalise to -3 dBFS, remember how loud it was
            peak = float(np.abs(seg).max()) + 1e-12
            seg = seg * (10 ** (-3 / 20) / peak)
            seg = fade(seg, int(0.003 * SR), int((0.06 if cat in ("hit", "stroke") else 0.5) * SR))
            level = "loud" if pk_db > -12 else "medium" if pk_db > -26 else "soft"
            counts[cat] = counts.get(cat, 0) + 1
            tsec = a / SR
            name = f"{label} {cat} {counts[cat]:03d} {level} {len(seg)/SR:.1f}s at {int(tsec//60)}m{int(tsec%60):02d}s.flac"
            write_flac(os.path.join(outdir, name), seg, ch)
        report.append((label, len(ev), counts))
    print("\nClipping check (samples at full scale / highest peak):")
    for label, c, nruns, top in clip_report:
        print(f"  {label}: {c} samples at full scale, {nruns} clipped runs repaired, rebuilt peaks reach {20*np.log10(max(top,1e-6)):.1f} dBFS" if nruns else f"  {label}: no clipping")
    print("\nFiles written to", OUT)
    for label, n, counts in report:
        print(f"  {label}: {n} events found -> {counts}")


if __name__ == "__main__":
    main()
