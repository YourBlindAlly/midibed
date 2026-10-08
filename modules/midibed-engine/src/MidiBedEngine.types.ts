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

export type MidiBedEngineEvents = {
  onBeat: (event: BeatPayload) => void;
  onMotion: (event: MotionPayload) => void;
};
