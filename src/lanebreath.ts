// Loop lane breathing: a lane can rest and play by a rule, alone or against the drums.
// This is the tested reference; MidiBedEngine.swift (laneMayPlay) must behave the same.
//
//  mode 0  plays steadily (as before)
//  mode 1  its own cycle: plays for onBars, rests for offBars, with a chance of resting each time (the same
//          rule as the bass, pad and drum breathing, counted from the scene start)
//  mode 2  plays only while the drums are playing
//  mode 3  plays only while the drums are out (the intro, a breakdown, or no drums on)

export const LANE_BREATHE_NAMES = ['Plays steadily', 'Plays and rests in a cycle', 'Plays only with the drums', 'Plays only when the drums are out'];

export type LaneBreathe = { mode: number; onBars: number; offBars: number; chance: number };

export function laneMayPlay(mode: number, resting: boolean, drumsOut: boolean): boolean {
  switch (mode) {
    case 1:
      return !resting;
    case 2:
      return !drumsOut;
    case 3:
      return drumsOut;
    default:
      return true;
  }
}

/** The drums count as out in the intro, in any breakdown, and when no drum is switched on. */
export function drumsAreOut(introBarsLeft: number, inBreakdown: boolean, anyDrumOn: boolean): boolean {
  return introBarsLeft > 0 || inBreakdown || !anyDrumOn;
}
