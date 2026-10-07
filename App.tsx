import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  BedState,
  DrumState,
  FadeState,
  PadState,
  SCENE_COUNT,
  SoundSlot,
  WandererState,
  addFavorite,
  copyScene,
  defaultState,
  drumNoteLabel,
  droneNotes,
  noteName,
  parseFavorites,
  removeFavorite,
  switchScene,
  toEngineJson,
} from './src/config';
import { MODE_NAMES, PRESETS, STYLE_NAMES, chordLabel } from './src/chords';
import { ActionButton, Section, Stepper, Toggle, colors } from './src/controls';
import { describePattern, patternText } from './src/euclid';
import { engine, hasNativeEngine, onBeat, testSweep } from './src/engine';
import { loadState, saveState } from './src/storage';

const KEEP_AWAKE_TAG = 'midibed-playing';
const channelText = (v: number) => String(v + 1);
const fadeText = (v: number) => (v === 0 ? 'none' : `${(v / 10).toFixed(1)} seconds`);

export default function App() {
  const [state, setState] = useState<BedState>(defaultState);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState('1.1');
  const programTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // A scene switch is pushed to the engine "queued" so it lands on a bar line.
  const queueNextApply = useRef(false);
  const [queuedScene, setQueuedScene] = useState<number | null>(null);
  const [copyTarget, setCopyTarget] = useState(2);

  // Load saved settings once. Saving is held back until this finishes so the
  // defaults can never overwrite what is stored.
  useEffect(() => {
    loadState().then((s) => {
      setState(s);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => saveState(state), 400);
    return () => clearTimeout(t);
  }, [state, ready]);

  // Push every settings change to the native engine (it applies at the next
  // tick; musical timing never depends on this).
  const json = useMemo(() => toEngineJson(state), [state]);
  useEffect(() => {
    engine.applyConfig(json, queueNextApply.current);
    queueNextApply.current = false;
  }, [json]);

  useEffect(() => {
    return onBeat(({ bar, beat }) => {
      setPosition(`${bar}.${beat}`);
      // A queued scene switch lands on beat 1 of a bar.
      if (beat === 1) setQueuedScene(null);
    });
  }, []);

  useEffect(() => {
    if (playing) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // ignore
      }
    }
  }, [playing]);

  const togglePlay = () => {
    if (playing) {
      engine.stop();
      setPlaying(false);
      setPosition('1.1');
    } else {
      engine.applyConfig(json);
      engine.start();
      setPlaying(true);
    }
  };

  const patch = (p: Partial<BedState>) => setState((s) => ({ ...s, ...p }));
  const patchDrum = (i: number, p: Partial<DrumState>) =>
    setState((s) => ({ ...s, drums: s.drums.map((d, k) => (k === i ? { ...d, ...p } : d)) }));
  const patchDrone = (p: Partial<BedState['drone']>) => setState((s) => ({ ...s, drone: { ...s.drone, ...p } }));
  const goToScene = (to: number) => {
    if (to === state.activeScene) return;
    const next = switchScene(state, to);
    // Only queue if the engine will actually receive a changed config.
    const queued = playing && toEngineJson(next) !== json;
    queueNextApply.current = queued;
    setState(next);
    setQueuedScene(queued ? to : null);
    const msg = queued ? `Scene ${to + 1}, starts at the next bar` : `Scene ${to + 1}`;
    setTimeout(() => AccessibilityInfo.announceForAccessibility(msg), 500);
  };

  const copySceneTo = (to: number) => {
    if (to === state.activeScene) return;
    setState((s) => copyScene(s, to));
    setTimeout(() => AccessibilityInfo.announceForAccessibility(`Copied scene ${state.activeScene + 1} to scene ${to + 1}`), 500);
  };

  const patchFade =(p: Partial<FadeState>) => setState((s) => ({ ...s, fade: { ...s.fade, ...p } }));
  const patchPad =(p: Partial<PadState>) => setState((s) => ({ ...s, pad: { ...s.pad, ...p } }));
  // Editing the chords by hand turns the preset label into "Custom".
  const setDegree = (i: number, v: number) =>
    setState((s) => ({ ...s, pad: { ...s.pad, preset: 0, degrees: s.pad.degrees.map((d, k) => (k === i ? v : d)) } }));
  const choosePreset = (idx: number) =>
    setState((s) => {
      const pr = PRESETS[idx];
      if (idx === 0 || !pr) return { ...s, pad: { ...s.pad, preset: 0 } };
      const degrees = [0, 1, 2, 3].map((k) => pr.degrees[k] ?? s.pad.degrees[k]);
      return { ...s, pad: { ...s.pad, preset: idx, degrees, count: pr.degrees.length } };
    });
  const padSummary = state.pad.degrees
    .slice(0, state.pad.count)
    .map((d) => chordLabel(state.drone.root, state.pad.mode, d, state.pad.style))
    .join(', then ');
  const patchWanderer = (i: number, p: Partial<WandererState>) =>
    setState((s) => ({ ...s, wanderers: s.wanderers.map((w, k) => (k === i ? { ...w, ...p } : w)) }));

  const sendSound = (slot: SoundSlot) =>
    engine.sendProgramChange(slot.channel, slot.program, slot.sendBank ? slot.bankMSB : -1, slot.sendBank ? slot.bankLSB : -1);

  // Changing a sound sends Program Change right away (after a short pause so
  // swiping quickly through programs doesn't flood the receiving app).
  const patchSoundFavorites = (i: number, favorites: string) =>
    setState((s) => ({ ...s, sounds: s.sounds.map((x, k) => (k === i ? { ...x, favorites } : x)) }));

  const patchSound = (i: number, p: Partial<SoundSlot>) => {
    const next = { ...state.sounds[i], ...p };
    setState((s) => ({ ...s, sounds: s.sounds.map((x, k) => (k === i ? next : x)) }));
    if (programTimers.current[i]) clearTimeout(programTimers.current[i]);
    programTimers.current[i] = setTimeout(() => sendSound(next), 200);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title} accessibilityRole="header">
            MidiBed
          </Text>
          {!hasNativeEngine && (
            <Text style={styles.warn}>Native MIDI engine not available in this build; the controls work but nothing plays.</Text>
          )}

          <Pressable
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[styles.play, playing && { backgroundColor: '#7d2f2f' }]}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Stop' : 'Play'}
            onPress={togglePlay}
          >
            <Text style={styles.playText}>{playing ? 'Stop' : 'Play'}</Text>
          </Pressable>

          {/* Fixed label: the value changes every beat and must not make
              VoiceOver re-announce it. */}
          <View accessible accessibilityLabel="Bar and beat position" style={styles.positionBox}>
            <Text style={styles.position}>{position}</Text>
          </View>

          <Section title="Scenes">
            <View style={styles.sceneRow}>
              {Array.from({ length: SCENE_COUNT }, (_, i) => {
                const active = i === state.activeScene;
                return (
                  <Pressable
                    key={i}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    style={[styles.sceneBtn, active && styles.sceneBtnOn]}
                    accessibilityRole="button"
                    accessibilityLabel={`Scene ${i + 1}`}
                    accessibilityState={{ selected: active }}
                    accessibilityHint={active ? 'Current scene' : 'Switches at the next bar while playing'}
                    onPress={() => goToScene(i)}
                  >
                    <Text style={[styles.sceneText, active && styles.sceneTextOn]}>{i + 1}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.note}>
              {queuedScene !== null
                ? `Scene ${state.activeScene + 1} starts at the next bar`
                : `Scene ${state.activeScene + 1} is playing`}
            </Text>
            <Text style={styles.note}>
              Each scene remembers its drums, drone on/off and voicing, chord pad, swing, and filter movement. Tempo, drone root, outputs, fades and MIDI routing stay the same in every scene. Changes you make are saved into the current scene.
            </Text>
            <Stepper
              label="Copy this scene to scene"
              value={copyTarget}
              onChange={setCopyTarget}
              min={1}
              max={SCENE_COUNT}
              hint="Pick where to copy, then press the copy button. It replaces that scene."
            />
            <ActionButton
              label={`Copy scene ${state.activeScene + 1} to scene ${copyTarget}`}
              onPress={() => copySceneTo(copyTarget - 1)}
            />
          </Section>

          <Section title="Tempo and output">
            <Stepper label="Tempo" value={state.bpm} onChange={(v) => patch({ bpm: v })} min={40} max={200} bigStep={10} format={(v) => `${v} BPM`} />
            <Stepper label="Swing" value={state.swing} onChange={(v) => patch({ swing: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
            <Toggle label="Send MIDI" value={state.midiOut} onChange={(v) => patch({ midiOut: v })} hint="Sends to other apps as the MidiBed source" />
            <Toggle label="Built-in test sound" value={state.synthOut} onChange={(v) => patch({ synthOut: v })} hint="Turn off when another app is making the sound" />
          </Section>

          <Section title="Fades">
            <Text style={styles.note}>
              Applied when you switch a layer on or off, and when you press Play. Drone and pad fade by sending a MIDI volume control to the other synth; drums fade by getting softer. Set a time to zero for no fade.
            </Text>
            <Stepper
              label="Fade volume control number"
              value={state.fade.cc}
              onChange={(v) => patchFade({ cc: v })}
              min={0}
              max={127}
              bigStep={10}
              format={(v) => (v === 0 ? 'off' : `CC ${v}`)}
              hint="11 is expression, 7 is volume. Off means drone and pad just start and stop."
            />
            <ActionButton
              label="Send fade control test sweep"
              hint="Sweeps the fade control on the drone channel, for MIDI learn. Press Stop first."
              onPress={() => state.fade.cc > 0 && testSweep(state.drone.channel, state.fade.cc)}
            />
            <Stepper label="Drone fade in" value={state.fade.droneIn} onChange={(v) => patchFade({ droneIn: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
            <Stepper label="Drone fade out" value={state.fade.droneOut} onChange={(v) => patchFade({ droneOut: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
            <Stepper label="Pad fade in" value={state.fade.padIn} onChange={(v) => patchFade({ padIn: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
            <Stepper label="Pad fade out" value={state.fade.padOut} onChange={(v) => patchFade({ padOut: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
            <Stepper label="Drums fade in" value={state.fade.drumIn} onChange={(v) => patchFade({ drumIn: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
            <Stepper label="Drums fade out" value={state.fade.drumOut} onChange={(v) => patchFade({ drumOut: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
          </Section>

          <Section title="Sounds in the other app">
            <Text style={styles.note}>
              Sends Bank Select and Program Change so you can step through sounds from here. The receiving app must be set to respond to program changes.
            </Text>
            {state.sounds.map((sl, i) => (
              <View key={sl.name} style={styles.group}>
                <Stepper label={`${sl.name} channel`} value={sl.channel} onChange={(v) => patchSound(i, { channel: v })} min={0} max={15} format={channelText} />
                <Stepper
                  label={`${sl.name} program`}
                  value={sl.program}
                  onChange={(v) => patchSound(i, { program: v })}
                  min={0}
                  max={127}
                  bigStep={10}
                  hint="Swipe up or down to change sound. Sends immediately. Numbers match what the other app shows when it counts from zero."
                />
                {(() => {
                  const favs = parseFavorites(sl.favorites);
                  const idx = favs.indexOf(sl.program);
                  return (
                    <>
                      {favs.length > 0 && (
                        <Stepper
                          label={`${sl.name} favorite`}
                          value={idx}
                          onChange={(v) => patchSound(i, { program: favs[Math.max(0, v)] })}
                          min={-1}
                          max={favs.length - 1}
                          format={(v) => (v < 0 ? 'current program is not a favorite' : `program ${favs[v]}, ${v + 1} of ${favs.length}`)}
                          hint="Swipe up or down to step through only your favorite sounds. Sends immediately."
                        />
                      )}
                      {idx < 0 ? (
                        <ActionButton label={`Add program ${sl.program} to ${sl.name} favorites`} onPress={() => patchSoundFavorites(i, addFavorite(sl.favorites, sl.program))} />
                      ) : (
                        <ActionButton label={`Remove program ${sl.program} from ${sl.name} favorites`} onPress={() => patchSoundFavorites(i, removeFavorite(sl.favorites, sl.program))} />
                      )}
                    </>
                  );
                })()}
                <Toggle label={`${sl.name} send bank select`} value={sl.sendBank} onChange={(v) => patchSound(i, { sendBank: v })} />
                {sl.sendBank && (
                  <>
                    <Stepper label={`${sl.name} bank MSB`} value={sl.bankMSB} onChange={(v) => patchSound(i, { bankMSB: v })} min={0} max={127} />
                    <Stepper label={`${sl.name} bank LSB`} value={sl.bankLSB} onChange={(v) => patchSound(i, { bankLSB: v })} min={0} max={127} />
                  </>
                )}
                <ActionButton label={`Send ${sl.name} sound now`} onPress={() => sendSound(sl)} />
              </View>
            ))}
          </Section>

          <Section title="Drone and bass">
            <Toggle label="Drone" value={state.drone.enabled} onChange={(v) => patchDrone({ enabled: v })} />
            <Stepper label="Drone MIDI channel" value={state.drone.channel} onChange={(v) => patchDrone({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel the bass drone plays on" />
            <ActionButton label="Play drone test note" hint="Plays the drone root for a moment on the drone channel, to check routing" onPress={() => engine.sendNote(state.drone.channel, state.drone.root, state.drone.velocity, 1500)} />
            <Stepper
              label="Root note"
              value={state.drone.root}
              onChange={(v) => patchDrone({ root: v })}
              min={24}
              max={60}
              bigStep={12}
              format={noteName}
            />
            <Toggle label="Add octave" value={state.drone.octave} onChange={(v) => patchDrone({ octave: v })} />
            <Toggle label="Add fifth" value={state.drone.fifth} onChange={(v) => patchDrone({ fifth: v })} />
            <Stepper label="Drone velocity" value={state.drone.velocity} onChange={(v) => patchDrone({ velocity: v })} min={1} max={127} step={5} />
            <Stepper
              label="Retrigger every"
              value={state.drone.retriggerBars}
              onChange={(v) => patchDrone({ retriggerBars: v })}
              min={0}
              max={32}
              format={(v) => (v === 0 ? 'never' : `${v} bars`)}
            />
            <Text style={styles.note} accessibilityLabel={`Drone plays ${droneNotes(state.drone).map(noteName).join(', ')}`}>
              Plays {droneNotes(state.drone).map(noteName).join(' ')}
            </Text>
          </Section>

          <Section title="Chord pad">
            <Toggle label="Chord pad" value={state.pad.enabled} onChange={(v) => patchPad({ enabled: v })} />
            <Stepper label="Pad MIDI channel" value={state.pad.channel} onChange={(v) => patchPad({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel the chords play on. Use the drone channel to play both with one sound" />
            <Stepper
              label="Progression preset"
              value={state.pad.preset}
              onChange={choosePreset}
              min={0}
              max={PRESETS.length - 1}
              format={(v) => PRESETS[v]?.name ?? 'Custom'}
              hint="Swipe to choose a chord pattern. It follows the mode and the drone root."
            />
            <Stepper
              label="Mode"
              value={state.pad.mode}
              onChange={(v) => patchPad({ mode: v })}
              min={0}
              max={MODE_NAMES.length - 1}
              format={(v) => MODE_NAMES[v]}
              hint="The scale the chords come from, built on the drone root note."
            />
            <Stepper label="Chords in loop" value={state.pad.count} onChange={(v) => patchPad({ count: v, preset: 0 })} min={1} max={4} />
            {state.pad.degrees.slice(0, state.pad.count).map((d, i) => (
              <Stepper
                key={i}
                label={`Chord ${i + 1} scale degree`}
                value={d}
                onChange={(v) => setDegree(i, v)}
                min={1}
                max={7}
                format={(v) => `${v}, ${chordLabel(state.drone.root, state.pad.mode, v, state.pad.style)}`}
              />
            ))}
            <View accessible accessibilityLabel="Chord loop" accessibilityValue={{ text: `${padSummary}, ${state.pad.barsPerChord} bars each` }}>
              <Text style={styles.note}>{padSummary}</Text>
            </View>
            <Stepper
              label="Bars per chord"
              value={state.pad.barsPerChord}
              onChange={(v) => patchPad({ barsPerChord: v })}
              min={1}
              max={8}
              format={(v) => (v === 1 ? '1 bar' : `${v} bars`)}
            />
            <Stepper label="Chord type" value={state.pad.style} onChange={(v) => patchPad({ style: v })} min={0} max={STYLE_NAMES.length - 1} format={(v) => STYLE_NAMES[v]} />
            <Stepper label="Lowest pad note" value={state.pad.register} onChange={(v) => patchPad({ register: v })} min={36} max={72} bigStep={12} format={noteName} hint="Where the pad sits. The drone stays low." />
            <Toggle label="Smooth voice leading" value={state.pad.voiceLead} onChange={(v) => patchPad({ voiceLead: v })} hint="Each chord moves as little as possible from the last one" />
            <Toggle label="Open spread voicing" value={state.pad.spread} onChange={(v) => patchPad({ spread: v })} hint="Lifts the second note an octave. With smooth voice leading it applies to the first chord only" />
            <Stepper label="Strum" value={state.pad.strumMs} onChange={(v) => patchPad({ strumMs: v })} min={0} max={300} step={10} format={(v) => (v === 0 ? 'none' : `${v} milliseconds`)} />
            <Stepper label="Pad velocity" value={state.pad.velocity} onChange={(v) => patchPad({ velocity: v })} min={1} max={127} step={5} />
            <Stepper label="Pad humanize" value={state.pad.humanize} onChange={(v) => patchPad({ humanize: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
          </Section>

          <Section title="Filter wanderers">
            <Text style={styles.note}>
              To teach a synth which control to move: put it in MIDI learn, touch the control, then press the test sweep button here. Press Stop first so only the sweep is sent.
            </Text>
            {state.wanderers.map((w, i) => (
              <View key={w.name} style={styles.group}>
                <Toggle label={`${w.name} wander`} value={w.enabled} onChange={(v) => patchWanderer(i, { enabled: v })} />
                <Stepper label={`${w.name} CC number`} value={w.cc} onChange={(v) => patchWanderer(i, { cc: v })} min={0} max={127} bigStep={10} />
                <Stepper label={`${w.name} MIDI channel`} value={w.channel} onChange={(v) => patchWanderer(i, { channel: v })} min={0} max={15} format={channelText} />
                <ActionButton
                  label={`Send ${w.name} test sweep`}
                  hint="Sweeps this control change from zero to full and back over three seconds, for MIDI learn"
                  onPress={() => testSweep(w.channel, w.cc)}
                />
                <Stepper label={`${w.name} lowest`} value={w.min} onChange={(v) => patchWanderer(i, { min: Math.min(v, w.max) })} min={0} max={127} bigStep={10} />
                <Stepper label={`${w.name} highest`} value={w.max} onChange={(v) => patchWanderer(i, { max: Math.max(v, w.min) })} min={0} max={127} bigStep={10} />
                <Stepper label={`${w.name} speed`} value={w.speed} onChange={(v) => patchWanderer(i, { speed: v })} min={1} max={40} format={(v) => `${v} percent per second`} />
                <Stepper label={`${w.name} smoothing`} value={w.smooth} onChange={(v) => patchWanderer(i, { smooth: v })} min={1} max={100} step={5} format={(v) => `${(v / 10).toFixed(1)} seconds`} />
              </View>
            ))}
          </Section>

          {state.drums.map((d, i) => (
            <Section key={d.name} title={d.name}>
              <Toggle label={`${d.name} on`} value={d.enabled} onChange={(v) => patchDrum(i, { enabled: v })} />
              <Stepper
                label={`${d.name} note`}
                value={d.note}
                onChange={(v) => patchDrum(i, { note: v })}
                min={0}
                max={127}
                bigStep={10}
                format={drumNoteLabel}
                hint="MIDI note sent. General MIDI drum names shown where they apply."
              />
              <Stepper label={`${d.name} MIDI channel`} value={d.channel} onChange={(v) => patchDrum(i, { channel: v })} min={0} max={15} format={channelText} hint="Channel 10 is General MIDI drums." />
              <ActionButton label={`Play ${d.name} test hit`} hint="Sends this note on this channel once, to check what the other app does with it" onPress={() => engine.sendNote(d.channel, d.note, d.velocity, 200)} />
              <Stepper label={`${d.name} hits`} value={d.hits} onChange={(v) => patchDrum(i, { hits: v })} min={0} max={d.steps} />
              <Stepper
                label={`${d.name} steps`}
                value={d.steps}
                onChange={(v) => patchDrum(i, { steps: v, hits: Math.min(d.hits, v) })}
                min={2}
                max={32}
                hint="Loop length in sixteenth notes. Different lengths drift against each other."
              />
              <Stepper label={`${d.name} rotation`} value={d.rotation} onChange={(v) => patchDrum(i, { rotation: v })} min={0} max={Math.max(0, d.steps - 1)} />
              <Stepper label={`${d.name} velocity`} value={d.velocity} onChange={(v) => patchDrum(i, { velocity: v })} min={1} max={127} step={5} />
              <Stepper label={`${d.name} chance`} value={d.probability} onChange={(v) => patchDrum(i, { probability: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
              <Stepper label={`${d.name} humanize`} value={d.humanize} onChange={(v) => patchDrum(i, { humanize: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
              <View accessible accessibilityLabel={`${d.name} pattern`} accessibilityValue={{ text: describePattern(d.hits, d.steps, d.rotation) }}>
                <Text style={styles.pattern}>{patternText(d.hits, d.steps, d.rotation)}</Text>
              </View>
            </Section>
          ))}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 60 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', marginBottom: 12 },
  warn: { color: '#ffb86b', marginBottom: 12, fontSize: 15 },
  play: {
    backgroundColor: colors.on,
    borderRadius: 14,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  playText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  sceneRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sceneBtn: {
    flex: 1,
    minHeight: 56,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneBtnOn: { backgroundColor: colors.accent },
  sceneText: { color: colors.text, fontSize: 24, fontWeight: '700' },
  sceneTextOn: { color: '#000' },
  positionBox: { alignItems: 'center', marginBottom: 16 },
  position: { color: colors.accent, fontSize: 22, fontVariant: ['tabular-nums'] },
  group: { marginBottom: 10, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  note: { color: colors.dim, fontSize: 15, marginTop: 6, marginBottom: 6 },
  pattern: { color: colors.accent, fontSize: 16, fontFamily: 'Courier', marginTop: 8, letterSpacing: 1 },
});
