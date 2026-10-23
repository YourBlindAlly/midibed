import subprocess, glob, os, re, json
import numpy as np

FF = r"C:\Users\rusty\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
DIR = r"C:\Users\rusty\OneDrive\Documents\claude code folder\sample processing\chopped\Shells"
SR = 44100


def dec(p):
    return np.frombuffer(subprocess.run([FF, "-v", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout, dtype=np.float32)


def features(x):
    """Describe how a sound is made of clicks."""
    a = np.abs(x)
    # 1 ms envelope: max of absolute value in each millisecond
    h = SR // 1000
    n = len(a) // h
    env = a[: n * h].reshape(n, h).max(axis=1)
    pk = env.max() + 1e-9
    envdb = 20 * np.log10(env / pk + 1e-9)
    # a click = a local maximum of the 1 ms envelope that stands at least 12 dB above the quietest of the previous 4 ms
    # and is within 30 dB of the loudest click; clicks closer than 2 ms count once
    clicks = []
    for i in range(2, n - 1):
        if env[i] >= env[i - 1] and env[i] > env[i + 1] and envdb[i] > -30:
            prev = env[max(0, i - 5):i].min() if i > 0 else 0
            if env[i] > 2.0 * prev:
                if not clicks or i - clicks[-1] >= 2:
                    clicks.append(i)
    clicks = np.array(clicks)
    t = clicks / 1000.0 if len(clicks) else np.array([])
    # bursts: groups of clicks with gaps under 60 ms
    bursts = []
    if len(t):
        cur = [t[0]]
        for v in t[1:]:
            if v - cur[-1] < 0.060:
                cur.append(v)
            else:
                bursts.append(cur)
                cur = [v]
        bursts.append(cur)
    dur = len(x) / SR
    energy = a ** 2
    tot = energy.sum() + 1e-12
    first100 = energy[: int(0.1 * SR)].sum() / tot
    # share of energy in each burst (by its time span, +50 ms)
    bshare = []
    for b in bursts:
        s0 = int(max(0, (b[0] - 0.01)) * SR)
        s1 = int(min(len(x), (b[-1] + 0.05) * SR))
        bshare.append(float(energy[s0:s1].sum() / tot))
    return {
        "dur": dur,
        "clicks": int(len(t)),
        "bursts": len(bursts),
        "burst_clicks": [len(b) for b in bursts],
        "burst_start": [round(float(b[0]), 3) for b in bursts],
        "burst_len_ms": [round((b[-1] - b[0]) * 1000) for b in bursts],
        "burst_share": [round(s, 2) for s in bshare],
        "rate": round(len(t) / max(dur, 0.05), 1),
        "first100": round(float(first100), 2),
    }


if __name__ == "__main__":
    rows = []
    for f in sorted(glob.glob(os.path.join(DIR, "*.flac"))):
        name = os.path.basename(f)
        m = re.search(r"Shells (hit|stroke|swell|bed) (\d+) (\w+) ([\d.]+)s at (\d+)m(\d+)s", name)
        if not m:
            continue
        feat = features(dec(f))
        rows.append((m.group(1), int(m.group(2)), m.group(3), name, feat))
    json.dump([(c, n, l, nm, ft) for c, n, l, nm, ft in rows], open(os.path.join(os.environ["TEMP"], "shell_features.json"), "w"))
    for cat in ("hit", "stroke"):
        print(f"\n== {cat}s: number, level, length, clicks, bursts (clicks in each burst), burst start times, first 100 ms share")
        for c, n, l, nm, ft in rows:
            if c != cat:
                continue
            print(f" {n:3d} {l:6s} {ft['dur']:4.2f}s clicks {ft['clicks']:3d} bursts {ft['bursts']} {ft['burst_clicks']} starts {ft['burst_start']} lengths(ms) {ft['burst_len_ms']} share {ft['burst_share']} first100 {ft['first100']}")
