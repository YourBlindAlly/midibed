export type BeatPayload = {
  bar: number;
  beat: number;
};

/** Which layers are currently in their alternate (flipped) state. */
export type MotionPayload = {
  bass: boolean;
  pad: boolean;
  drums: boolean;
  reason: 'reset' | 'flip';
};

/** Auto-advance: `tick` at every bar line (how long is left), `auto` when the engine moved to another scene. */
export type SceneEventPayload = {
  index: number;
  barsLeft: number;
  target: number;
  reason: 'tick' | 'auto';
};

export type MidiBedEngineEvents = {
  onBeat: (event: BeatPayload) => void;
  onMotion: (event: MotionPayload) => void;
  onScene: (event: SceneEventPayload) => void;
};
