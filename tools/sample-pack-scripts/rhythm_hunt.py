import subprocess, os, glob
import numpy as np

FF = r"C:\Users\rusty\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
SRC = r"C:\Users\rusty\OneDrive\Documents\claude code folder\sample processing"
SR = 44100


def decode(path):
    p = subprocess.run([FF, "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32)


def onsets(x, hop=441, thr=9.0, sep=0.08):
    n = len(x) // hop
    fr = x[: n * hop].reshape(n, hop)
    e = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    floor = np.percentile(e, 10)
    out = []
    last = -1000
    for i in range(1, n):
        if e[i] - e[i - 1] > thr and e[i] > floor + 15 and (i - last) * hop / SR > sep:
            out.append(i * hop / SR)
            last = i
    return np.array(out), e


def fmt(t):
    return f"{int(t//60)}:{t%60:05.2f}"


for path in sorted(glob.glob(os.path.join(SRC, "*.flac"))):
    x = decode(path)
    on, e = onsets(x)
    print(f"\n=== {os.path.basename(path)}: {len(on)} onsets")
    if len(on) < 8:
        continue
    ioi = np.diff(on)
    regions = []
    W = 8
    i = 0
    while i + W < len(on):
        w = ioi[i:i + W - 1]
        m = np.median(w)
        # regular if every gap in the window is within 15 percent of the median, or twice/half of it (a pattern)
        ok = np.all(np.abs(w - m) < 0.18 * m)
        if ok and 0.2 < m < 2.0:
            j = i + W - 1
            while j < len(ioi) and abs(ioi[j] - m) < 0.18 * m:
                j += 1
            regions.append((on[i], on[min(j, len(on) - 1)], m, j - i + 1))
            i = j + 1
        else:
            i += 1
    if not regions:
        print("  no stretch of at least 8 evenly spaced hits")
    for a, b, m, n in regions[:20]:
        print(f"  {fmt(a)} to {fmt(b)}: {n} hits about {m:.2f}s apart = {60/m:.0f} per minute (or {30/m:.0f} / {120/m:.0f} counting half or double)")
