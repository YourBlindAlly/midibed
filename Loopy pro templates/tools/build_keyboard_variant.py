"""
Build "Serial Looper + keyboard": a COPY of espiegel123's Serial Looper Unquantized template with a typing-keyboard
control profile added, so a keyboard (such as the Hable One in keyboard mode) can run the looper while Loopy Pro
is on screen. The pedal bindings and everything else in the template are left exactly as they were.

Run from anywhere:   python build_keyboard_variant.py
Reads:   ../Serial-Looper-Unquantized-Aug-11-to-share-*.zip   (your download; never modified)
Writes:  ../built/Serial Looper Keyboard.lpproj   (a zip, like every .lpproj)  and  ../built/KEYS.txt

What was learned about the format (see ../FORMAT_NOTES.md):
- A .lpproj is a zip whose root holds Project.sqlite (JSON objects), Info.plist, Resources.plist, Thumbnail.jpg,
  `Control Profile.lpcontrolprofile/` and `Control Profiles/<name>.lpcontrolprofile/<device>.controllerprofile`.
- A typing keyboard is a controller profile of Type 'Keyboard', Device 'Keyboard'; a binding's Trigger is just the
  key name ('a', 'Spacebar', 'Equal Sign', ...).
- A profile is switched on by listing its name in the Project object's `activeControlProfileNames`.
- Serial Looper's loops are tracks #12 (A), #8 (B) and #1479 (C); buttons: PEEL #1014, RETRO RECORD #904,
  CLEAR #347 (long press clears everything), Mode dial #66, REVERSE #1044, Fade Out #1914, INIT #550.

The keys below act on the tracks DIRECTLY (not through the A-D buttons), so they do not depend on how Loopy Pro
reports a key release, and they do the same thing whichever Play/Record mode the pedal is in.
"""
import glob
import io
import json
import os
import plistlib
import sqlite3
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # .../Loopy pro templates
OUT_DIR = os.path.join(ROOT, 'built')
PROFILE_NAME = 'Keyboard'

LOOPS = {'a': ('#12', 'A'), 's': ('#8', 'B'), 'd': ('#1479', 'C')}
PLAY = {'q': '#12', 'w': '#8', 'e': '#1479'}


def action(identifier, subject=None, **params):
    a = {'Identifier': identifier, 'Parameters': params, 'Timing': 'Sequential'}
    if subject is not None:
        a['Subject'] = subject
    return a


def widget(widget_id, how='Press'):
    return action('Trigger Widget', f'#{widget_id}', **{'Widget Action': how})


def bindings():
    b = []
    # Record / overdub a loop (the same action the pedal does in Record Mode)
    for key, (track, _name) in LOOPS.items():
        b.append({'Trigger': key, 'Actions': [action('Track Record/Stop', track, **{'Non Empty Track Action': 4})]})
    # Play / stop a loop
    for key, track in PLAY.items():
        b.append({'Trigger': key, 'Actions': [action('Track Play/Stop', track)]})
    b.append({'Trigger': 'f', 'Actions': [widget(1014, 'Press')]})        # peel the last overdub
    b.append({'Trigger': 'g', 'Actions': [widget(1014, 'Long Press')]})   # replace
    b.append({'Trigger': 'r', 'Actions': [widget(904, 'Press')]})         # retro record
    b.append({'Trigger': 'x', 'Actions': [widget(347, 'Long Press')]})    # clear everything
    b.append({'Trigger': 'v', 'Actions': [widget(1044, 'Press')]})        # reverse
    b.append({'Trigger': 'o', 'Actions': [widget(1914, 'Press')]})        # fade out and stop
    b.append({'Trigger': 'm', 'Actions': [widget(66, 'Press')]})          # pedal Play/Record mode
    b.append({'Trigger': 'i', 'Actions': [widget(550, 'Press')]})         # INIT
    return b


KEYS_TEXT = """Serial Looper + keyboard: what the keys do (Loopy Pro on screen, keyboard mode)

  A S D   record loop A, B, C. If empty it records; if it has a loop it overdubs.
  Q W E   play or stop loop A, B, C.
  F       peel (take off) the last overdub.
  G       replace (long press of peel).
  R       retro record: capture what you just played.
  V       reverse.
  X       clear everything.
  O       fade out and stop.
  M       switch the pedals between Play mode and Record mode.
  I       initialise (only needed if the dial states look wrong).

The pedal bindings in the project are unchanged. Letter keys only; no modifier is needed.
"""


def find_source():
    hits = sorted(glob.glob(os.path.join(ROOT, 'Serial-Looper-Unquantized*.zip')))
    if not hits:
        sys.exit('Serial Looper zip not found in ' + ROOT)
    return hits[0]


def main():
    src = find_source()
    outer = zipfile.ZipFile(src)
    inner_name = next(i.filename for i in outer.infolist() if i.filename.endswith('.lpproj') and not i.filename.startswith('__MACOSX'))
    inner = zipfile.ZipFile(io.BytesIO(outer.read(inner_name)))

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, 'Serial Looper Keyboard.lpproj')

    # Patch a copy of the database: switch the Keyboard profile on.
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, 'Project.sqlite')
        with open(db_path, 'wb') as f:
            f.write(inner.read('Project.sqlite'))
        con = sqlite3.connect(db_path)
        row = con.execute("select id, contents from objects where type='Project'").fetchone()
        proj = json.loads(row[1])
        names = proj['activeControlProfileNames']['_value']
        if PROFILE_NAME not in names:
            names.append(PROFILE_NAME)
        con.execute('update objects set contents=? where id=?', (json.dumps(proj, separators=(',', ':')).encode('utf-8'), row[0]))
        con.commit()
        # every widget the keys point at must exist
        ids = {r[0] for r in con.execute('select id from objects')}
        con.close()
        needed = {1014, 904, 347, 1044, 1914, 66, 550, 12, 8, 1479}
        missing = needed - ids
        if missing:
            sys.exit(f'This template does not have object ids {sorted(missing)}; it is not the version this script was written for.')
        db_bytes = open(db_path, 'rb').read()

    profile = {'Bindings': bindings(), 'Device': 'Keyboard', 'Device Name': 'Keyboard', 'Type': 'Keyboard'}
    profile_bytes = plistlib.dumps(profile, fmt=plistlib.FMT_XML)

    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for info in inner.infolist():
            if info.filename.endswith('.DS_Store') or info.is_dir():
                continue
            data = db_bytes if info.filename == 'Project.sqlite' else inner.read(info.filename)
            z.writestr(info.filename, data)
        z.writestr(f'Control Profiles/{PROFILE_NAME}.lpcontrolprofile/Keyboard.Keyboard.controllerprofile', profile_bytes)

    with open(os.path.join(OUT_DIR, 'KEYS.txt'), 'w', encoding='utf-8') as f:
        f.write(KEYS_TEXT)

    # Read it back to prove it is well formed.
    chk = zipfile.ZipFile(out_path)
    assert chk.testzip() is None
    back = plistlib.loads(chk.read(f'Control Profiles/{PROFILE_NAME}.lpcontrolprofile/Keyboard.Keyboard.controllerprofile'))
    print('wrote', out_path)
    print('entries:', len(chk.namelist()), ' keyboard bindings:', len(back['Bindings']))
    print('triggers:', [b['Trigger'] for b in back['Bindings']])


if __name__ == '__main__':
    main()
