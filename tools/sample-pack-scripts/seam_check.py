import subprocess, glob, os
import numpy as np
FF = r"C:\Users\rusty\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
base = r"C:\Users\rusty\OneDrive\Documents\claude code folder\sample processing"
def dec(p):
    return np.frombuffer(subprocess.run([FF,"-v","error","-i",p,"-ac","1","-ar","44100","-f","f32le","-"],capture_output=True).stdout,dtype=np.float32)
def edge(x):
    pk = np.abs(x).max()+1e-9
    n = int(0.005*44100)
    last = 20*np.log10(np.sqrt((x[-n:]**2).mean())/pk+1e-9)   # last 5 ms vs peak
    first = 20*np.log10(np.sqrt((x[:n]**2).mean())/pk+1e-9)
    jump = abs(float(x[0])-float(x[-1]))/pk
    return last, first, jump
for folder in ("loop candidates", "loop candidates v2"):
    print("==", folder)
    rows = []
    for f in sorted(glob.glob(os.path.join(base, folder, "*.flac"))):
        x = dec(f)
        l, fi, j = edge(x)
        rows.append((l, os.path.basename(f)[:46], fi, j))
    for l, nme, fi, j in rows:
        print(f"  {nme:46s} last 5ms {l:6.1f} dB vs peak, first 5ms {fi:6.1f} dB, seam jump {j*100:4.1f}% of peak")
