/**
 * When a scene (or journey) change lands. Like the type of stop: a scene change asked for now waits for
 * a musical boundary. 0 the next bar line (as before), 1 the end of the progression (the chord loop comes
 * back to its first chord), 2 the end of the scene (the auto-advance countdown if the scene has one,
 * otherwise the end of the progression). The engine does the timing (landingTick in MidiBedEngine.swift).
 */
export const SCENE_CHANGE_NAMES = ['The next bar', 'The end of the progression', 'The end of the scene'];

export function nextSceneChangeAt(i: number): number {
  return (Math.max(0, Math.min(2, Math.round(i))) + 1) % SCENE_CHANGE_NAMES.length;
}

/** What is said when a scene is asked for while playing. */
export function sceneChangeWhen(i: number): string {
  if (i === 1) return 'starts at the end of the progression';
  if (i === 2) return 'starts at the end of the scene';
  return 'starts at the next bar';
}
