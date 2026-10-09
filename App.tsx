import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import {
  BedState,
  DrumState,
  FadeState,
  HarmonyState,
  LoopsState,
  MAX_JOURNEYS,
  PadState,
  SCENE_COUNT,
  SoundSlot,
  WandererState,
  addFavorite,
  copyScene,
  defaultState,
  deleteJourney,
  drumNoteLabel,
  droneChords,
  droneNotes,
  duplicateJourney,
  keyRoot,
  newJourney,
  noteName,
  padIsSteadyFifths,
  parseFavorites,
  relativeKey,
  removeFavorite,
  renameJourney,
  sceneConfigsJson,
  switchJourney,
  switchScene,
  toEngineJson,
} from './src/config';
import { MODE_NAMES, PRESETS, STYLE_NAMES, chordLabel, presetsForMode } from './src/chords';
import { ActionButton, Section, Stepper, Toggle, colors } from './src/controls';
import { describePattern, patternText } from './src/euclid';
import { engine, hasNativeEngine, onBeat, onMotion, onScene, testSweep } from './src/engine';
import {
  CONTOUR_NAMES,
  DancerState,
  PICK_NAMES,
  SCALES,
  START_NAMES,
  describePhrase,
  makePhrases,
  resolveScale,
} from './src/dancer';
import { ADVANCE_MODE_NAMES, ADVANCE_UNIT_NAMES, AdvanceRule, advanceBars, describeAdvance, pickTarget } from './src/advance';
import {
  BASS_KIND_NAMES,
  BREAKDOWN_NAMES,
  DrumBreakdown,
  MOTION_PRESET_NAMES,
  MotionNow,
  MotionRule,
  PAD_KIND_NAMES,
  describeMotion,
  motionPreset,
} from './src/motion';
import { PROFILES, ProfileRole, ccName, getProfile, profileForChannel, profileIndex, profileNoteName, stepDrumNote } from './src/profiles';
import { loadState, saveState } from './src/storage';
import { PHASE_NAMES } from './src/wander';
import {
  NOISE_COLOR_NAMES,
  NOISE_SHAPE_HINTS,
  NOISE_SHAPE_NAMES,
  RECURRING_COLOR_NAMES,
  RECURRING_VARY_NAMES,
  RECURRING_WHEN_NAMES,
  RecurringState,
  TransitionSlot,
  eighthsText,
  isLeadIn,
  recurringSpacing,
} from './src/transitions';
import { Pager } from './src/Pager';
import { TabBar, TabId, neighborTab, tabAnnouncement } from './src/tabs';

