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

/** An orchestrated stop: set (bars left), a bar line passes (tick), the music has ended (end). */
export type EndingPayload = {
  barsLeft: number;
  reason: 'set' | 'tick' | 'end';
};

/** Recording a take as a MIDI file: waiting for Play (armed), recording, stopped (off), saved with its file path, or nothing was played (empty). */
export type RecordingPayload = {
  state: 'armed' | 'recording' | 'off' | 'saved' | 'empty' | 'failed';
  path: string | null;
  bars: number;
};

/** A MIDI source (a pedal, a keyboard, another app) appeared or went away. */
export type MidiDevicePayload = {
  state: 'connected' | 'disconnected';
  name: string;
};

/** A press from a MIDI controller: a note on, a control change or a program change. */
export type MidiInPayload = {
  kind: 'cc' | 'note' | 'pc';
  channel: number; // 0-15
  number: number;
  value: number;
};

export type MidiBedEngineEvents = {
  onBeat: (event: BeatPayload) => void;
  onMotion: (event: MotionPayload) => void;
  onScene: (event: SceneEventPayload) => void;
  onMidiIn: (event: MidiInPayload) => void;
};
