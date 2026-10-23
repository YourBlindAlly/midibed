// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
import { BACKUP_FILE_NAME, backupText, keepFoundLoops, parseBackup } from '../src/backup';
import { defaultState, migrateState, newJourney, renameJourney } from '../src/config';

describe('backing up and restoring the settings', () => {
  it('a backup brings back every setting, journeys included', () => {
    let s = renameJourney(newJourney(defaultState), 'My yoga set');
    s = { ...s, bpm: 72, fx: { ...s.fx, size: 80 } };
    const back = parseBackup(backupText(s));
    expect(back).not.toBeNull();
    expect(back!.journeyName).toBe('My yoga set');
    expect(back!.bpm).toBe(72);
    expect(back!.journeys.length).toBe(migrateState(s).journeys.length);
    expect(back!.fx.size).toBe(80);
  });

  it('is a labelled file, and a bare settings object is accepted too', () => {
    const text = backupText(defaultState, new Date('2026-10-22T12:00:00Z'));
    expect(JSON.parse(text).app).toBe('MidiBed');
    expect(JSON.parse(text).savedAt).toBe('2026-10-22T12:00:00.000Z');
    expect(parseBackup(JSON.stringify(defaultState))).not.toBeNull();
  });

  it('refuses a file that is not a MidiBed backup', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup('[1,2,3]')).toBeNull();
    expect(parseBackup(JSON.stringify({ app: 'Something else', state: {} }))).toBeNull();
    expect(parseBackup('{"hello": 1}')).toBeNull();
  });

  it('an older backup gets the defaults for what is newer', () => {
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.network;
    delete old.padVoice;
    const back = parseBackup(JSON.stringify({ app: 'MidiBed', backup: 1, state: old }))!;
    expect(back.network).toEqual(defaultState.network);
    expect(back.padVoice).toEqual(defaultState.padVoice);
  });

  it('keeps only the loops whose audio is on this phone', () => {
    const lib = [
      { id: 'A/one', name: 'one', folder: 'A', file: 'A__one.flac', bpm: 90, seconds: 2, bars: 1, repeats: 1 },
      { id: 'A/two', name: 'two', folder: 'A', file: 'A__two.flac', bpm: 90, seconds: 2, bars: 1, repeats: 1 },
    ];
    const s = { ...defaultState, loopLib: JSON.stringify(lib) };
    const r = keepFoundLoops(s, (f) => f === 'A__two.flac');
    expect(r.before).toBe(2);
    expect(r.after).toBe(1);
    expect(JSON.parse(r.state.loopLib).map((l: any) => l.id)).toEqual(['A/two']);
  });

  it('the Setup tab has the buttons, and the file name is fixed', () => {
    expect(BACKUP_FILE_NAME).toBe('MidiBed settings backup.json');
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('<Section title="Back up and restore my settings">');
    expect(app).toContain('Restore settings from a backup file');
    expect(app).toContain('Back up my settings now');
  });
});
