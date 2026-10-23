import subprocess, sys, os, glob
import numpy as np

FF = r"C:\Users\rusty\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
SRC = r"C:\Users\rusty\OneDrive\Documents\claude code folder\sample processing"


def load(path):
    # decode to float32 raw, keep channels
    probe = subprocess.run([FF, "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le", "-"], capture_output=True)
    data = np.frombuffer(probe.stdout, dtype=np.float32)
    return data


def channels_of(path):
    r = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True, text=True)
    return 2 if "stereo" in r.stderr else 1


def analyze(path):
    ch = channels_of(path)
    x = load(path)
    if ch == 2:
        x = x.reshape(-1, 2)
        mono = x.mean(axis=1)
    else:
        mono = x
    sr = 48000
    hop = int(0.010 * sr)
    n = len(mono) // hop
    frames = mono[: n * hop].reshape(n, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    floor = np.percentile(db, 10)
    peak_db = 20 * np.log10(np.abs(mono).max() + 1e-12)
    print(f"\n=== {os.path.basename(path)}  ch={ch}  {len(mono)/sr:.1f}s  peak {peak_db:.1f} dBFS  noise floor(10th pct) {floor:.1f} dB  median {np.median(db):.1f}  90th {np.percentile(db,90):.1f}")
    # events: frames above floor + 12 dB, merged if gap < 150 ms
    thr = floor + 12
    above = db > thr
    events = []
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
            events.append((i * hop / sr, (j + 1) * hop / sr))
            i = j + 1
        else:
            i += 1
    durs = np.array([b - a for a, b in events])
    print(f"events above floor+12dB: {len(events)}")
    if len(events):
        print(f"  duration: min {durs.min():.2f}s  median {np.median(durs):.2f}s  max {durs.max():.2f}s;  <0.5s: {(durs<0.5).sum()}  0.5-2s: {((durs>=0.5)&(durs<2)).sum()}  2-6s: {((durs>=2)&(durs<6)).sum()}  >6s: {(durs>=6).sum()}")
        pk = []
        for a, b in events:
            seg = mono[int(a * sr): int(b * sr)]
            pk.append(20 * np.log10(np.abs(seg).max() + 1e-12))
        pk = np.array(pk)
        print(f"  event peak dBFS: min {pk.min():.1f} median {np.median(pk):.1f} max {pk.max():.1f}")
        # spectral centroid per event (first 0.25s)
        cs = []
        for a, b in events:
            seg = mono[int(a * sr): int(min(b, a + 0.25) * sr)]
            if len(seg) < 256:
                continue
            sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
            fr = np.fft.rfftfreq(len(seg), 1 / sr)
            cs.append((sp * fr).sum() / (sp.sum() + 1e-12))
        if cs:
            cs = np.array(cs)
            print(f"  spectral centroid (first 0.25s): 10th {np.percentile(cs,10):.0f} Hz  median {np.median(cs):.0f} Hz  90th {np.percentile(cs,90):.0f} Hz")
    # first 12 events listing
    for k, (a, b) in enumerate(events[:10]):
        seg = mono[int(a * sr): int(b * sr)]
        print(f"   {k+1:3d}: {a:7.2f}s  length {b-a:5.2f}s  peak {20*np.log10(np.abs(seg).max()+1e-12):6.1f} dB")
    return events


if __name__ == "__main__":
    for f in sorted(glob.glob(os.path.join(SRC, "*.flac"))):
        analyze(f)
