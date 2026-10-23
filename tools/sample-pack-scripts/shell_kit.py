import glob, os, re, shutil, subprocess
import numpy as np
import shell_classify as sc
from shell_features import dec, features, DIR, SR, FF

KIT = sc.KIT


def humps_loose(x):
    # two separate beats: the second at least 20 dB-down hump with a dip of 8 dB between, 120-500 ms apart
    return sc.humps(x, win_ms=12, prominence_db=8.0)


def classify(ft, hp, level, dur):
    clicks, bursts = ft["clicks"], ft["bursts"]
    main = int(np.argmax(ft["burst_share"])) if ft["burst_share"] else 0
    mclicks = ft["burst_clicks"][main] if ft["burst_clicks"] else 0
    mlen = ft["burst_len_ms"][main] if ft["burst_len_ms"] else 0
    rest = 1.0 - (ft["burst_share"][main] if ft["burst_share"] else 1.0)
    if len(hp) >= 2 and 0.18 <= hp[1][0] - hp[0][0] <= 0.5 and hp[1][1] > -18 and hp[0][1] > -18:
        return "pair"
    if mclicks <= 8 and mlen < 80:
        return "light tick"
    if mclicks >= 12 and level != "soft" and rest < 0.2:
        return "solid"
    if mclicks >= 9 and level == "soft":
        return "soft bunch"
    if bursts >= 3:
        return "scattered"
    return "medium bunch"


def fold(seg, L):
    n = int(round(L * SR))
    out = np.zeros(n, dtype=np.float32)
    for k in range(0, len(seg), n):
        chunk = seg[k:k + n]
        out[: len(chunk)] += chunk
    return out


def write_flac(path, x):
    raw = np.ascontiguousarray(x.astype(np.float32)).tobytes()
    subprocess.run([FF, "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-af", "aresample=dither_method=triangular", "-sample_fmt", "s16", "-compression_level", "8", path], input=raw, check=True)


if os.path.isdir(KIT):
    shutil.rmtree(KIT, ignore_errors=True)
os.makedirs(KIT, exist_ok=True)

counts = {}
pairs = []
for f in sorted(glob.glob(os.path.join(DIR, "*.flac"))):
    name = os.path.basename(f)
    m = re.search(r"Shells (hit|stroke|swell|bed) (\d+) (\w+) ([\d.]+)s at (\d+)m(\d+)s", name)
    if not m:
        continue
    cat, num, level, dur = m.group(1), int(m.group(2)), m.group(3), float(m.group(4))
    x = dec(f)
    ft = features(x)
    if cat in ("hit", "stroke"):
        hp = humps_loose(x)
        kind = classify(ft, hp, level, dur)
        folder = {
            "solid": "1 Solid hits (bunched clicks that land)",
            "medium bunch": "2 Medium bunches",
            "soft bunch": "3 Soft bunches (light textures)",
            "light tick": "4 Light ticks (grace notes)",
            "scattered": "5 Scattered clicks",
            "pair": "6 Pairs (two separate beats)",
        }[kind]
        if cat == "stroke":
            folder = "Strokes - " + folder[2:].split(" (")[0].lower()
        if kind == "pair":
            pairs.append((f, name, hp))
    else:
        rate, active = ft["rate"], None
        a = np.abs(x)
        h = int(SR * 0.01)
        n = len(a) // h
        e = a[: n * h].reshape(n, h).max(axis=1)
        active = float((e > e.max() * 10 ** (-40 / 20)).mean())
        kind = "dense" if (rate >= 70 or active >= 0.8) else "sparse" if (rate < 35 and active < 0.55) else "medium"
        folder = ("Swells - " if cat == "swell" else "Beds - ") + kind
    os.makedirs(os.path.join(KIT, folder), exist_ok=True)
    shutil.copy2(f, os.path.join(KIT, folder, name))
    counts.setdefault(folder, []).append(num)

print("Sorted into", KIT)
for k in sorted(counts):
    print(f"  {k}: {len(counts[k])} -> {sorted(counts[k])}")

# loops from the pairs: the two beats become a pair of eighth notes; fold the tails so the loop is seamless; one bar of eight
os.makedirs(os.path.join(KIT, "7 Eighth-note loops from the pairs"), exist_ok=True)
print("\nEighth-note loops from the pairs:")
for f, name, hp in pairs:
    x = dec(f)
    g = hp[1][0] - hp[0][0]  # gap between the two beats = one eighth note
    L = 2 * g  # one beat
    t_a = hp[0][0]
    st = max(0, int((t_a - 0.07) * SR))
    unit = fold(x[st:], L)
    # the loop must start cleanly: rotate so it begins just before the first beat's attack
    pk = int(np.argmax(np.abs(unit)))
    unit = np.roll(unit, -max(0, pk - int(0.05 * SR)))
    bar = np.tile(unit, 4)
    bpm = 60.0 / L
    pkv = float(np.abs(bar).max()) + 1e-9
    bar = bar * (10 ** (-3 / 20) / pkv)
    num = re.search(r"(hit|stroke) (\d+)", name)
    out = f"Shells {num.group(1)} {num.group(2)} eighths loop 1 bar {round(bpm)}bpm.flac"
    write_flac(os.path.join(KIT, "7 Eighth-note loops from the pairs", out), bar)
    print(f"  {name[:34]}: beats {g:.3f}s apart -> eighths at {bpm:.0f} bpm -> {out}")
