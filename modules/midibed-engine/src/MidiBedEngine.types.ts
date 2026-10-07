export type BeatPayload = {
  bar: number;
  beat: number;
};

export type MidiBedEngineEvents = {
  onBeat: (event: BeatPayload) => void;
};