const KEEP_AWAKE_TAG = 'midibed-playing';
// Speak a short status after a user action. Kept off the main path and wrapped so a
// missing screen reader (tests, web) can never break the app.
function announceLater(message: string, delay = 400) {
  setTimeout(() => {
    try {
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      // ignore
    }
  }, delay);
}
const channelText = (v: number) => String(v + 1);
const barsText = (v: number) => (v === 0 ? 'off' : v === 1 ? '1 bar' : `${v} bars`);
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
  // Which layers are currently in their alternate state (reported by the engine).
  const [motionNow, setMotionNow] = useState<MotionNow>({ bass: false, pad: false, drums: false });
  const motionRef = useRef<MotionNow>({ bass: false, pad: false, drums: false });
  // Auto-advance news from the engine: bars left in this scene and the scene it will go to.
  const [advanceInfo, setAdvanceInfo] = useState({ barsLeft: 0, target: -1 });

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

  // Always-current copy of the settings for event handlers that outlive a render.
  const latest = useRef(state);
  latest.current = state;

  // The engine needs every scene to be able to move on by itself. A short pause avoids
  // rebuilding them on every swipe of a stepper.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => engine.setScenes(sceneConfigsJson(state)), 300);
    return () => clearTimeout(t);
  }, [state, ready]);

  useEffect(() => {
    return onScene((e) => {
      setAdvanceInfo({ barsLeft: e.barsLeft, target: e.target });
      if (e.reason === 'auto' && latest.current.activeScene !== e.index) {
        // The engine has already moved to this scene: follow it, without asking it to switch again.
        setState((s) => switchScene(s, e.index));
        if (latest.current.announce) announceLater(`Scene ${e.index + 1}`, 100);
      }
    });
  }, []);

  useEffect(() => {
    return onMotion((e) => {
      const now = { bass: e.bass, pad: e.pad, drums: e.drums };
      const prev = motionRef.current;
      motionRef.current = now;
      setMotionNow(now);
      const st = latest.current;
      if (e.reason !== 'flip' || !st.announce) return;
      const words = describeMotion(now, { bassFollows: st.drone.follow, padSteadyFifths: padIsSteadyFifths(st.pad) }, st.motion.drums.style, {
        bass: st.motion.bass.kind,
        pad: st.motion.pad.kind,
      });
      const parts: string[] = [];
      if (now.bass !== prev.bass) parts.push(words.bass);
      if (now.pad !== prev.pad) parts.push(words.pad);
      if (now.drums !== prev.drums) parts.push(words.drums);
      if (parts.length > 0) announceLater(parts.join('. '), 100);
    });
  }, []);

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
      motionRef.current = { bass: false, pad: false, drums: false };
      setMotionNow(motionRef.current);
      setAdvanceInfo({ barsLeft: 0, target: -1 });
    } else {
      engine.applyConfig(json);
      engine.start();
      setPlaying(true);
    }
  };

  // Tabs. A three-finger swipe (or the braille-keyboard equivalent) moves between them.
  const [tab, setTab] = useState<TabId>('live');
  const selectTab = (id: TabId, announce = false) => {
    setTab(id);
    if (announce) announceLater(tabAnnouncement(id), 400);
  };
  const handlePage = (direction: 'next' | 'previous') => selectTab(neighborTab(tab, direction), true);

  // VoiceOver "magic tap" (two-finger double tap, anywhere on the screen) starts or
  // stops playback. It is received by the native Pager view around the whole screen
  // (not an accessibility element, so every control inside stays reachable).
  const onMagicTap = () => {
    const stopping = playing;
    togglePlay();
    announceLater(stopping ? 'Stopped' : 'Playing', 300);
  };

  const patch = (p: Partial<BedState>) => setState((s) => ({ ...s, ...p }));

  // Device profiles: names and shortcuts for the apps being driven (src/profiles.ts).
  const drumProfile = getProfile(state.profiles.drums);
  const droneProfile = getProfile(state.profiles.drone);
  const padProfile = getProfile(state.profiles.pad);
  const loopsProfile = getProfile(state.profiles.loops);
  const fadeProfile = [droneProfile, padProfile].find((p) => p.fadeCC !== undefined);
  const patchProfile = (role: ProfileRole, id: string) =>
    setState((s) => ({ ...s, profiles: { ...s.profiles, [role]: id } }));
  const noteLabel = (n: number) => {
    const name = profileNoteName(drumProfile, n);
    return name ? `${n}, ${name}` : drumNoteLabel(n);
  };
  const slotProfile = (slotName: string) =>
    slotName === 'Bass drone' ? droneProfile : slotName === 'Percussion' ? drumProfile : padProfile;
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
    announceLater(msg, 500);
  };

  const copySceneTo = (to: number) => {
    if (to === state.activeScene) return;
    setState((s) => copyScene(s, to));
    announceLater(`Copied scene ${state.activeScene + 1} to scene ${to + 1}`, 500);
  };

  // Journeys. Switching is queued to the next bar line, like scenes; the new tempo and key
  // arrive in the same configuration. The new journey's sound choices are sent to the synths.
  const sendJourneySounds = (s: BedState) => s.sounds.forEach((slot) => sendSound(slot));
  const goToJourney = (to: number) => {
    if (to === state.activeJourney || to < 0 || to >= state.journeys.length) return;
    const next = switchJourney(state, to);
    const queued = playing && toEngineJson(next) !== json;
    queueNextApply.current = queued;
    setState(next);
    setQueuedScene(queued ? next.activeScene : null);
    sendJourneySounds(next);
    announceLater(queued ? `${next.journeyName}, starts at the next bar` : next.journeyName, 500);
  };
  const addJourney = () => {
    if (state.journeys.length >= MAX_JOURNEYS) {
      announceLater(`You can have up to ${MAX_JOURNEYS} journeys`, 300);
      return;
    }
    const next = newJourney(state);
    setState(next);
    announceLater(`New journey, ${next.journeyName}`, 500);
  };
  const copyJourney = () => {
    if (state.journeys.length >= MAX_JOURNEYS) {
      announceLater(`You can have up to ${MAX_JOURNEYS} journeys`, 300);
      return;
    }
    const next = duplicateJourney(state);
    setState(next);
    announceLater(`Copied to ${next.journeyName}`, 500);
  };
  const removeJourney = () => {
    if (state.journeys.length < 2) {
      announceLater('You need at least one journey', 300);
      return;
    }
    Alert.alert('Delete journey', `Delete ${state.journeyName} and all its scenes?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const next = deleteJourney(state);
          setState(next);
          sendJourneySounds(next);
          announceLater(`Deleted. Now ${next.journeyName}`, 500);
        },
      },
    ]);
  };
  const goRelative = () => {
    const next = relativeKey(state);
    if (next === state) return;
    setState(next);
    announceLater(`${MODE_NAMES[next.harmony.mode]}, key ${noteName(keyRoot(next)).replace(/-?\d+$/, '')}. The same chords keep playing.`, 500);
  };

  const patchFade =(p: Partial<FadeState>) => setState((s) => ({ ...s, fade: { ...s.fade, ...p } }));
  const loopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendLoopChoice = (l: LoopsState) =>
    engine.sendProgramChange(l.channel, l.program, l.sendBank ? l.bankMSB : -1, l.sendBank ? l.bankLSB : -1, true);
  // Changing the loop choice sends it right away to audition, unless the loops are
  // already playing: then the engine sends it itself (once), so it is not doubled.
  const patchLoops = (p: Partial<LoopsState>, audition = false) => {
    const next = { ...state.loops, ...p };
    setState((s) => ({ ...s, loops: { ...s.loops, ...p } }));
    if (audition) {
      if (loopTimer.current) clearTimeout(loopTimer.current);
      loopTimer.current = setTimeout(() => {
        if (!(next.enabled && playing)) sendLoopChoice(next);
      }, 200);
    }
  };
  const patchPad = (p: Partial<PadState>) => setState((s) => ({ ...s, pad: { ...s.pad, ...p } }));
  const patchMotionRule = (layer: 'bass' | 'pad', p: Partial<MotionRule>) =>
    setState((s) => ({ ...s, motion: { ...s.motion, preset: 0, [layer]: { ...s.motion[layer], ...p } } }));
  const patchTransition = (which: 'entrance' | 'drumBreak' | 'drumReturn', p: Partial<TransitionSlot>) =>
    setState((s) => ({ ...s, transitions: { ...s.transitions, [which]: { ...s.transitions[which], ...p } } }));
  const patchRecurring = (p: Partial<RecurringState>) => setState((s) => ({ ...s, recurring: { ...s.recurring, ...p } }));
  const toggleRecurringShape = (i: number, on: boolean) =>
    setState((s) => ({ ...s, recurring: { ...s.recurring, shapes: s.recurring.shapes.map((v, k) => (k === i ? on : v)) } }));
  const patchTransitionUse = (which: 'entrance' | 'drumBreak' | 'drumReturn' | 'recurring', on: boolean) =>
    setState((s) => ({ ...s, transitionUse: { ...s.transitionUse, [which]: on } }));
  const patchAdvance = (p: Partial<AdvanceRule>) => setState((s) => ({ ...s, advance: { ...s.advance, ...p } }));
  const patchBreakdown = (p: Partial<DrumBreakdown>) =>
    setState((s) => ({ ...s, motion: { ...s.motion, preset: 0, drums: { ...s.motion.drums, ...p } } }));
  const chooseMotionPreset = (idx: number) =>
    setState((s) => {
      const pr = motionPreset(idx);
      return pr ? { ...s, motion: pr } : { ...s, motion: { ...s.motion, preset: 0 } };
    });
  const patchDancer = (p: Partial<DancerState>) => setState((s) => ({ ...s, dancer: { ...s.dancer, ...p } }));
  const patchHarmony = (p: Partial<HarmonyState>) => setState((s) => ({ ...s, harmony: { ...s.harmony, ...p } }));
  // Editing the chords by hand turns the preset label into "Custom".
  const setDegree = (i: number, v: number) =>
    setState((s) => ({
      ...s,
      harmony: { ...s.harmony, preset: 0, degrees: s.harmony.degrees.map((d, k) => (k === i ? v : d)) },
    }));
  const choosePreset = (idx: number) =>
    setState((s) => {
      const pr = PRESETS[idx];
      if (idx === 0 || !pr) return { ...s, harmony: { ...s.harmony, preset: 0 } };
      const degrees = [0, 1, 2, 3].map((k) => pr.degrees[k] ?? s.harmony.degrees[k]);
      return { ...s, harmony: { ...s.harmony, preset: idx, degrees, count: pr.degrees.length } };
    });
  // What happens next in this scene. While stopped, or before the engine has said, work out the
  // target here (a random one cannot be known yet).
  const advanceTargetShown =
    advanceInfo.target >= 0
      ? advanceInfo.target
      : state.advance.mode === 3
        ? -1
        : pickTarget(state.advance, state.activeScene, state.scenes.length, 0);
  const advanceSentence = describeAdvance(
    state.advance,
    advanceBars(state.advance, state.harmony),
    advanceInfo.barsLeft,
    advanceTargetShown,
    state.frozen,
    playing,
  );
  const motionWords = describeMotion(
    motionNow,
    { bassFollows: state.drone.follow, padSteadyFifths: padIsSteadyFifths(state.pad) },
    state.motion.drums.style,
    { bass: state.motion.bass.kind, pad: state.motion.pad.kind },
  );
  const motionSummary =
    [
      state.motion.bass.baseBars > 0 ? motionWords.bass : '',
      state.motion.pad.baseBars > 0 ? motionWords.pad : '',
      state.motion.drums.baseBars > 0 ? motionWords.drums : '',
    ]
      .filter(Boolean)
      .join('. ') || 'Nothing in this scene is set to change by itself';
  const harmonySummary = state.harmony.degrees
    .slice(0, state.harmony.count)
    .map((d) => chordLabel(keyRoot(state), state.harmony.mode, d, 0))
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
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <Pager style={styles.fill} onPage={handlePage} onMagicTap={onMagicTap}>
          <View style={styles.fill}>
            <View style={styles.strip}>
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
            <View
              accessible
              accessibilityLabel="What happens next"
              accessibilityValue={{
                text: advanceSentence,
              }}
            >
              <Text style={styles.note}>{advanceSentence}</Text>
            </View>
            </View>
            <ScrollView key={tab} style={styles.fill} contentContainerStyle={styles.scroll}>
          {tab === 'live' && (
            <>
          <Section title="Journey">
            <Text style={styles.note}>
              A journey is a set of scenes with its own key, tempo and sounds. Swipe to change journey; while playing it changes at the next bar.
            </Text>
            <Stepper
              label="Journey"
              value={state.activeJourney}
              onChange={goToJourney}
              min={0}
              max={Math.max(0, state.journeys.length - 1)}
              format={(v) => (v === state.activeJourney ? state.journeyName : state.journeys[v]?.name ?? '')}
              hint="Swipe up or down to choose a journey"
            />
            <View accessible={false} style={styles.nameBox}>
              <Text style={styles.note}>Journey name</Text>
              <TextInput
                style={styles.nameInput}
                value={state.journeyName}
                onChangeText={(v) => setState((s) => renameJourney(s, v))}
                accessibilityLabel="Journey name"
                accessibilityHint="Double tap to edit the name of this journey"
                maxLength={40}
                autoCorrect={false}
                placeholderTextColor={colors.dim}
              />
            </View>
            <ActionButton label="New journey" onPress={addJourney} hint="Adds a journey with the starting scenes, in the same key and tempo" />
            <ActionButton label="Duplicate this journey" onPress={copyJourney} hint="Makes a copy of this journey with all its scenes" />
            <ActionButton label="Delete this journey" onPress={removeJourney} hint="Asks first. You always keep at least one" />
          </Section>

          <Section title="Layers">
            <Text style={styles.note}>
              Quick on and off for each part. Switching one fades it in or out using your fade times. Saved in each scene.
            </Text>
            <Toggle label="Bass drone layer" value={state.drone.enabled} onChange={(v) => patchDrone({ enabled: v })} />
            <Toggle label="Chord pad layer" value={state.pad.enabled} onChange={(v) => patchPad({ enabled: v })} />
            <Toggle
              label="Percussion layer"
              value={state.percussion}
              onChange={(v) => patch({ percussion: v })}
              hint="Turns all the drums on or off together. Each drum keeps its own setting"
            />
            <Toggle label="Loops layer" value={state.loops.enabled} onChange={(v) => patchLoops({ enabled: v })} />
            <Toggle label="MidiDancer layer" value={state.dancer.enabled} onChange={(v) => patchDancer({ enabled: v })} />
            <Toggle
              label="Freeze"
              value={state.frozen}
              onChange={(v) => patch({ frozen: v })}
              hint="Holds the bed as it is: the scene stops moving on by itself, and the breathing and the recurring sound pause. The chords and the filters keep going. Switch it off to carry on."
            />
          </Section>

          <Section title="Tempo and swing">
            <Stepper label="Tempo" value={state.bpm} onChange={(v) => patch({ bpm: v })} min={40} max={200} bigStep={10} format={(v) => `${v} BPM`} />
            <Stepper label="Swing" value={state.swing} onChange={(v) => patch({ swing: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
          </Section>

          <Section title="Scene tools">
            <Text style={styles.note}>
              Each scene remembers its drums, bass drone on/off and voicing, chord pad, harmony, swing, and filter movement. Tempo, key, outputs, fades and MIDI routing stay the same in every scene. Changes you make are saved into the current scene.
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
            <Stepper
              label="After this scene"
              value={state.advance.mode}
              onChange={(v) => patchAdvance({ mode: v })}
              min={0}
              max={ADVANCE_MODE_NAMES.length - 1}
              format={(v) => ADVANCE_MODE_NAMES[v]}
              hint="Whether this scene moves on by itself after a while. Each scene has its own setting. Freeze holds it."
            />
            {state.advance.mode > 0 && (
              <>
                <Stepper label="Move on after" value={state.advance.count} onChange={(v) => patchAdvance({ count: v })} min={1} max={64} bigStep={4} format={(v) => `${v}`} />
                <Stepper
                  label="Counted in"
                  value={state.advance.unit}
                  onChange={(v) => patchAdvance({ unit: v })}
                  min={0}
                  max={ADVANCE_UNIT_NAMES.length - 1}
                  format={(v) => ADVANCE_UNIT_NAMES[v]}
                  hint="Bars, or runs through the chord loop"
                />
                {state.advance.mode === 2 && (
                  <Stepper label="Go to scene" value={state.advance.target + 1} onChange={(v) => patchAdvance({ target: v - 1 })} min={1} max={SCENE_COUNT} />
                )}
              </>
            )}
          </Section>
            </>
          )}
          {tab === 'harmony' && (
            <>
          <Section title="Harmony">
            <Text style={styles.note}>
              The chord loop. The chord pad and the bass drone can follow it. Chords are built on the key note, in the mode you choose. The loop keeps time even if nothing is following it.
            </Text>
            <Stepper
              label="Key (root note)"
              value={state.drone.root}
              onChange={(v) => patchDrone({ root: v })}
              min={24}
              max={60}
              bigStep={12}
              format={noteName}
              hint="The key of this journey. A scene can move its home note away from it with Scene key change below."
            />
            <Stepper
              label="Scene key change"
              value={state.keyOffset}
              onChange={(v) => patch({ keyOffset: Math.max(-6, Math.min(5, v)) })}
              min={-6}
              max={5}
              format={(v) =>
                v === 0 ? 'none, home note is the key' : `${v > 0 ? 'up' : 'down'} ${Math.abs(v)} semitones, home note ${noteName(state.drone.root + v).replace(/-?\d+$/, '')}`
              }
              hint="Moves the home note for this scene only. The chords are rebuilt on it. It changes on the bar line when you switch scenes."
            />
            {(state.harmony.mode === 5 || state.harmony.mode === 0) && (
              <ActionButton
                label={state.harmony.mode === 5 ? 'Switch to the relative major, keep the chords' : 'Switch to the relative minor, keep the chords'}
                onPress={goRelative}
                hint="Moves the home note three semitones and changes the mode, and renumbers the chords so the same chords keep sounding"
              />
            )}
            {(() => {
              const options = presetsForMode(state.harmony.mode, state.harmony.preset);
              return (
                <Stepper
                  label="Progression preset"
                  value={Math.max(0, options.indexOf(state.harmony.preset))}
                  onChange={(v) => choosePreset(options[Math.max(0, Math.min(options.length - 1, v))])}
                  min={0}
                  max={options.length - 1}
                  format={(v) => PRESETS[options[v]]?.name ?? 'Custom'}
                  hint="Swipe to choose a chord pattern. Only progressions that suit the mode are listed. It follows the mode and the key."
                />
              );
            })()}
            <Stepper
              label="Mode"
              value={state.harmony.mode}
              onChange={(v) => patchHarmony({ mode: v })}
              min={0}
              max={MODE_NAMES.length - 1}
              format={(v) => MODE_NAMES[v]}
              hint="The scale the chords come from, built on the key note."
            />
            <Stepper label="Chords in loop" value={state.harmony.count} onChange={(v) => patchHarmony({ count: v, preset: 0 })} min={1} max={4} />
            {state.harmony.degrees.slice(0, state.harmony.count).map((d, i) => (
              <Stepper
                key={i}
                label={`Chord ${i + 1} scale degree`}
                value={d}
                onChange={(v) => setDegree(i, v)}
                min={1}
                max={7}
                format={(v) => `${v}, ${chordLabel(keyRoot(state), state.harmony.mode, v, 0)}`}
              />
            ))}
            <View accessible accessibilityLabel="Chord loop" accessibilityValue={{ text: `${harmonySummary}, ${state.harmony.barsPerChord} bars each` }}>
              <Text style={styles.note}>{harmonySummary}</Text>
            </View>
            <Stepper
              label="Bars per chord"
              value={state.harmony.barsPerChord}
              onChange={(v) => patchHarmony({ barsPerChord: v })}
              min={1}
              max={8}
              format={(v) => (v === 1 ? '1 bar' : `${v} bars`)}
            />
          </Section>

          <Section title="Bass drone">
            <Toggle label="Bass drone" value={state.drone.enabled} onChange={(v) => patchDrone({ enabled: v })} />
            <Stepper label="Bass drone MIDI channel" value={state.drone.channel} onChange={(v) => patchDrone({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel the bass drone plays on" />
            <ActionButton label="Play bass drone test note" hint="Plays the key note for a moment on the bass drone channel, to check routing" onPress={() => engine.sendNote(state.drone.channel, keyRoot(state), state.drone.velocity, 1500)} />
            <Toggle
              label="Bass follows chords"
              value={state.drone.follow}
              onChange={(v) => patchDrone({ follow: v })}
              hint="Off: the bass stays on the key note. On: it plays the root of each chord of the harmony, changing with the chords"
            />
            <Toggle label="Add octave" value={state.drone.octave} onChange={(v) => patchDrone({ octave: v })} />
            <Toggle
              label="Add fifth"
              value={state.drone.fifth}
              onChange={(v) => patchDrone({ fifth: v })}
              hint="For a root and fifth drone, turn this on and turn the octave off"
            />
            <Stepper label="Bass drone velocity" value={state.drone.velocity} onChange={(v) => patchDrone({ velocity: v })} min={1} max={127} step={5} />
            <Stepper
              label="Retrigger every"
              value={state.drone.retriggerBars}
              onChange={(v) => patchDrone({ retriggerBars: v })}
              min={0}
              max={32}
              format={(v) => (v === 0 ? 'never' : `${v} bars`)}
            />
            {(() => {
              const text = state.drone.follow
                ? `Follows the chords: ${droneChords(state).map((c) => c.map(noteName).join(' ')).join(', then ')}`
                : `Plays ${droneNotes({ ...state.drone, root: keyRoot(state) }).map(noteName).join(' ')}`;
              return (
                <Text style={styles.note} accessibilityLabel={text}>
                  {text}
                </Text>
              );
            })()}
          </Section>

          <Section title="MidiDancer, call and response">
            <Text style={styles.note}>
              Plays a short phrase of single notes on the key's scale (the call), then stays quiet for as many whole bars as the phrase took up, so you can repeat or answer it. Freeze does not pause it. Saved in each scene, except the channel.
            </Text>
            <Toggle label="MidiDancer" value={state.dancer.enabled} onChange={(v) => patchDancer({ enabled: v })} />
            <Stepper label="MidiDancer MIDI channel" value={state.dancer.channel} onChange={(v) => patchDancer({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel MidiDancer plays on" />
            <Stepper
              label="Scale"
              value={state.dancer.scale}
              onChange={(v) => patchDancer({ scale: v })}
              min={0}
              max={SCALES.length - 1}
              format={(v) =>
                v === 0 ? `Automatic, ${SCALES[resolveScale(0, state.harmony.mode)].name}` : SCALES[v].name
              }
              hint="Automatic picks a pentatonic scale to suit the mode. Scales with odd intervals sound best over a steady bass drone."
            />
            <Stepper label="Density" value={state.dancer.density} onChange={(v) => patchDancer({ density: v })} min={0} max={100} step={10} format={(v) => `${v} percent`} hint="How many notes in a phrase, from 2 to 10" />
            <Stepper label="Busyness" value={state.dancer.busyness} onChange={(v) => patchDancer({ busyness: v })} min={0} max={100} step={10} format={(v) => `${v} percent short notes`} hint="How many of the notes are short rather than long" />
            <Stepper label="Rests" value={state.dancer.rests} onChange={(v) => patchDancer({ rests: v })} min={0} max={100} step={10} format={(v) => `${v} percent`} hint="Chance of a gap before each note" />
            <Stepper label="Contour" value={state.dancer.contour} onChange={(v) => patchDancer({ contour: v })} min={0} max={CONTOUR_NAMES.length - 1} format={(v) => CONTOUR_NAMES[v]} />
            <Stepper label="Range" value={state.dancer.octaves} onChange={(v) => patchDancer({ octaves: v })} min={1} max={3} format={(v) => `${v} ${v === 1 ? 'octave' : 'octaves'}`} />
            <Stepper label="Register (centre note)" value={state.dancer.register} onChange={(v) => patchDancer({ register: v })} min={36} max={96} bigStep={12} format={noteName} />
            <Stepper label="MidiDancer velocity" value={state.dancer.velocity} onChange={(v) => patchDancer({ velocity: v })} min={1} max={127} bigStep={10} />
            <Stepper label="Longest phrase" value={state.dancer.maxBars} onChange={(v) => patchDancer({ maxBars: v })} min={1} max={4} format={(v) => `${v} ${v === 1 ? 'bar' : 'bars'}`} />
            <Stepper label="Phrase starts" value={state.dancer.start} onChange={(v) => patchDancer({ start: v })} min={0} max={START_NAMES.length - 1} format={(v) => START_NAMES[v]} />
            <Stepper label="Response space" value={state.dancer.spaceMult} onChange={(v) => patchDancer({ spaceMult: v })} min={1} max={4} format={(v) => (v === 1 ? 'as long as the phrase' : `${v} times the phrase`)} hint="Counted in whole bars, from the bar line before the phrase starts" />
            <Stepper label="Next phrase" value={state.dancer.pick} onChange={(v) => patchDancer({ pick: v })} min={0} max={PICK_NAMES.length - 1} format={(v) => PICK_NAMES[v]} />
            <ActionButton label="New phrases" onPress={() => patchDancer({ seed: state.dancer.seed + 1 })} hint="Makes a different set of phrases with the same settings" />
            {(() => {
              const first = makePhrases(state.dancer, state.harmony.mode, keyRoot(state))[0];
              const text = describePhrase(first, state.dancer.spaceMult);
              return (
                <Text style={styles.note} accessibilityLabel={`First phrase: ${text}`}>
                  {`First phrase: ${text}`}
                </Text>
              );
            })()}
          </Section>

          <Section title="Chord pad">
            <Toggle label="Chord pad" value={state.pad.enabled} onChange={(v) => patchPad({ enabled: v })} />
            <Stepper label="Pad MIDI channel" value={state.pad.channel} onChange={(v) => patchPad({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel the chords play on. Use the bass drone channel to play both with one sound" />
            <Toggle
              label="Pad follows chords"
              value={state.pad.follow}
              onChange={(v) => patchPad({ follow: v })}
              hint="On: plays each chord of the harmony in turn. Off: one steady chord on the key. With the Fifth only chord type, that is a fifths drone"
            />
            <Stepper label="Chord type" value={state.pad.style} onChange={(v) => patchPad({ style: v })} min={0} max={STYLE_NAMES.length - 1} format={(v) => STYLE_NAMES[v]} hint="Fifth only plays just the root and the fifth" />
            <Stepper label="Lowest pad note" value={state.pad.register} onChange={(v) => patchPad({ register: v })} min={36} max={72} bigStep={12} format={noteName} hint="Where the pad sits. The bass drone stays low." />
            <Toggle label="Smooth voice leading" value={state.pad.voiceLead} onChange={(v) => patchPad({ voiceLead: v })} hint="Each chord moves as little as possible from the last one" />
            <Toggle label="Open spread voicing" value={state.pad.spread} onChange={(v) => patchPad({ spread: v })} hint="Lifts the second note an octave. With smooth voice leading it applies to the first chord only" />
            <Stepper label="Strum" value={state.pad.strumMs} onChange={(v) => patchPad({ strumMs: v })} min={0} max={300} step={10} format={(v) => (v === 0 ? 'none' : `${v} milliseconds`)} />
            <Stepper label="Pad velocity" value={state.pad.velocity} onChange={(v) => patchPad({ velocity: v })} min={1} max={127} step={5} />
            <Stepper label="Pad humanize" value={state.pad.humanize} onChange={(v) => patchPad({ humanize: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
          </Section>
            </>
          )}
          {tab === 'rhythm' && (
            <>
          {state.drums.map((d, i) => (
            <Section key={d.name} title={d.name}>
              <Toggle label={`${d.name} on`} value={d.enabled} onChange={(v) => patchDrum(i, { enabled: v })} />
              <Stepper
                label={`${d.name} note`}
                value={d.note}
                onChange={(v) =>
                  patchDrum(i, { note: drumProfile.drumNotes ? stepDrumNote(drumProfile, d.note, v > d.note ? 1 : -1) : v })
                }
                min={0}
                max={127}
                bigStep={drumProfile.drumNotes ? undefined : 10}
                format={noteLabel}
                hint="MIDI note sent. With the General MIDI profile this steps between named drums only."
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
          <Section title="Loops">
            <Text style={styles.note}>
              For an app that plays its own loops, like DrumJam. MidiBed does not send notes here. It picks a loop, then starts and stops it. Which loop, and whether it plays, is saved in each scene. Turn on "Send MIDI clock" on the Setup tab so the loops follow this tempo.
            </Text>
            <Toggle label="Loops" value={state.loops.enabled} onChange={(v) => patchLoops({ enabled: v })} hint="Starts the loops, or stops them. While playing, a scene change does this on the next bar" />
            <Stepper label="Loops MIDI channel" value={state.loops.channel} onChange={(v) => patchLoops({ channel: v })} min={0} max={15} format={channelText} />
            <Stepper
              label="Loop program"
              value={state.loops.program}
              onChange={(v) => patchLoops({ program: v }, true)}
              min={0}
              max={127}
              bigStep={10}
              hint="Swipe up or down to choose a loop or preset. Sends right away unless the loops are playing, then it changes on the spot."
            />
            {(() => {
              const favs = parseFavorites(state.loops.favorites);
              const idx = favs.indexOf(state.loops.program);
              return (
                <>
                  {favs.length > 0 && (
                    <Stepper
                      label="Loop favorite"
                      value={idx}
                      onChange={(v) => patchLoops({ program: favs[Math.max(0, v)] }, true)}
                      min={-1}
                      max={favs.length - 1}
                      format={(v) => (v < 0 ? 'current loop is not a favorite' : `program ${favs[v]}, ${v + 1} of ${favs.length}`)}
                      hint="Step through only your favorite loops"
                    />
                  )}
                  {idx < 0 ? (
                    <ActionButton label={`Add loop program ${state.loops.program} to favorites`} onPress={() => patchLoops({ favorites: addFavorite(state.loops.favorites, state.loops.program) })} />
                  ) : (
                    <ActionButton label={`Remove loop program ${state.loops.program} from favorites`} onPress={() => patchLoops({ favorites: removeFavorite(state.loops.favorites, state.loops.program) })} />
                  )}
                </>
              );
            })()}
            <Toggle label="Loops send bank select" value={state.loops.sendBank} onChange={(v) => patchLoops({ sendBank: v }, true)} />
            {state.loops.sendBank && (
              <>
                <Stepper label="Loops bank MSB" value={state.loops.bankMSB} onChange={(v) => patchLoops({ bankMSB: v }, true)} min={0} max={127} />
                <Stepper label="Loops bank LSB" value={state.loops.bankLSB} onChange={(v) => patchLoops({ bankLSB: v }, true)} min={0} max={127} />
              </>
            )}
            <Stepper
              label="Loops start control"
              value={state.loops.startCC}
              onChange={(v) => patchLoops({ startCC: v })}
              min={0}
              max={127}
              bigStep={10}
              format={(v) => (v === 0 ? 'none' : `CC ${v}`)}
              hint="The control change that starts the loops. Use the Apps and devices profile to fill this in."
            />
            <Stepper
              label="Loops stop control"
              value={state.loops.stopCC}
              onChange={(v) => patchLoops({ stopCC: v })}
              min={0}
              max={127}
              bigStep={10}
              format={(v) => (v === 0 ? 'same as start' : `CC ${v}`)}
              hint="Zero means the start control is a play toggle and is sent again to stop."
            />
            <ActionButton
              label="Send loops start now"
              hint="Sends the start control once, to check that the other app reacts"
              onPress={() => state.loops.startCC > 0 && engine.sendControlChange(state.loops.channel, state.loops.startCC, 127, true)}
            />
            <ActionButton
              label="Send loops stop now"
              hint="Sends the stop control once"
              onPress={() => {
                const cc = state.loops.stopCC > 0 ? state.loops.stopCC : state.loops.startCC;
                if (cc > 0) engine.sendControlChange(state.loops.channel, cc, 127, true);
              }}
            />
            <ActionButton label="Send loop choice now" onPress={() => sendLoopChoice(state.loops)} />
            {state.profiles.loops === 'drumjam' && (
              <>
                <ActionButton
                  label="Shuffle loop instruments"
                  hint="DrumJam picks different instruments for the loop that is playing (control 69)"
                  onPress={() => engine.sendControlChange(state.loops.channel, 69, 127, true)}
                />
                <ActionButton
                  label="Shuffle loop variations"
                  hint="DrumJam picks different variations of the loop parts (control 70)"
                  onPress={() => engine.sendControlChange(state.loops.channel, 70, 127, true)}
                />
              </>
            )}
            <Toggle
              label="Loops use their own MIDI port"
              value={state.loops.ownPort}
              onChange={(v) => patchLoops({ ownPort: v })}
              hint="Makes a second MIDI source called MidiBed Loops. The loop choice, loop start and stop, and the MIDI clock go only there, so program changes meant for your other sounds cannot change the loops. Then in the loops app, choose MidiBed Loops as its input and switch MidiBed off"
            />
          </Section>
            </>
          )}
          {tab === 'breathe' && (
            <>
          <Section title="Breathing">
            <Text style={styles.note}>
              Lets a scene change by itself, counted in bars from the start of the scene. A layer keeps its normal setting for a while, then changes for a while, then comes back. The chords and the key never change. A scene always starts in its normal state. Each scene has its own settings.
            </Text>
            <Stepper
              label="Breathing preset"
              value={state.motion.preset}
              onChange={chooseMotionPreset}
              min={0}
              max={MOTION_PRESET_NAMES.length - 1}
              format={(v) => MOTION_PRESET_NAMES[v]}
              hint="Off, Gentle, Wide or Sparse sets all the rules below at once. Changing any rule yourself makes it Custom."
            />
            <View accessible accessibilityLabel="Right now" accessibilityValue={{ text: motionSummary }}>
              <Text style={styles.note}>{motionSummary}</Text>
            </View>
          </Section>

          <Section title="Bass breathing">
            <Stepper
              label="Bass: stay normal for"
              value={state.motion.bass.baseBars}
              onChange={(v) => patchMotionRule('bass', { baseBars: v })}
              min={0}
              max={64}
              bigStep={4}
              format={barsText}
              hint="How long the bass keeps its normal setting. Off means it never changes."
            />
            {state.motion.bass.baseBars > 0 && (
              <>
                <Stepper
                  label="Bass: what changes"
                  value={state.motion.bass.kind}
                  onChange={(v) => patchMotionRule('bass', { kind: v })}
                  min={0}
                  max={BASS_KIND_NAMES.length - 1}
                  format={(v) => BASS_KIND_NAMES[v]}
                  hint="Either it switches between following the chords and staying on the key, or it drops out completely. A drop-out eases out with the fade time, and comes back right on the beat at full strength."
                />
                <Stepper label={state.motion.bass.kind === 1 ? 'Bass: then drop out for' : 'Bass: then switch for'} value={state.motion.bass.altBars} onChange={(v) => patchMotionRule('bass', { altBars: v })} min={1} max={64} bigStep={4} format={barsText} />
                <Stepper label="Bass: chance of changing" value={state.motion.bass.chance} onChange={(v) => patchMotionRule('bass', { chance: v })} min={10} max={100} step={10} format={(v) => `${v} percent`} hint="At 100 it always changes on time. Lower, and sometimes it stays as it is for another round." />
              </>
            )}
          </Section>

          <Section title="Pad breathing">
            <Stepper
              label="Pad: stay normal for"
              value={state.motion.pad.baseBars}
              onChange={(v) => patchMotionRule('pad', { baseBars: v })}
              min={0}
              max={64}
              bigStep={4}
              format={barsText}
              hint="How long the pad keeps its normal setting. Off means it never changes."
            />
            {state.motion.pad.baseBars > 0 && (
              <>
                <Stepper
                  label="Pad: what changes"
                  value={state.motion.pad.kind}
                  onChange={(v) => patchMotionRule('pad', { kind: v })}
                  min={0}
                  max={PAD_KIND_NAMES.length - 1}
                  format={(v) => PAD_KIND_NAMES[v]}
                  hint="Either it switches to a steady fifths drone, or it drops out completely. A drop-out eases out with the fade time, and comes back right on the beat at full strength."
                />
                <Stepper label={state.motion.pad.kind === 1 ? 'Pad: then drop out for' : 'Pad: then fifths for'} value={state.motion.pad.altBars} onChange={(v) => patchMotionRule('pad', { altBars: v })} min={1} max={64} bigStep={4} format={barsText} />
                <Stepper label="Pad: chance of changing" value={state.motion.pad.chance} onChange={(v) => patchMotionRule('pad', { chance: v })} min={10} max={100} step={10} format={(v) => `${v} percent`} />
              </>
            )}
          </Section>

          <Section title="Drum breathing">
            <Stepper
              label="Drums: play for"
              value={state.motion.drums.baseBars}
              onChange={(v) => patchBreakdown({ baseBars: v })}
              min={0}
              max={64}
              bigStep={4}
              format={barsText}
              hint="How long the drums play normally before a breakdown. Off means no breakdowns."
            />
            {state.motion.drums.baseBars > 0 && (
              <>
                <Stepper label="Drums: then break down for" value={state.motion.drums.breakBars} onChange={(v) => patchBreakdown({ breakBars: v })} min={1} max={32} format={barsText} />
                <Stepper label="Drums: chance of breaking down" value={state.motion.drums.chance} onChange={(v) => patchBreakdown({ chance: v })} min={10} max={100} step={10} format={(v) => `${v} percent`} />
                <Stepper label="Breakdown style" value={state.motion.drums.style} onChange={(v) => patchBreakdown({ style: v })} min={0} max={BREAKDOWN_NAMES.length - 1} format={(v) => BREAKDOWN_NAMES[v]} hint="Full takes every drum out. Light takes out the kick and snare. Kick only leaves just the kick. They ease out with the drum fade time and come back right on the beat at full strength." />
              </>
            )}
          </Section>

          <Section title="Transitions in this scene">
            <Text style={styles.note}>
              The transition sounds themselves are set once, on the Sound tab. Here you choose whether this scene uses each one. A sound that is switched off on the Sound tab stays off everywhere.
            </Text>
            <Toggle label="Scene start sound in this scene" value={state.transitionUse.entrance} onChange={(v) => patchTransitionUse('entrance', v)} hint="Plays as this scene starts" />
            <Toggle label="Drums break sound in this scene" value={state.transitionUse.drumBreak} onChange={(v) => patchTransitionUse('drumBreak', v)} hint="Plays as the drums drop out in a breakdown" />
            <Toggle label="Drums return sound in this scene" value={state.transitionUse.drumReturn} onChange={(v) => patchTransitionUse('drumReturn', v)} hint="Plays as the drums come back" />
            <Toggle label="Recurring sound in this scene" value={state.transitionUse.recurring} onChange={(v) => patchTransitionUse('recurring', v)} hint="The sound that comes round every so many bars or at the end of each chord loop" />
          </Section>
            </>
          )}
          {tab === 'sound' && (
            <>
          <Section title="Filter wanderers">
            <Text style={styles.note}>
              To teach a synth which control to move: put it in MIDI learn, touch the control, then press the test sweep button here. Press Stop first so only the sweep is sent.
            </Text>
            {state.wanderers.map((w, i) => (
              <View key={w.name} style={styles.group}>
                <Toggle label={`${w.name} wander`} value={w.enabled} onChange={(v) => patchWanderer(i, { enabled: v })} />
                {(() => {
                  const prof = profileForChannel(state, w.channel);
                  const idx = prof.ccs.findIndex((c) => c.cc === w.cc);
                  return prof.ccs.length > 0 ? (
                    <Stepper
                      label={`${w.name} target control`}
                      value={idx}
                      onChange={(v) => patchWanderer(i, { cc: prof.ccs[Math.max(0, v)].cc })}
                      min={-1}
                      max={prof.ccs.length - 1}
                      format={(v) => (v < 0 ? `custom, CC ${w.cc}` : `${prof.ccs[v].name}, CC ${prof.ccs[v].cc}`)}
                      hint={`Controls known for ${prof.name}. Swipe to choose what this wanderer moves.`}
                    />
                  ) : null;
                })()}
                <Stepper
                  label={`${w.name} CC number`}
                  value={w.cc}
                  onChange={(v) => patchWanderer(i, { cc: v })}
                  min={0}
                  max={127}
                  bigStep={10}
                  format={(v) => {
                    const name = ccName(profileForChannel(state, w.channel), v);
                    return name ? `${v}, ${name}` : String(v);
                  }}
                />
                <Stepper label={`${w.name} MIDI channel`} value={w.channel} onChange={(v) => patchWanderer(i, { channel: v })} min={0} max={15} format={channelText} />
                <ActionButton
                  label={`Send ${w.name} test sweep`}
                  hint="Sweeps this control change from zero to full and back over three seconds, for MIDI learn"
                  onPress={() => testSweep(w.channel, w.cc)}
                />
                <Stepper label={`${w.name} lowest`} value={w.min} onChange={(v) => patchWanderer(i, { min: Math.min(v, w.max) })} min={0} max={127} bigStep={10} />
                <Stepper label={`${w.name} highest`} value={w.max} onChange={(v) => patchWanderer(i, { max: Math.max(v, w.min) })} min={0} max={127} bigStep={10} />
                <Stepper
                  label={`${w.name} cycle`}
                  value={w.cycleBars}
                  onChange={(v) => patchWanderer(i, { cycleBars: v })}
                  min={1}
                  max={64}
                  bigStep={4}
                  format={(v) => (v === 1 ? '1 bar' : `${v} bars`)}
                  hint="How many bars one full sweep takes. Different lengths on different filters drift against each other and line up now and then."
                />
                <ActionButton
                  label={`Match ${w.name} to the chord loop`}
                  hint="Sets the cycle to exactly one run through the chords"
                  onPress={() => patchWanderer(i, { cycleBars: Math.max(1, Math.min(64, state.harmony.barsPerChord * state.harmony.count)) })}
                />
                <Stepper
                  label={`${w.name} looseness`}
                  value={w.looseness}
                  onChange={(v) => patchWanderer(i, { looseness: v })}
                  min={0}
                  max={100}
                  step={10}
                  format={(v) => (v === 0 ? '0 percent, a clean regular cycle' : v === 100 ? '100 percent, free wandering' : `${v} percent`)}
                  hint="Zero is a regular rise and fall. One hundred wanders freely. In between is a regular breath with a random wobble."
                />
                <Stepper
                  label={`${w.name} starts`}
                  value={w.phase}
                  onChange={(v) => patchWanderer(i, { phase: v })}
                  min={0}
                  max={3}
                  format={(v) => PHASE_NAMES[v]}
                  hint="Where in its cycle it starts at the beginning of a scene. Stagger two filters so they do not move together."
                />
                <Stepper
                  label={`${w.name} smoothing`}
                  value={w.smoothBeats}
                  onChange={(v) => patchWanderer(i, { smoothBeats: v })}
                  min={1}
                  max={16}
                  format={(v) => (v === 1 ? '1 beat' : `${v} beats`)}
                />
                <Stepper
                  label={`${w.name} moves against`}
                  value={w.opposes}
                  onChange={(v) => {
                    // skip over itself, and stay inside the list
                    let next = v === i ? (v > w.opposes ? v + 1 : v - 1) : v;
                    next = Math.max(-1, Math.min(state.wanderers.length - 1, next));
                    patchWanderer(i, { opposes: next === i ? -1 : next });
                  }}
                  min={-1}
                  max={state.wanderers.length - 1}
                  format={(v) => (v < 0 ? 'nothing' : state.wanderers[v]?.name ?? 'nothing')}
                  hint="Moves the opposite way to another filter, so the whole mix does not get brighter and darker at the same time."
                />
                {w.opposes >= 0 && (
                  <Stepper label={`${w.name} opposition`} value={w.opposeAmount} onChange={(v) => patchWanderer(i, { opposeAmount: v })} min={10} max={100} step={10} format={(v) => `${v} percent`} />
                )}
              </View>
            ))}
          </Section>

          <Section title="Fades">
            <Text style={styles.note}>
              Applied when you switch a layer on or off, and when you press Play. Bass drone and pad fade by sending a MIDI volume control to the other synth; drums fade by getting softer. Set a time to zero for no fade.
            </Text>
            <Stepper
              label="Fade volume control number"
              value={state.fade.cc}
              onChange={(v) => patchFade({ cc: v })}
              min={0}
              max={127}
              bigStep={10}
              format={(v) => (v === 0 ? 'off' : `CC ${v}`)}
              hint="11 is expression, 7 is volume. Off means bass drone and pad just start and stop."
            />
            <ActionButton
              label="Send fade control test sweep"
              hint="Sweeps the fade control on the bass drone channel, for MIDI learn. Press Stop first."
              onPress={() => state.fade.cc > 0 && testSweep(state.drone.channel, state.fade.cc)}
            />
            <Stepper label="Bass drone fade in" value={state.fade.droneIn} onChange={(v) => patchFade({ droneIn: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
            <Stepper label="Bass drone fade out" value={state.fade.droneOut} onChange={(v) => patchFade({ droneOut: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
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
                {(() => {
                  const prof = slotProfile(sl.name);
                  return prof.favorites && sl.favorites !== prof.favorites ? (
                    <ActionButton label={`Load ${prof.name} favorites into ${sl.name}`} onPress={() => patchSoundFavorites(i, prof.favorites as string)} />
                  ) : null;
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

          <Section title="Transition sounds">
            <Text style={styles.note}>
              Sounds made inside MidiBed from noise, to mark a change. A lead-in (Wave, Wind) starts before the change and rises into it. Thunder, Boom and Crash play on the change itself. These settings are the same in every scene; each scene can switch them off on the Breathe tab. They play through MidiBed's own sound, even when the built-in test sound is off, and their level is set here in MidiBed. Noise sounds are much louder than the Boom at the same level, so they usually need a lower setting.
            </Text>
            <Stepper
              label="Shortest lead-in"
              value={state.transitionMinEighths}
              onChange={(v) => patch({ transitionMinEighths: v })}
              min={0}
              max={8}
              format={eighthsText}
              hint="If a lead-in has less time than this before the change, it is skipped and only its falling sound plays on the beat. Wave plays its falling half, Wind plays a Crash."
            />
          </Section>

          {([
            ['entrance', 'Scene start', 'Plays when a scene starts, timed to the bar line. Switching scenes while playing waits for the next bar.'],
            ['drumBreak', 'Drums break', 'Plays as the drums drop out in a breakdown. A lead-in rises into the moment they drop.'],
            ['drumReturn', 'Drums return', 'Plays as the drums come back from a breakdown, so a lead-in rises into the kick on the downbeat.'],
          ] as const).map(([which, word, about]) => {
            const t = state.transitions[which];
            return (
              <Section key={which} title={`${word} sound`}>
                <Text style={styles.note}>{about}</Text>
                <Toggle label={`${word} sound`} value={t.on} onChange={(v) => patchTransition(which, { on: v })} />
                {t.on && (
                  <>
                    <Stepper
                      label={`${word}: shape`}
                      value={t.shape}
                      onChange={(v) => patchTransition(which, { shape: v })}
                      min={0}
                      max={NOISE_SHAPE_NAMES.length - 1}
                      format={(v) => NOISE_SHAPE_NAMES[v]}
                      hint={NOISE_SHAPE_HINTS[t.shape]}
                    />
                    <Stepper label={`${word}: noise colour`} value={t.color} onChange={(v) => patchTransition(which, { color: v })} min={0} max={NOISE_COLOR_NAMES.length - 1} format={(v) => NOISE_COLOR_NAMES[v]} hint="White is bright, pink is balanced, brown is deep" />
                    <Stepper
                      label={isLeadIn(t.shape) ? `${word}: rises over` : `${word}: lasts`}
                      value={t.beats}
                      onChange={(v) => patchTransition(which, { beats: v })}
                      min={1}
                      max={32}
                      bigStep={4}
                      format={(v) => (v === 1 ? '1 beat' : `${v} beats`)}
                    />
                    <Stepper label={`${word}: level`} value={t.level} onChange={(v) => patchTransition(which, { level: v })} min={5} max={100} step={5} format={(v) => `${v} percent`} />
                    <ActionButton
                      label={`Hear the ${word.toLowerCase()} sound`}
                      hint="Plays it once now, so you can judge the shape, colour and level"
                      onPress={() => engine.playTransitionNow(t.shape, t.color, t.beats, t.level / 100)}
                    />
                  </>
                )}
              </Section>
            );
          })}

          <Section title="Recurring sound">
            <Text style={styles.note}>
              A sound that comes round now and then inside a scene: every few bars, or at the end of each chord loop. It skips the first loop of a scene, which is where the scene start sound belongs. The settings are the same in every scene; each scene can switch it off on the Breathe tab. If the rise is longer than the gap between sounds, a later sound joins its sweep part-way.
            </Text>
            <Toggle label="Recurring sound" value={state.recurring.on} onChange={(v) => patchRecurring({ on: v })} />
            {state.recurring.on && (
              <>
                <Stepper label="Recurring: when" value={state.recurring.when} onChange={(v) => patchRecurring({ when: v })} min={0} max={RECURRING_WHEN_NAMES.length - 1} format={(v) => RECURRING_WHEN_NAMES[v]} hint="Either every so many bars, or at the end of each run through the chords" />
                {state.recurring.when === 0 ? (
                  <Stepper label="Recurring: every" value={state.recurring.everyBars} onChange={(v) => patchRecurring({ everyBars: v })} min={1} max={64} bigStep={4} format={(v) => (v === 1 ? '1 bar' : `${v} bars`)} />
                ) : (
                  <View accessible accessibilityLabel="Chord loop length" accessibilityValue={{ text: `${recurringSpacing(state.recurring, state.harmony)} bars` }}>
                    <Text style={styles.note}>The chord loop is {recurringSpacing(state.recurring, state.harmony)} bars long.</Text>
                  </View>
                )}
                <Stepper label="Recurring: chance" value={state.recurring.chance} onChange={(v) => patchRecurring({ chance: v })} min={10} max={100} step={10} format={(v) => `${v} percent`} hint="At 100 it plays every time. Lower, and it sometimes lets a turn pass." />
                <Stepper label="Recurring: variety" value={state.recurring.vary} onChange={(v) => patchRecurring({ vary: v })} min={0} max={RECURRING_VARY_NAMES.length - 1} format={(v) => RECURRING_VARY_NAMES[v]} />
                {state.recurring.vary === 0 ? (
                  <Stepper label="Recurring: shape" value={state.recurring.shape} onChange={(v) => patchRecurring({ shape: v })} min={0} max={NOISE_SHAPE_NAMES.length - 1} format={(v) => NOISE_SHAPE_NAMES[v]} hint={NOISE_SHAPE_HINTS[state.recurring.shape]} />
                ) : (
                  NOISE_SHAPE_NAMES.map((name, i) => (
                    <Toggle key={name} label={`Recurring: use ${name}`} value={state.recurring.shapes[i]} onChange={(v) => toggleRecurringShape(i, v)} hint={NOISE_SHAPE_HINTS[i]} />
                  ))
                )}
                <Stepper label="Recurring: colour choice" value={state.recurring.colorMode} onChange={(v) => patchRecurring({ colorMode: v })} min={0} max={RECURRING_COLOR_NAMES.length - 1} format={(v) => RECURRING_COLOR_NAMES[v]} />
                {state.recurring.colorMode === 0 && (
                  <Stepper label="Recurring: noise colour" value={state.recurring.color} onChange={(v) => patchRecurring({ color: v })} min={0} max={NOISE_COLOR_NAMES.length - 1} format={(v) => NOISE_COLOR_NAMES[v]} />
                )}
                <Stepper label="Recurring: length" value={state.recurring.beats} onChange={(v) => patchRecurring({ beats: v })} min={1} max={32} bigStep={4} format={(v) => (v === 1 ? '1 beat' : `${v} beats`)} hint="One length for every shape. Lead-ins rise over this long; the others last this long." />
                <Stepper label="Recurring: level" value={state.recurring.level} onChange={(v) => patchRecurring({ level: v })} min={5} max={100} step={5} format={(v) => `${v} percent`} />
                <ActionButton
                  label="Hear the recurring sound"
                  hint="Plays one now, with the first shape you have ticked or chosen"
                  onPress={() => {
                    const r = state.recurring;
                    const shape = r.vary === 0 ? r.shape : Math.max(0, r.shapes.findIndex(Boolean));
                    engine.playTransitionNow(shape, r.colorMode === 1 ? 1 : r.color, r.beats, r.level / 100);
                  }}
                />
              </>
            )}
          </Section>
            </>
          )}
          {tab === 'setup' && (
            <>
          <Section title="Output">
            <Toggle label="Announce breathing changes" value={state.announce} onChange={(v) => patch({ announce: v })} hint="Speaks a short message when a bass, pad or drum change happens by itself" />
            <Toggle label="Send MIDI" value={state.midiOut} onChange={(v) => patch({ midiOut: v })} hint="Sends to other apps as the MidiBed source" />
            <Toggle label="Send MIDI clock" value={state.clock} onChange={(v) => patch({ clock: v })} hint="Lets other apps, like DrumJam, follow this tempo while playing" />
            <Toggle
              label="Keep the clock running while stopped"
              value={state.clockAlways}
              onChange={(v) => patch({ clockAlways: v })}
              hint="Keeps sending the clock when MidiBed is stopped, so an app like DrumJam stays locked to the tempo and starts cleanly when you press Play. Only while this app is open"
            />
            <Toggle
              label="Also send MIDI Start and Stop"
              value={state.clockTransport}
              onChange={(v) => patch({ clockTransport: v })}
              hint="Off: only the clock is sent, so an app that follows it is started and stopped by the loop controls instead. On: Play and Stop also send MIDI Start and Stop messages"
            />
            <Toggle label="Built-in test sound" value={state.synthOut} onChange={(v) => patch({ synthOut: v })} hint="Turn off when another app is making the sound" />
          </Section>

          <Section title="Apps and devices">
            <Text style={styles.note}>
              Tell MidiBed which app each part is sent to. It then shows real names and offers shortcuts. It works the same with no profile chosen.
            </Text>
            {(
              [
                ['drums', 'Drums app', drumProfile],
                ['drone', 'Bass drone app', droneProfile],
                ['pad', 'Chord pad app', padProfile],
                ['loops', 'Loops app', loopsProfile],
              ] as const
            ).map(([role, label, prof]) => (
              <View key={role} style={styles.group}>
                <Stepper
                  label={`${label} profile`}
                  value={profileIndex(state.profiles[role])}
                  onChange={(v) => patchProfile(role, PROFILES[v].id)}
                  min={0}
                  max={PROFILES.length - 1}
                  format={(v) => PROFILES[v].name}
                />
                <Text style={styles.note}>{prof.about}</Text>
              </View>
            ))}
            {droneProfile.mono && (state.drone.octave || state.drone.fifth) && (
              <ActionButton
                label="Bass drone app plays one note: use a single bass note"
                hint="Turns off the octave and the fifth"
                onPress={() => patchDrone({ octave: false, fifth: false })}
              />
            )}
            {loopsProfile.loopControls &&
              (state.loops.startCC !== loopsProfile.loopControls.startCC || state.loops.stopCC !== loopsProfile.loopControls.stopCC) && (
                <ActionButton
                  label={`Use ${loopsProfile.name} loop controls, start CC ${loopsProfile.loopControls.startCC}, stop CC ${loopsProfile.loopControls.stopCC}`}
                  onPress={() => patchLoops({ startCC: loopsProfile.loopControls?.startCC ?? 0, stopCC: loopsProfile.loopControls?.stopCC ?? 0 })}
                />
              )}
            {fadeProfile?.fadeCC !== undefined && state.fade.cc !== fadeProfile.fadeCC && (
              <ActionButton
                label={`Use ${fadeProfile.name} volume control, CC ${fadeProfile.fadeCC}, for fades`}
                onPress={() => patchFade({ cc: fadeProfile.fadeCC as number })}
              />
            )}
          </Section>
            </>
          )}
            </ScrollView>
            <TabBar selected={tab} onSelect={(id) => selectTab(id)} />
          </View>
        </Pager>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  strip: { paddingHorizontal: 16, paddingTop: 8 },
  scroll: { padding: 16, paddingBottom: 60 },
  nameBox: { marginBottom: 8 },
  nameInput: {
    color: colors.text,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    fontSize: 17,
  },
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
