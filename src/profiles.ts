import { GM_DRUMS } from './gm';

/**
 * Device profiles: plain data describing what a receiving app (or a standard)
 * understands. They add names and shortcuts to the generic controls; the app
 * works the same without them. To add a synth, add an entry to PROFILES.
 *
 * Only put facts here that were actually found in documentation or tested.
 * `about` is shown to the user, so it also says where the facts came from and
 * what is NOT known.
 */
export type ProfileCC = { name: string; cc: number };
export type ProfileNote = { name: string; note: number };

export type Profile = {
  id: string;
  name: string;
  about: string;
  /** The app plays one note at a time. */
  mono?: boolean;
  /** If present, the drum note control steps only through these notes. */
  drumNotes?: ProfileNote[];
  /** Named controls the app responds to, for filter wanderers etc. */
  ccs: ProfileCC[];
  /** A volume-style CC that suits the Fades feature for this app. */
  fadeCC?: number;
  /** Good program numbers, loaded into a sound slot on request. */
  favorites?: string;
  /** CCs that start and stop a loop player (use the same number twice for a play toggle). */
  loopControls?: { startCC: number; stopCC: number };
};

const gmNotes: ProfileNote[] = Object.keys(GM_DRUMS)
  .map(Number)
  .sort((a, b) => a - b)
  .map((note) => ({ note, name: GM_DRUMS[note] }));

export const PROFILES: Profile[] = [
  {
    id: 'none',
    name: 'No profile',
    about: 'Plain MIDI. Everything is shown as numbers.',
    ccs: [],
  },
  {
    id: 'gm',
    name: 'General MIDI drums',
    about:
      'Standard General MIDI drum note names (35 to 87). Drum channel is 10. Stepping a drum note moves between named drums only.',
    drumNotes: gmNotes,
    ccs: [],
  },
  {
    id: 'drumjam',
    name: 'DrumJam',
    about:
      "From the developer's version 1.3 notes: pad filter cutoff is CC 74 and resonance is CC 71, the same defaults MidiBed uses. CC 7 is master pad volume, 91 pad reverb send, 18 and 19 delay, 20 crush, 21 lo-fi. Program Change switches kits and presets, and Bank Select MSB chooses between pad instruments and presets. In DrumJam, CC 11 is touch-pad velocity, not volume. CC 118 toggles play and CC 117 stops. Which channel each instrument answers on is not documented, so use the test hits.",
    loopControls: { startCC: 118, stopCC: 117 },
    ccs: [
      { name: 'Pad filter cutoff', cc: 74 },
      { name: 'Pad filter resonance', cc: 71 },
      { name: 'Pad master volume', cc: 7 },
      { name: 'Pad reverb send', cc: 91 },
      { name: 'Pad pitch', cc: 111 },
      { name: 'Delay input level', cc: 18 },
      { name: 'Delay feedback', cc: 19 },
      { name: 'Delay time', cc: 87 },
      { name: 'Reverb size', cc: 86 },
      { name: 'Crush', cc: 20 },
      { name: 'Lo-fi', cc: 21 },
      { name: 'Bedlam master percent', cc: 22 },
      { name: 'Loops filter cutoff', cc: 82 },
      { name: 'Loops filter resonance', cc: 81 },
      { name: 'Loops reverb level', cc: 83 },
      { name: 'Master loop volume', cc: 85 },
    ],
  },
  {
    id: 'aum',
    name: 'AUM',
    about:
      'A third-party AUM template reports the default mapping: channel volume answers CC 7 and channel mute CC 9, on MIDI channels 1 to 8 for strips 1 to 8. Any other control can be mapped with MIDI learn. Using CC 7 for fades would fade whatever sits on that strip. Not yet checked on your setup.',
    ccs: [
      { name: 'Channel volume', cc: 7 },
      { name: 'Channel mute', cc: 9 },
    ],
    fadeCC: 7,
  },
  {
    id: 'synthone',
    name: 'Synth One',
    about:
      'Has MIDI learn on all knobs, bank and program change, and sustain pedal. No published list of CC numbers was found, so use MIDI learn with the test sweeps. Program numbers match what its screen shows. Favorites are your pad presets.',
    ccs: [],
    favorites: '12,16,20,26,39,55,63,75,80,82,99,113',
  },
  {
    id: 'modeld',
    name: 'Minimoog Model D',
    about:
      'Plays one note at a time, so the bass drone should be a single note. Control changes are assigned by you inside the app; no fixed list was found, so use MIDI learn with the test sweeps.',
    mono: true,
    ccs: [],
  },
  {
    id: 'sunrizer',
    name: 'Sunrizer',
    about:
      'Polyphonic (6 to 20 voices, also solo and arpeggio) with MIDI learn. No published list of CC numbers was found. Program change support has not been confirmed.',
    ccs: [],
  },
];

export type ProfileRole = 'drums' | 'drone' | 'pad' | 'loops';
export type ProfileChoice = Record<ProfileRole, string>;

export const defaultProfileChoice: ProfileChoice = { drums: 'gm', drone: 'none', pad: 'synthone', loops: 'drumjam' };

export function getProfile(id: string): Profile {
  return PROFILES.find((p) => p.id === id) ?? PROFILES[0];
}

export function profileIndex(id: string): number {
  const i = PROFILES.findIndex((p) => p.id === id);
  return i < 0 ? 0 : i;
}

type RoutingView = {
  drums: { channel: number }[];
  drone: { channel: number };
  pad: { channel: number };
  loops: { channel: number };
  profiles: ProfileChoice;
};

/** Which profile applies to a MIDI channel, judged by what is routed there. Drums win a shared channel. */
export function profileForChannel(s: RoutingView, channel: number): Profile {
  if (s.drums.some((d) => d.channel === channel)) return getProfile(s.profiles.drums);
  if (s.drone.channel === channel) return getProfile(s.profiles.drone);
  if (s.pad.channel === channel) return getProfile(s.profiles.pad);
  if (s.loops.channel === channel) return getProfile(s.profiles.loops);
  return getProfile('none');
}

export function ccName(profile: Profile, cc: number): string | undefined {
  return profile.ccs.find((c) => c.cc === cc)?.name;
}

export function profileNoteName(profile: Profile, note: number): string | undefined {
  return profile.drumNotes?.find((n) => n.note === note)?.name;
}

/** The next named drum note above or below `note`, or `note` itself if the profile has no list. */
export function stepDrumNote(profile: Profile, note: number, direction: 1 | -1): number {
  const list = profile.drumNotes;
  if (!list || list.length === 0) return Math.max(0, Math.min(127, note + direction));
  if (direction > 0) return list.find((n) => n.note > note)?.note ?? list[list.length - 1].note;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].note < note) return list[i].note;
  return list[0].note;
}
