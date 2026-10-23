"""
MidiBed MIDI monitor for Windows. Listens to a MIDI input (normally the rtpMIDI port MidiBed's live link comes in
on) and says in plain lines what is arriving: which channels, which notes, and the record and stop messages.
Needs nothing but Python (it talks to the Windows MIDI driver directly). Stop it with Control and C.

Every two seconds it prints one line per channel that was active, for example:
    Channel 10 (usually the drums): 21 messages. Notes 36 38 42 82.
When the record or stop message arrives it says so at once. When nothing arrives it says so once.
"""
import ctypes
import socket
import sys
import threading
import time
from collections import defaultdict
from ctypes import wintypes

winmm = ctypes.WinDLL("winmm")

CALLBACK_FUNCTION = 0x00030000
MIM_DATA = 0x3C3
MIM_OPEN = 0x3C1


class MIDIINCAPSW(ctypes.Structure):
    _fields_ = [
        ("wMid", wintypes.WORD),
        ("wPid", wintypes.WORD),
        ("vDriverVersion", wintypes.UINT),
        ("szPname", wintypes.WCHAR * 32),
        ("dwSupport", wintypes.DWORD),
    ]


MIDIINPROC = ctypes.WINFUNCTYPE(None, ctypes.c_void_p, wintypes.UINT, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t)

winmm.midiInOpen.argtypes = [ctypes.POINTER(ctypes.c_void_p), wintypes.UINT, ctypes.c_void_p, ctypes.c_size_t, wintypes.DWORD]
winmm.midiInOpen.restype = wintypes.UINT
winmm.midiInStart.argtypes = [ctypes.c_void_p]
winmm.midiInClose.argtypes = [ctypes.c_void_p]
winmm.midiInGetDevCapsW.argtypes = [ctypes.c_size_t, ctypes.POINTER(MIDIINCAPSW), wintypes.UINT]

PART_GUESS = {1: "the bass drone", 2: "the chord pad", 4: "MidiDancer", 5: "the keys", 10: "the drums", 16: "the record and stop messages"}

lock = threading.Lock()
counts = defaultdict(int)
notes = defaultdict(list)
controls = defaultdict(set)
other = defaultdict(int)
events = []  # immediate messages: (text)


def on_message(handle, msg, instance, p1, p2):
    if msg != MIM_DATA:
        return
    status = p1 & 0xFF
    d1 = (p1 >> 8) & 0x7F
    d2 = (p1 >> 16) & 0x7F
    if status >= 0xF0:
        return
    kind = status & 0xF0
    ch = (status & 0x0F) + 1
    with lock:
        counts[ch] += 1
        if kind == 0x90 and d2 > 0:
            if d1 not in notes[ch]:
                notes[ch].append(d1)
        elif kind == 0xB0:
            controls[ch].add(d1)
            if ch == 16 and d2 >= 64:
                events.append("The message on channel 16, control %d, arrived (the record or stop message)." % d1)
        elif kind == 0x80 or (kind == 0x90 and d2 == 0):
            other[(ch, "note release")] += 1
        elif kind == 0xC0:
            other[(ch, "program change")] += 1
        elif kind == 0xE0:
            other[(ch, "pitch bend")] += 1


callback = MIDIINPROC(on_message)


def list_inputs():
    out = []
    for i in range(winmm.midiInGetNumDevs()):
        caps = MIDIINCAPSW()
        winmm.midiInGetDevCapsW(i, ctypes.byref(caps), ctypes.sizeof(caps))
        out.append(caps.szPname)
    return out


def choose(names):
    if not names:
        print("No MIDI inputs were found on this computer. Is rtpMIDI installed and running?")
        return None
    print("MIDI inputs on this computer:")
    for i, n in enumerate(names):
        print("  %d: %s" % (i + 1, n))
    # rtpMIDI names its port after the session, which by default is the name of this computer.
    host = socket.gethostname().lower()
    guess = [i for i, n in enumerate(names) if any(w in n.lower() for w in ("rtp", "session", "midibed", "iphone")) or host.startswith(n.lower()[:15]) or n.lower() == host]
    if len(guess) == 1:
        print("Using number %d, %s." % (guess[0] + 1, names[guess[0]]))
        return guess[0]
    if len(names) == 1:
        return 0
    while True:
        try:
            n = int(input("Type the number of the input to listen to, then press Enter: "))
            if 1 <= n <= len(names):
                return n - 1
        except ValueError:
            pass
        print("Please type one of the numbers above.")


def main():
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass
    names = list_inputs()
    if "--list" in sys.argv:
        for n in names:
            print(n)
        return
    idx = choose(names)
    if idx is None:
        return
    handle = ctypes.c_void_p()
    rc = winmm.midiInOpen(ctypes.byref(handle), idx, ctypes.cast(callback, ctypes.c_void_p), 0, CALLBACK_FUNCTION)
    if rc != 0:
        print("Could not open that input (error %d). Another program may be using it exclusively." % rc)
        return
    winmm.midiInStart(handle)
    print("Listening. Press Control and C to stop.")
    quiet = False
    try:
        while True:
            time.sleep(2)
            with lock:
                snapshot_counts = dict(counts)
                snapshot_notes = {k: list(v) for k, v in notes.items()}
                snapshot_controls = {k: sorted(v) for k, v in controls.items()}
                snapshot_other = dict(other)
                said = list(events)
                counts.clear()
                notes.clear()
                controls.clear()
                other.clear()
                events.clear()
            for line in said:
                print(line)
            if not snapshot_counts:
                if not quiet:
                    print("Nothing is arriving.")
                    quiet = True
                continue
            quiet = False
            for ch in sorted(snapshot_counts):
                part = PART_GUESS.get(ch)
                head = "Channel %d%s: %d messages." % (ch, " (usually %s)" % part if part else "", snapshot_counts[ch])
                bits = []
                if snapshot_notes.get(ch):
                    bits.append("Notes " + " ".join(str(n) for n in sorted(snapshot_notes[ch])[:12]) + ("..." if len(snapshot_notes[ch]) > 12 else ""))
                if snapshot_controls.get(ch):
                    bits.append("Controls " + " ".join(str(c) for c in snapshot_controls[ch][:8]))
                for (c, what), n in snapshot_other.items():
                    if c == ch:
                        bits.append("%d %s" % (n, what))
                print(head + (" " + ". ".join(bits) + "." if bits else ""))
    except KeyboardInterrupt:
        pass
    finally:
        winmm.midiInClose(handle)
        print("Stopped.")


if __name__ == "__main__":
    main()
