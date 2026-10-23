import glob, os, re, json, shutil, subprocess
import numpy as np
from shell_features import dec, features, DIR, SR, FF

KIT = r"C:\Users\rusty\OneDrive\Documents\claude code folder\sample processing\shell kit"


def humps(x, win_ms=12, prominence_db=7.0):
    """Peaks of the smoothed loudness, to find sounds made of two (or more) separate beats."""
    h = int(SR * win_ms / 1000)
    n = len(x) // h
    e = 20 * np.log10(np.sqrt((x[: n * h].reshape(n, h) ** 2).mean(axis=1)) + 1e-9)
    pk = e.max()
    out = []
    for i in range(1, n - 1):
        if e[i] >= e[i - 1] and e[i] > e[i + 1] and e[i] > pk - 24:
            # prominence: how far the loudness dips between this peak and the previous accepted one
            if out:
                j = out[-1]
                dip = e[j:i + 1].min()
                if min(e[j], e[i]) - dip >= prominence_db and (i - j) * win_ms >= 80:
                    out.append(i)
                elif e[i] > e[j] and min(e[j], e[i]) - dip < prominence_db:
                    out[-1] = i
            else:
                out.append(i)
    return [(i * win_ms / 1000.0, float(e[i] - pk)) for i in out]


def classify_hit(ft, hp, level, dur):
    clicks, bursts = ft["clicks"], ft["bursts"]
    main = int(np.argmax(ft["burst_share"])) if ft["burst_share"] else 0
    mclicks = ft["burst_clicks"][main] if ft["burst_clicks"] else 0
    mlen = ft["burst_len_ms"][main] if ft["burst_len_ms"] else 0
    rest = 1.0 - (ft["burst_share"][main] if ft["burst_share"] else 1.0)
    if len(hp) >= 2 and 0.12 <= hp[1][0] - hp[0][0] <= 0.5 and hp[1][1] > -10 and hp[0][1] > -10:
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


if __name__ == "__main__":
    files = sorted(glob.glob(os.path.join(DIR, "*.flac")))
    table = {}
    for f in files:
        name = os.path.basename(f)
        m = re.search(r"Shells (hit|stroke|swell|bed) (\d+) (\w+) ([\d.]+)s at (\d+)m(\d+)s", name)
        if not m:
            continue
        cat, num, level, dur = m.group(1), int(m.group(2)), m.group(3), float(m.group(4))
        x = dec(f)
        ft = features(x)
        hp = humps(x)
        a = np.abs(x)
        # sparse or dense for the long sounds: how many clicks a second, and how much of the time something is sounding
        h = int(SR * 0.01)
        n = len(a) // h
        e = a[: n * h].reshape(n, h).max(axis=1)
        active = float((e > e.max() * 10 ** (-40 / 20)).mean())
        entry = dict(cat=cat, num=num, level=level, dur=dur, name=name, ft=ft, humps=hp, active=round(active, 2))
        if cat in ("hit", "stroke"):
            entry["kind"] = classify_hit(ft, hp, level, dur)
        table[name] = entry
    json.dump(table, open(os.path.join(os.environ["TEMP"], "shell_table.json"), "w"))

    for cat in ("hit", "stroke"):
        kinds = {}
        for e in table.values():
            if e["cat"] == cat:
                kinds.setdefault(e["kind"], []).append(e["num"])
        print(f"\n{cat}s by kind:")
        for k, v in sorted(kinds.items()):
            print(f"  {k}: {len(v)}  -> {v}")
    print("\npairs (hit number: gap between the two beats, eighth notes at this tempo):")
    for e in table.values():
        if e.get("kind") == "pair":
            g = e["humps"][1][0] - e["humps"][0][0]
            print(f"  {e['cat']} {e['num']}: gap {g:.3f}s -> one eighth = {g:.3f}s -> {30/g:.0f} bpm")
    print("\nswells and beds: number, level, length, clicks per second, share of the time sounding")
    for cat in ("swell", "bed"):
        for e in sorted((e for e in table.values() if e["cat"] == cat), key=lambda e: e["num"]):
            print(f"  {cat} {e['num']:2d} {e['level']:6s} {e['dur']:5.1f}s  {e['ft']['rate']:6.1f}/s  sounding {e['active']*100:3.0f}%")
