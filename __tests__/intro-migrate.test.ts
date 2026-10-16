import { defaultState, migrateState } from '../src/config';

it('older saved settings gain introBars and accentOffset', () => {
  const old: any = JSON.parse(JSON.stringify(defaultState));
  delete old.motion.drums.introBars;
  delete old.drums[0].accentOffset;
  for (const sc of old.scenes) { delete sc.motion.drums.introBars; delete sc.drums[0].accentOffset; }
  for (const j of old.journeys) for (const sc of j.scenes) { delete sc.motion.drums.introBars; delete sc.drums[0].accentOffset; }
  const m: any = migrateState(old);
  expect(m.motion.drums.introBars).toBe(0);
  expect(m.drums[0].accentOffset).toBe(0);
  expect(m.scenes[1].motion.drums.introBars).toBe(0);
  expect(m.scenes[1].drums[0].accentOffset).toBe(0);
});
