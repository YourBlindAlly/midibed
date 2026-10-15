import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  applyFavorite,
  defaultState,
  deleteJourney,
  drumNoteLabel,
  droneChords,
  droneNotes,
  padChords,
  duplicateJourney,
  keyRoot,
  newJourney,
  noteName,
  padIsSteadyFifths,
  parseFavorites,
  relativeKey,
  removeFavorite,
  renameJourney,
  renameScene,
  sceneLabel,
  SCENE_COPY_PARTS,
  copyScenePart,
  sceneConfigsJson,
  slotProfileId,
  switchJourney,
  switchScene,
  toEngineJson,
} from './src/config';
import { Favorite, addFav, favLabel, favsFor, removeFav, sameFavorite } from './src/soundFavs';
import { SCENE_CHANGE_NAMES, nextSceneChangeAt, sceneChangeWhen } from './src/sceneChange';
import { FILTER_FOCUS_NAMES, FILTER_PRESETS, filterSummary, filterTargetsJson, focusIncludes, hzToCc, moduleChannels, nextFilterFocus, nextFilterPreset } from './src/filters';
import { collapseAll, expandAll, parseSectionUi, toggleSection } from './src/sectionui';
import { ENDING_FADE_NAMES, STOP_STYLE_NAMES, barsLeftText, endingJson, endingSentence, nextStopStyle } from './src/ending';
import { DELAY_NOTES, FxPart, FxPartState, panText, uglyFxJson } from './src/uglyfx';
import { BASS_PARAMS, BASS_PRESETS, BassParamDef, applyBassPreset, bassVoiceJson, paramText, setBassParam } from './src/bassvoice';
import { DRUM_TYPES, drumTuneText, drumVoicesJson } from './src/drumvoice';
import { FillState, describeFill, fillPalette } from './src/fill';
import { LAYER_NAMES, Layer, SHORTCUT_HELP, ShortcutAction, actionForKey } from './src/shortcuts';
import { MIDI_ACTIONS, assignTrigger, clearTrigger, describeMidi, describeTrigger, holdArmed, idForMidi, isDoublePress, isToggleAction, parseDoubleMap, parseHoldMap, parseMidiMap, setDouble, setHold, triggerKey } from './src/midicontrol';
import { levelText, mixerMessages } from './src/mixer';
import { MODE_NAMES, PRESETS, STYLE_NAMES, chordLabel, presetsForMode } from './src/chords';
import { ActionButton, Section, SectionUiContext, Stepper, Toggle, colors } from './src/controls';
import { describePattern, patternText } from './src/euclid';
import { engine, hasNativeEngine, onBeat, onEnded, onEnding, onMidiIn, onMotion, onScene, testSweep } from './src/engine';
import {
  CONTOUR_NAMES,
  DANCER_MODE_NAMES,
  DancerState,
  VIBRATO_MODE_NAMES,
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
import {
  ProfileRole,
  addCustomApp,
  allProfiles,
  ccName,
  getProfile,
  parseCustomApps,
  profileForChannel,
  profileIndex,
  profileNoteName,
  removeCustomApp,
  setCustomApps,
  stepDrumNote,
} from './src/profiles';
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
const fxPercent = (v: number) => (v === 0 ? 'off' : `${v} percent`);
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
  const [newAppName, setNewAppName] = useState('');
  // Names being typed for a new sound favorite, per sound slot.
  const [favNames, setFavNames] = useState<Record<number, string>>({});
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
        if (latest.current.announce) announceLater(sceneLabel(latest.current, e.index), 100);
      }
    });
  }, []);

  useEffect(() => {
    const offEnding = onEnding((e) => setEndingBars(e.reason === 'end' ? 0 : e.barsLeft));
    const offEnded = onEnded(() => {
      setPlaying(false);
      setPosition('1.1');
      motionRef.current = { bass: false, pad: false, drums: false };
      setMotionNow(motionRef.current);
      setAdvanceInfo({ barsLeft: 0, target: -1 });
      setEndingBars(null);
      if (latest.current.announce) announceLater('Ended', 100);
    });
    return () => {
      offEnding();
      offEnded();
    };
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
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') engine.reclaimKeys();
    });
    return () => sub.remove();
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

  // An orchestrated stop that is waiting: null = none, else the bars left (-1 = not known yet).
  const [endingBars, setEndingBars] = useState<number | null>(null);

  const resetAfterStop = () => {
    setPlaying(false);
    setPosition('1.1');
    motionRef.current = { bass: false, pad: false, drums: false };
    setMotionNow(motionRef.current);
    setAdvanceInfo({ barsLeft: 0, target: -1 });
    setEndingBars(null);
  };

  /** Start, stop, or set an ending (the chosen type of stop). Returns what to say. */
  const togglePlay = (): string => {
    if (playing) {
      const style = latest.current.ending.style;
      if (style > 0 && endingBars === null) {
        engine.requestEnd(endingJson(latest.current.ending));
        setEndingBars(-1);
        return endingSentence(style);
      }
      // No ending chosen, or one is already waiting: stop at once.
      engine.stop();
      resetAfterStop();
      return 'Stopped';
    }
    engine.applyConfig(json);
    engine.start();
    setPlaying(true);
    sendMixerLevels();
    return 'Playing';
  };

  // Tabs. A three-finger swipe (or the braille-keyboard equivalent) moves between them.
  const [tab, setTab] = useState<TabId>('live');
  const selectTab = (id: TabId, announce = false) => {
    setTab(id);
    engine.reclaimKeys();
    if (announce) announceLater(tabAnnouncement(id), 400);
  };
  const handlePage = (direction: 'next' | 'previous') => selectTab(neighborTab(tab, direction), true);

  // VoiceOver "magic tap" (two-finger double tap, anywhere on the screen) starts or
  // stops playback. It is received by the native Pager view around the whole screen
  // (not an accessibility element, so every control inside stays reachable).
  const onMagicTap = () => {
    announceLater(togglePlay(), 300);
  };

  const patch = (p: Partial<BedState>) => setState((s) => ({ ...s, ...p }));


  // Device profiles: names and shortcuts for the apps being driven (src/profiles.ts).
  const drumProfile = getProfile(state.profiles.drums);
  const droneProfile = getProfile(state.profiles.drone);
  const padProfile = getProfile(state.profiles.pad);
  const loopsProfile = getProfile(state.profiles.loops);
  const fadeProfile = [droneProfile, padProfile].find((p) => p.fadeCC !== undefined);
  setCustomApps(parseCustomApps(state.customApps));
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
    const msg = queued ? `${sceneLabel(next, to)}, ${sceneChangeWhen(state.sceneChangeAt)}` : sceneLabel(next, to);
    announceLater(msg, 500);
  };

  const [copyWhat, setCopyWhat] = useState(0);
  const copySceneTo = (to: number) => {
    if (to === state.activeScene) return;
    setState((s) => copyScenePart(s, to, copyWhat));
    const what = copyWhat === 0 ? 'scene' : SCENE_COPY_PARTS[copyWhat].toLowerCase();
    announceLater(`Copied ${what} from scene ${state.activeScene + 1} to scene ${to + 1}`, 500);
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

  const patchFxPart = (p: FxPart, change: Partial<FxPartState>) =>
    setState((s) => ({ ...s, fx: { ...s.fx, [p]: { ...s.fx[p], ...change } } }));
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
  const patchFill = (p: Partial<FillState>) => setState((s) => ({ ...s, fill: { ...s.fill, ...p } }));
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

  // An app that switches banks with MSB only (the J6) is not sent a bank LSB at all.
  const sendSound = (slot: SoundSlot) => {
    const usesLSB = getProfile(slotProfileId(latest.current, slot.name)).bankUsesLSB !== false;
    const s = latest.current;
    const channel = slot.name === 'Bass drone' ? s.drone.channel : slot.name === 'Percussion' ? (s.drums[0]?.channel ?? 9) : s.pad.channel;
    engine.sendProgramChange(channel, slot.program, slot.sendBank ? slot.bankMSB : -1, slot.sendBank && usesLSB ? slot.bankLSB : -1);
  };

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

  // The built-in drum sounds: send each drum's type and settings whenever they change.
  const drumVoicesText = drumVoicesJson(state.drums);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => engine.setDrumVoices(drumVoicesText), 80);
    return () => clearTimeout(t);
  }, [drumVoicesText, ready]);

  // The built-in bass voice: send its on/off and settings whenever they change (and at Play).
  const bassJson = bassVoiceJson(state.bassVoice);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => engine.setBassVoice(bassJson), 80);
    return () => clearTimeout(t);
  }, [bassJson, ready]);

  // The built-in effects (Ugly FX): send the settings whenever they or the tempo change (the delay follows the tempo).
  const fxJson = uglyFxJson(state.fx, state.bpm);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => engine.setFX(fxJson), 80);
    return () => clearTimeout(t);
  }, [fxJson, ready]);

  // Filter presets: the built-in sound gets the full preset (low-pass, high-pass or band-pass). Another app can only
  // be moved on its cutoff and resonance (CC 74 and 71), so only the low-pass presets reach it, in a few small steps
  // over the glide time. (This is a control gesture, not musical timing: the engine does not depend on it.)
  const filterJson = filterTargetsJson(state);
  useEffect(() => {
    if (!ready) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t0 = setTimeout(() => {
      engine.setFilter(filterJson);
      const st = latest.current;
      const preset = FILTER_PRESETS[Math.max(0, Math.min(FILTER_PRESETS.length - 1, st.filterPreset))];
      if (preset.mode !== 1) return;
      const cutoff = hzToCc(preset.hz);
      const reso = Math.round(Math.max(0, Math.min(1, preset.res / 100)) * 127);
      const steps = 8;
      const glideMs = (Math.max(0, st.filterGlide) * 60000) / Math.max(30, st.bpm);
      moduleChannels(st).forEach((chs, part) => {
        if (!focusIncludes(st.filterFocus, part)) return;
        chs.forEach((ch) => {
          for (let i = 1; i <= steps; i++) {
            timers.push(
              setTimeout(() => {
                engine.sendControlChange(ch, 74, Math.round(cutoff), false);
                engine.sendControlChange(ch, 71, reso, false);
              }, (glideMs * i) / steps),
            );
          }
        });
      });
    }, 80);
    return () => {
      clearTimeout(t0);
      timers.forEach(clearTimeout);
    };
  }, [filterJson, state.filterPreset, state.filterFocus, state.filterGlide, state.bpm, ready]);

  // Mixer: send every part's level as a volume control (only when 'Send levels' is on).
  const sendMixerLevels = () => {
    const s = latest.current;
    mixerMessages(s, getProfile(s.profiles.loops).loopVolumeCC).forEach((m) =>
      engine.sendControlChange(m.channel, m.cc, m.value, m.loops),
    );
  };
  const mixerKey = JSON.stringify([
    state.mixer,
    state.drone.channel,
    state.pad.channel,
    state.dancer.channel,
    state.drums.map((d) => d.channel),
    state.loops.channel,
    state.profiles.loops,
  ]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(sendMixerLevels, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixerKey, ready]);

  // Keyboard shortcuts (see src/shortcuts.ts). The same key twice within a moment counts once.
  const lastKey = useRef({ key: '', at: 0 });
  const onShortcutKey = (key: string, shift = false) => {
    setLastKeyText(`${shift ? key.toUpperCase() : key}${shift ? ' (capital or shift)' : ''}`);
    if (!state.shortcuts) return;
    const now = Date.now();
    if (key === lastKey.current.key && now - lastKey.current.at < 150) return;
    lastKey.current = { key, at: now };
    let action = actionForKey(key, shift);
    if (!action) return;
    // O arms a solo: the next layer key solos that layer instead of switching it.
    if (action.type === 'layer' && now - soloArmedAt.current < 2500) {
      soloArmedAt.current = 0;
      action = { type: 'solo', layer: action.layer };
    }
    runAction(action);
  };

  // Perform one action (from a key, or from a MIDI controller).
  const runAction = (action: ShortcutAction) => {
    const now = Date.now();
    const sceneCount = state.scenes.length;
    switch (action.type) {
      case 'scene':
        if (action.index < sceneCount) goToScene(action.index);
        break;
      case 'nextScene':
        goToScene((state.activeScene + 1) % sceneCount);
        break;
      case 'prevScene':
        goToScene((state.activeScene + sceneCount - 1) % sceneCount);
        break;
      case 'nextJourney':
        goToJourney((state.activeJourney + 1) % state.journeys.length);
        break;
      case 'prevJourney':
        goToJourney((state.activeJourney + state.journeys.length - 1) % state.journeys.length);
        break;
      case 'playStop':
        onMagicTap();
        break;
      case 'solo':
        setSolo(state.solo === action.layer ? null : action.layer);
        break;
      case 'armSolo':
        soloArmedAt.current = now;
        announceLater('Solo: press a part key', 100);
        break;
      case 'clearSolo':
        setSolo(null);
        break;
      case 'freeze':
        patch({ frozen: !state.frozen });
        announceLater(state.frozen ? 'Unfrozen' : 'Frozen', 150);
        break;
      case 'panic':
        engine.panic();
        announceLater('All notes off', 150);
        break;
      case 'fill':
        engine.playFill();
        announceLater('Fill', 100);
        break;
      case 'filterHold':
        patch({ filterHold: !state.filterHold });
        announceLater(state.filterHold ? 'Filters moving' : 'Filters held', 150);
        break;
      case 'filterPreset': {
        const next = nextFilterPreset(state.filterPreset);
        patch({ filterPreset: next });
        announceLater(`Filter: ${FILTER_PRESETS[next].name}`, 150);
        break;
      }
      case 'sceneChangeAt': {
        const next = nextSceneChangeAt(state.sceneChangeAt);
        patch({ sceneChangeAt: next });
        announceLater(`Scenes change at: ${SCENE_CHANGE_NAMES[next].toLowerCase()}`, 150);
        break;
      }
      case 'filterFocus': {
        const next = nextFilterFocus(state.filterFocus);
        patch({ filterFocus: next });
        announceLater(`Filter goes to: ${FILTER_FOCUS_NAMES[next].toLowerCase()}`, 150);
        break;
      }
      case 'stopStyle': {
        const next = nextStopStyle(state.ending.style);
        patch({ ending: { ...state.ending, style: next } });
        announceLater(`Stop style: ${STOP_STYLE_NAMES[next]}`, 100);
        break;
      }
      case 'layer': {
        const name = LAYER_NAMES[action.layer];
        let on: boolean;
        if (action.layer === 'bass') {
          on = !state.drone.enabled;
          patchDrone({ enabled: on });
        } else if (action.layer === 'pad') {
          on = !state.pad.enabled;
          patchPad({ enabled: on });
        } else if (action.layer === 'dancer') {
          on = !state.dancer.enabled;
          patchDancer({ enabled: on });
        } else if (action.layer === 'drums') {
          on = !state.percussion;
          patch({ percussion: on });
        } else {
          on = !state.loops.enabled;
          patchLoops({ enabled: on });
        }
        announceLater(`${name} ${on ? 'on' : 'off'}`, 150);
        break;
      }
    }
  };

  // ---- MIDI controller (a foot pedal): learn a message for an action, then run it when it arrives.
  const [learnIdx, setLearnIdx] = useState(0);
  const [learning, setLearning] = useState(false);
  const learningRef = useRef<string | null>(null);
  const [lastMidiText, setLastMidiText] = useState('none yet');
  const runActionRef = useRef(runAction);
  runActionRef.current = runAction;
  const lastPressRef = useRef<{ id: string; at: number } | null>(null);
  // Buttons that have sent a release (a pedal in Momentary mode), and the hold timers running now.
  const releaseSeenRef = useRef<Set<string>>(new Set());
  const holdTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    return onMidiIn((m) => {
      setLastMidiText(describeMidi(m));
      const s = latest.current;
      if (learningRef.current) {
        const id = learningRef.current;
        if (m.kind !== 'pc' && m.value === 0) return; // wait for the press, not the release
        learningRef.current = null;
        setLearning(false);
        setState((st) => ({ ...st, midiControl: { ...st.midiControl, map: assignTrigger(st.midiControl.map, id, m) } }));
        announceLater(`Learned ${describeMidi(m)}`, 100);
        return;
      }
      if (!s.midiControl.enabled) return;
      // A release (a button let go): remember that this pedal sends them, and stop any hold being timed.
      if (m.kind !== 'pc' && m.value === 0) {
        if (s.midiControl.channel < 0 || m.channel === s.midiControl.channel) {
          const key = triggerKey(m);
          releaseSeenRef.current.add(key);
          if (holdTimersRef.current[key]) {
            clearTimeout(holdTimersRef.current[key]);
            delete holdTimersRef.current[key];
          }
        }
        return;
      }
      const id = idForMidi(s.midiControl.map, m, s.midiControl.channel);
      const def = id ? MIDI_ACTIONS.find((a) => a.id === id) : undefined;
      if (!id || !def) return;
      // A quick second press of a button that has a double press does that instead of repeating the press.
      // The first press already ran at once (nothing waits to see whether a second one follows). If the
      // first press was an on/off toggle, the second puts it back first, so the double press leaves no mark.
      const dbl = parseDoubleMap(s.midiControl.double)[id];
      const now = Date.now();
      const last = lastPressRef.current;
      if (dbl && isDoublePress(last, id, now, s.midiControl.doubleMs)) {
        lastPressRef.current = null;
        const second = MIDI_ACTIONS.find((a) => a.id === dbl);
        if (isToggleAction(def.action)) runActionRef.current(def.action);
        if (second) runActionRef.current(second.action);
        return;
      }
      lastPressRef.current = dbl ? { id, at: now } : null;
      runActionRef.current(def.action);
      // Holding the button: if it is still down after the hold time, put a toggle back and do the hold action.
      const holdId = parseHoldMap(s.midiControl.hold)[id];
      const key = triggerKey(m);
      if (holdId && holdArmed(true, releaseSeenRef.current.has(key))) {
        if (holdTimersRef.current[key]) clearTimeout(holdTimersRef.current[key]);
        holdTimersRef.current[key] = setTimeout(() => {
          delete holdTimersRef.current[key];
          const held = MIDI_ACTIONS.find((a) => a.id === holdId);
          lastPressRef.current = null;
          if (isToggleAction(def.action)) runActionRef.current(def.action);
          if (held) runActionRef.current(held.action);
        }, s.midiControl.holdMs);
      }
    });
  }, []);

  // ---- Parts tab helpers
  const PARTS = ['bass', 'pad', 'dancer', 'drums', 'loops'] as const;
  const [partIdx, setPartIdx] = useState(0);
  // Which drum's settings the Drums module shows (one at a time).
  const [drumIdx, setDrumIdx] = useState(0);
  const sectionUi = parseSectionUi(state.sectionUi);
  const sectionUiValue = {
    ui: sectionUi,
    toggle: (id: string) => setState((s) => ({ ...s, sectionUi: JSON.stringify(toggleSection(parseSectionUi(s.sectionUi), id)) })),
  };
  const part = PARTS[partIdx];
  const partName = LAYER_NAMES[part];
  const partRole: ProfileRole | null = part === 'bass' ? 'drone' : part === 'pad' ? 'pad' : part === 'drums' ? 'drums' : part === 'loops' ? 'loops' : null;
  const partProfile = partRole ? getProfile(state.profiles[partRole]) : getProfile('none');
  const soundSlot: number | undefined = part === 'bass' ? 0 : part === 'drums' ? 1 : part === 'pad' ? 2 : undefined;
  const partChannelsOf = (p: (typeof PARTS)[number]): number[] =>
    p === 'bass' ? [state.drone.channel] : p === 'pad' ? [state.pad.channel] : p === 'dancer' ? [state.dancer.channel] : p === 'drums' ? state.drums.map((d) => d.channel) : [state.loops.channel];
  const onThisPart = (channel: number) => partChannelsOf(part).includes(channel);
  const anyPartChannel = (channel: number) => PARTS.some((p) => partChannelsOf(p).includes(channel));
  const partIsOn =
    part === 'bass' ? state.drone.enabled : part === 'pad' ? state.pad.enabled : part === 'dancer' ? state.dancer.enabled : part === 'drums' ? state.percussion : state.loops.enabled;
  const setPartOn = (p: (typeof PARTS)[number], on: boolean) => {
    if (p === 'bass') patchDrone({ enabled: on });
    else if (p === 'pad') patchPad({ enabled: on });
    else if (p === 'dancer') patchDancer({ enabled: on });
    else if (p === 'drums') patch({ percussion: on });
    else patchLoops({ enabled: on });
  };
  // Switching a part's output off or on: a short pause for the new setting to reach the engine, then all notes off, so
  // nothing hangs on one side and the bass and pad start again on the other.
  const setPartOutput = (p: (typeof PARTS)[number], change: Partial<{ midi: boolean; synth: boolean }>) => {
    setState((s) => ({ ...s, outputs: { ...s.outputs, [p]: { ...s.outputs[p], ...change } } }));
    setTimeout(() => engine.panic(), 200);
  };
  const setSolo = (layer: Layer | null) => {
    setState((s) => ({ ...s, solo: layer }));
    announceLater(layer ? `Solo ${LAYER_NAMES[layer]}` : 'Solo cleared', 150);
  };
  const [lastKeyText, setLastKeyText] = useState('none yet');
  const soloArmedAt = useRef(0);

  const renderWanderer = (w: WandererState, i: number) => (
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
  );

  const renderSlot = (sl: SoundSlot, i: number) => (
              <View key={sl.name} style={styles.group}>
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
                  const appId = slotProfileId(state, sl.name);
                  const appName = getProfile(appId).name;
                  const usesLSB = getProfile(appId).bankUsesLSB !== false;
                  const favs = favsFor(state.soundFavs, appId);
                  const current: Favorite = { name: '', program: sl.program, sendBank: sl.sendBank, bankMSB: sl.bankMSB, bankLSB: usesLSB ? sl.bankLSB : 0 };
                  const idx = favs.findIndex((f) => sameFavorite(f, current));
                  return (
                    <>
                      {favs.length > 0 && (
                        <Stepper
                          label={`${sl.name} favorite`}
                          value={idx}
                          onChange={(v) => {
                            const f = favs[Math.max(0, Math.min(favs.length - 1, v))];
                            if (!f) return;
                            const next = applyFavorite(state, i, f);
                            setState(next);
                            sendSound(next.sounds[i]);
                          }}
                          min={-1}
                          max={favs.length - 1}
                          format={(v) => (v < 0 ? 'current sound is not a favorite' : `${favLabel(favs[v], usesLSB)}, ${v + 1} of ${favs.length}`)}
                          hint={`Swipe up or down to step through your ${appName} favorites, with their banks. Sends immediately.`}
                        />
                      )}
                      {idx < 0 ? (
                        <>
                          <View style={styles.nameBox}>
                            <Text style={styles.note}>Favorite name (optional)</Text>
                            <TextInput
                              style={styles.nameInput}
                              value={favNames[i] ?? ''}
                              onChangeText={(v) => setFavNames((n) => ({ ...n, [i]: v }))}
                              accessibilityLabel={`${sl.name} favorite name`}
                              accessibilityHint="Optional. Type a name, then use the add button"
                              maxLength={40}
                              autoCorrect={false}
                              placeholderTextColor={colors.dim}
                              onBlur={() => engine.reclaimKeys()}
                            />
                          </View>
                          <ActionButton
                            label={`Add this sound to ${appName} favorites`}
                            hint={`Saves ${favLabel(current, usesLSB)}, with its bank, under ${appName}`}
                            onPress={() => {
                              setState((s) => ({ ...s, soundFavs: addFav(s.soundFavs, appId, { ...current, name: (favNames[i] ?? '').trim() }) }));
                              setFavNames((n) => ({ ...n, [i]: '' }));
                              announceLater(`Saved to ${appName} favorites`, 300);
                            }}
                          />
                        </>
                      ) : (
                        <ActionButton
                          label={`Remove this sound from ${appName} favorites`}
                          onPress={() => {
                            setState((s) => ({ ...s, soundFavs: removeFav(s.soundFavs, appId, current) }));
                            announceLater(`Removed from ${appName} favorites`, 300);
                          }}
                        />
                      )}
                    </>
                  );
                })()}
                <Toggle label={`${sl.name} send bank select`} value={sl.sendBank} onChange={(v) => patchSound(i, { sendBank: v })} />
                {sl.sendBank && (
                  <>
                    <Stepper label={`${sl.name} bank MSB`} value={sl.bankMSB} onChange={(v) => patchSound(i, { bankMSB: v })} min={0} max={127} />
                    {getProfile(slotProfileId(state, sl.name)).bankUsesLSB !== false && (
                      <Stepper label={`${sl.name} bank LSB`} value={sl.bankLSB} onChange={(v) => patchSound(i, { bankLSB: v })} min={0} max={127} />
                    )}
                  </>
                )}
                <ActionButton label={`Send ${sl.name} sound now`} onPress={() => sendSound(sl)} />
              </View>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <Pager style={styles.fill} onPage={handlePage} onMagicTap={onMagicTap} onKey={onShortcutKey}>
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
            accessibilityLabel={playing ? (endingBars !== null ? 'Stop now' : 'Stop') : 'Play'}
            onPress={() => {
              const said = togglePlay();
              if (said !== 'Stopped' && said !== 'Playing') announceLater(said, 300);
            }}
          >
            <Text style={styles.playText}>{playing ? (endingBars !== null ? 'Stop now' : 'Stop') : 'Play'}</Text>
          </Pressable>

          {/* Fixed label: the value changes every beat and must not make
              VoiceOver re-announce it. */}
          <View accessible accessibilityLabel="Bar and beat position" style={styles.positionBox}>
            <Text style={styles.position}>{position}</Text>
          </View>
          {playing && endingBars !== null && endingBars > 0 && (
            <View accessible accessibilityLabel="Ending" accessibilityValue={{ text: barsLeftText(endingBars) }}>
              <Text style={styles.note}>{barsLeftText(endingBars)}</Text>
            </View>
          )}

            <View style={styles.sceneRow}>
              {Array.from({ length: SCENE_COUNT }, (_, i) => {
                const active = i === state.activeScene;
                return (
                  <Pressable
                    key={i}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    style={[styles.sceneBtn, active && styles.sceneBtnOn]}
                    accessibilityRole="button"
                    accessibilityLabel={sceneLabel(state, i)}
                    accessibilityState={{ selected: active }}
                    accessibilityHint={active ? 'Current scene' : 'Switches at the next bar while playing'}
                    onPress={() => goToScene(i)}
                  >
                    <Text style={[styles.sceneText, active && styles.sceneTextOn]}>{i + 1}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Toggle
              label="Freeze"
              value={state.frozen}
              onChange={(v) => patch({ frozen: v })}
              hint="Holds the bed as it is: the scene stops moving on by itself, and the breathing and the recurring sound pause. The chords and the filters keep going. Switch it off to carry on."
            />
            <Text style={styles.note}>
              {queuedScene !== null
                ? `${sceneLabel(state, state.activeScene)} ${sceneChangeWhen(state.sceneChangeAt)}`
                : `${sceneLabel(state, state.activeScene)} is playing`}
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
            <SectionUiContext.Provider value={sectionUiValue}>
            <ScrollView key={tab} style={styles.fill} contentContainerStyle={styles.scroll}>
          <ActionButton label="Collapse all sections" hint="Closes every group on this screen, so you can open just the ones you want" onPress={() => patch({ sectionUi: JSON.stringify(collapseAll) })} />
          <ActionButton label="Expand all sections" onPress={() => patch({ sectionUi: JSON.stringify(expandAll) })} />
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
                onBlur={() => engine.reclaimKeys()}
              />
            </View>
            <ActionButton label="New journey" onPress={addJourney} hint="Adds a journey with the starting scenes, in the same key and tempo" />
            <ActionButton label="Duplicate this journey" onPress={copyJourney} hint="Makes a copy of this journey with all its scenes" />
            <ActionButton label="Delete this journey" onPress={removeJourney} hint="Asks first. You always keep at least one" />
          </Section>

          <Section title="Layers" fixed>
            <ActionButton
              label="All notes off"
              hint="Ends every sounding note on every MIDI port, for a stuck note. If it is playing, the bass and pad start again straight away"
              onPress={() => {
                engine.panic();
                announceLater('All notes off', 300);
              }}
            />
            <Text style={styles.note}>
              Quick on and off for each part, and solo to hear one part alone. Switching one fades it in or out using your fade times. On and off is saved in each scene; solo is never saved.
            </Text>
            <Toggle label="Bass drone layer" value={state.drone.enabled} onChange={(v) => patchDrone({ enabled: v })} />
            <Toggle label="Solo bass drone" value={state.solo === 'bass'} onChange={(v) => setSolo(v ? 'bass' : null)} hint="Hear only the bass drone. The others fade out and come back when you clear the solo" />
            <Toggle label="Chord pad layer" value={state.pad.enabled} onChange={(v) => patchPad({ enabled: v })} />
            <Toggle label="Solo chord pad" value={state.solo === 'pad'} onChange={(v) => setSolo(v ? 'pad' : null)} />
            <Toggle label="MidiDancer layer" value={state.dancer.enabled} onChange={(v) => patchDancer({ enabled: v })} />
            <Toggle label="Solo MidiDancer" value={state.solo === 'dancer'} onChange={(v) => setSolo(v ? 'dancer' : null)} />
            <Toggle
              label="Percussion layer"
              value={state.percussion}
              onChange={(v) => patch({ percussion: v })}
              hint="Turns all the drums on or off together. Each drum keeps its own setting"
            />
            <Toggle label="Solo drums" value={state.solo === 'drums'} onChange={(v) => setSolo(v ? 'drums' : null)} />
            <Toggle label="Loops layer" value={state.loops.enabled} onChange={(v) => patchLoops({ enabled: v })} />
            <Toggle label="Solo loops" value={state.solo === 'loops'} onChange={(v) => setSolo(v ? 'loops' : null)} />
          </Section>

          <Section title="Filters">
            <Text style={styles.note}>{filterSummary(state)}{state.filterHold ? ', held' : ''}</Text>
            <Toggle
              label="Hold the filters"
              value={state.filterHold}
              onChange={(v) => patch({ filterHold: v })}
              hint="The filters stay where they are. Switch off to let them move on from there. The W key does the same"
            />
            <Toggle
              label="Filter movement"
              value={state.filterMove}
              onChange={(v) => patch({ filterMove: v })}
              hint="Off: the filter wanderers do not move in this scene. Saved with the scene"
            />
            <Stepper
              label="Filter preset"
              value={state.filterPreset}
              onChange={(v) => patch({ filterPreset: v })}
              min={0}
              max={FILTER_PRESETS.length - 1}
              format={(v) => FILTER_PRESETS[v].name}
              hint="Parks the filter in one place. Wandering is the normal moving filter. The V key goes to the next one. Saved with the scene"
            />
            <Stepper
              label="Filter preset goes to"
              value={state.filterFocus}
              onChange={(v) => patch({ filterFocus: v })}
              min={0}
              max={FILTER_FOCUS_NAMES.length - 1}
              format={(v) => FILTER_FOCUS_NAMES[v]}
              hint="The whole mix, or just one module. The G key goes to the next one"
            />
            <Stepper
              label="Filter glide"
              value={state.filterGlide}
              onChange={(v) => patch({ filterGlide: v })}
              min={0}
              max={16}
              format={(v) => (v === 0 ? 'at once' : `${v} ${v === 1 ? 'beat' : 'beats'}`)}
              hint="How long a preset takes to arrive"
            />
          </Section>

          <Section title="Changing scenes">
            <Stepper
              label="Scenes change at"
              value={state.sceneChangeAt}
              onChange={(v) => patch({ sceneChangeAt: v })}
              min={0}
              max={SCENE_CHANGE_NAMES.length - 1}
              format={(v) => SCENE_CHANGE_NAMES[v]}
              hint="When a scene or journey you ask for while playing takes over. The end of the scene follows the scene's own length if it has one, otherwise the end of the progression. The Y key changes this"
            />
          </Section>

          <Section title="Ending">
            <Stepper
              label="Stop style"
              value={state.ending.style}
              onChange={(v) => patch({ ending: { ...state.ending, style: v } })}
              min={0}
              max={3}
              format={(v) => STOP_STYLE_NAMES[v] ?? ''}
              hint="What the Stop button, the magic tap and the S key do. Press stop again while an ending is waiting to stop at once. The T key changes this"
            />
            <Stepper
              label="Ending shape"
              value={state.ending.fade}
              onChange={(v) => patch({ ending: { ...state.ending, fade: v } })}
              min={0}
              max={2}
              format={(v) => ENDING_FADE_NAMES[v] ?? ''}
            />
            <Toggle
              label="Final kick on the last downbeat"
              value={state.ending.finalHit}
              onChange={(v) => patch({ ending: { ...state.ending, finalHit: v } })}
            />
            <Toggle
              label="Ending noise on the last downbeat"
              value={state.ending.noise}
              onChange={(v) => patch({ ending: { ...state.ending, noise: v } })}
            />
            <Stepper
              label="Ending noise sound"
              value={state.ending.noiseShape}
              onChange={(v) => patch({ ending: { ...state.ending, noiseShape: v } })}
              min={0}
              max={4}
              format={(v) => NOISE_SHAPE_NAMES[v] ?? ''}
            />
            <Stepper
              label="Ending noise level"
              value={state.ending.noiseLevel}
              onChange={(v) => patch({ ending: { ...state.ending, noiseLevel: v } })}
              min={0}
              max={100}
              step={5}
              format={(v) => `${v} percent`}
            />
          </Section>

          <Section title="Tempo and swing">
            <Stepper label="Tempo" value={state.bpm} onChange={(v) => patch({ bpm: v })} min={40} max={200} bigStep={10} format={(v) => `${v} BPM`} />
            <Stepper label="Swing" value={state.swing} onChange={(v) => patch({ swing: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
          </Section>

            </>
          )}
          {tab === 'parts' && (
            <>
          <Section title="Part" fixed>
            <Text style={styles.note}>
              Choose a part. Every part shows the same headings in the same order: where it goes, sound, level and fade, what it plays, how it moves. Breathing, the chords and the key are on the Scene tab.
            </Text>
            <Stepper
              label="Part"
              value={partIdx}
              onChange={(v) => setPartIdx(Math.max(0, Math.min(PARTS.length - 1, v)))}
              min={0}
              max={PARTS.length - 1}
              format={(v) => LAYER_NAMES[PARTS[v]]}
              hint="Swipe up or down to choose which part's settings are shown below"
            />
            <Toggle label={`${partName} on`} value={partIsOn} onChange={(v) => setPartOn(part, v)} />
            <Toggle
              label={`Solo ${partName}`}
              value={state.solo === part}
              onChange={(v) => setSolo(v ? part : null)}
              hint="Hear only this part while you work on it. Not saved"
            />
          </Section>

          <Section title={`${partName}: where it goes`}>
            {part === 'bass' && (
              <Stepper label="Bass drone MIDI channel" value={state.drone.channel} onChange={(v) => patchDrone({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel the bass drone plays on. Its sound changes go to the same channel" />
            )}
            {part === 'pad' && (
              <Stepper label="Pad MIDI channel" value={state.pad.channel} onChange={(v) => patchPad({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel the chords play on. Use the bass drone channel to play both with one sound" />
            )}
            {part === 'dancer' && (
              <Stepper label="MidiDancer MIDI channel" value={state.dancer.channel} onChange={(v) => patchDancer({ channel: v })} min={0} max={15} format={channelText} hint="Which MIDI channel MidiDancer plays on" />
            )}
            {part === 'loops' && (
              <Stepper label="Loops MIDI channel" value={state.loops.channel} onChange={(v) => patchLoops({ channel: v })} min={0} max={15} format={channelText} />
            )}
            {part === 'drums' && (
              <Text style={styles.note}>Each drum has its own note and channel, in its own section under what it plays, below.</Text>
            )}
            <Toggle
              label={`${partName}: send to other apps`}
              value={state.outputs[part].midi}
              onChange={(v) => setPartOutput(part, { midi: v })}
              hint="Off: this part is not sent out as MIDI, so other apps do not hear it"
            />
            {part !== 'loops' && (
              <Toggle
                label={`${partName}: play in the built-in sound`}
                value={state.outputs[part].synth}
                onChange={(v) => setPartOutput(part, { synth: v })}
                hint="Off: MidiBed's own sound does not play this part. The Built-in test sound switch on the Setup tab silences all of it"
              />
            )}
          </Section>

          <Section title={`${partName}: what it plays`}>
            {part === 'bass' && (
              <>
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
              </>
            )}
            {part === 'pad' && (
              <>
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
              </>
            )}
            {part === 'dancer' && (
              <>
                <Text style={styles.note}>
                  Plays short phrases of single notes on the key's scale. In call and response it plays a phrase, then stays quiet for as many whole bars as the phrase took up, so you can repeat or answer it. In solo mode it keeps playing by itself. Freeze does not pause it. Saved in each scene, except the channel.
                </Text>
                <Stepper
                  label="MidiDancer mode"
                  value={state.dancer.mode}
                  onChange={(v) => patchDancer({ mode: v })}
                  min={0}
                  max={DANCER_MODE_NAMES.length - 1}
                  format={(v) => DANCER_MODE_NAMES[v]}
                  hint="Call and response leaves space for you to answer. Solo plays by itself, so you can take a break."
                />
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
            <Stepper label="Legato" value={state.dancer.legato} onChange={(v) => patchDancer({ legato: v })} min={0} max={100} step={10} format={(v) => (v === 0 ? 'none, notes are separate' : v === 100 ? 'full, each note holds into the next' : `${v} percent joined`)} hint="Joins notes that follow straight on from one another, so a mono or sampled sound connects them instead of breathing between them" />
            <Stepper label="Humanize" value={state.dancer.humanize} onChange={(v) => patchDancer({ humanize: v })} min={0} max={100} step={10} format={(v) => (v === 0 ? 'none' : `${v} percent`)} hint="Varies how hard each note is played, with a gentle swell across the phrase, like breath pressure" />
            <Stepper label="Vibrato depth" value={state.dancer.vibratoDepth} onChange={(v) => patchDancer({ vibratoDepth: v })} min={0} max={100} step={5} format={(v) => (v === 0 ? 'off' : `${v} cents`)} hint="A gentle wobble in the pitch, like a flute player's. Zero is off" />
            {state.dancer.vibratoDepth > 0 && (
              <>
                <Stepper label="Vibrato rate" value={state.dancer.vibratoRate} onChange={(v) => patchDancer({ vibratoRate: v })} min={10} max={100} step={5} format={(v) => `${(v / 10).toFixed(1)} hertz`} />
                <Stepper label="Vibrato delay" value={state.dancer.vibratoDelay} onChange={(v) => patchDancer({ vibratoDelay: v })} min={0} max={1500} step={50} bigStep={250} format={(v) => (v === 0 ? 'none' : `${v} milliseconds`)} hint="How long after a note starts the vibrato begins" />
                <Stepper label="Vibrato sent as" value={state.dancer.vibratoMode} onChange={(v) => patchDancer({ vibratoMode: v })} min={0} max={VIBRATO_MODE_NAMES.length - 1} format={(v) => VIBRATO_MODE_NAMES[v]} hint="Pitch bend works with any sound. Mod wheel lets a sound that has its own vibrato do it" />
              </>
            )}
            <Stepper label="Pitch bend range of the sound" value={state.dancer.bendRange} onChange={(v) => patchDancer({ bendRange: v })} min={1} max={24} format={(v) => `${v} ${v === 1 ? 'semitone' : 'semitones'}`} hint="Set this to the pitch bend range of the receiving sound. Two is the usual default" />
            <Stepper label="Bend chance" value={state.dancer.bendChance} onChange={(v) => patchDancer({ bendChance: v })} min={0} max={100} step={10} format={(v) => `${v} percent of notes`} />
            <Stepper label="Scoop up from" value={state.dancer.scoop} onChange={(v) => patchDancer({ scoop: v })} min={0} max={400} step={10} bigStep={50} format={(v) => (v === 0 ? 'off' : `${v} cents below`)} hint="A note starts below its pitch and slides up into it" />
            {state.dancer.scoop > 0 && (
              <Stepper label="Scoop time" value={state.dancer.scoopTime} onChange={(v) => patchDancer({ scoopTime: v })} min={30} max={500} step={10} bigStep={50} format={(v) => `${v} milliseconds`} />
            )}
            <Stepper label="Fall off by" value={state.dancer.fall} onChange={(v) => patchDancer({ fall: v })} min={0} max={600} step={10} bigStep={50} format={(v) => (v === 0 ? 'off' : `${v} cents`)} hint="The last note of a phrase drops in pitch as it ends, before a rest. It never happens in the middle of a joined run" />
            {state.dancer.fall > 0 && (
              <Stepper label="Fall time" value={state.dancer.fallTime} onChange={(v) => patchDancer({ fallTime: v })} min={30} max={600} step={10} bigStep={50} format={(v) => `${v} milliseconds`} />
            )}
            <Stepper label="Dip on long notes" value={state.dancer.dip} onChange={(v) => patchDancer({ dip: v })} min={0} max={300} step={10} bigStep={50} format={(v) => (v === 0 ? 'off' : `${v} cents`)} hint="A long note, a beat and a half or more, occasionally sags down in pitch partway through and comes back" />
            {state.dancer.dip > 0 && (
              <>
                <Stepper label="Dip chance" value={state.dancer.dipChance} onChange={(v) => patchDancer({ dipChance: v })} min={10} max={100} step={10} format={(v) => `${v} percent of long notes`} />
                <Stepper label="Dip time" value={state.dancer.dipTime} onChange={(v) => patchDancer({ dipTime: v })} min={50} max={600} step={10} bigStep={50} format={(v) => `${v} milliseconds each way`} />
              </>
            )}
            <Stepper label="Longest phrase" value={state.dancer.maxBars} onChange={(v) => patchDancer({ maxBars: v })} min={1} max={4} format={(v) => `${v} ${v === 1 ? 'bar' : 'bars'}`} />
            <Stepper label="Phrase starts" value={state.dancer.start} onChange={(v) => patchDancer({ start: v })} min={0} max={START_NAMES.length - 1} format={(v) => START_NAMES[v]} />
            {state.dancer.mode === 0 ? (
              <Stepper label="Response space" value={state.dancer.spaceMult} onChange={(v) => patchDancer({ spaceMult: v })} min={1} max={4} format={(v) => (v === 1 ? 'as long as the phrase' : `${v} times the phrase`)} hint="Counted in whole bars, from the bar line before the phrase starts" />
            ) : (
              <>
                <Stepper label="Rest between phrases" value={state.dancer.restBars} onChange={(v) => patchDancer({ restBars: v })} min={0} max={4} format={(v) => (v === 0 ? 'none, the next phrase follows straight on' : v === 1 ? '1 bar' : `${v} bars`)} hint="Whole bars of quiet after each phrase" />
                <Stepper label="Thin out over time" value={state.dancer.thin} onChange={(v) => patchDancer({ thin: v })} min={0} max={100} step={10} format={(v) => (v === 0 ? 'none, always the same density' : `${v} percent sparser at the quietest`)} hint="Use with the next phrase set to back and forth: it moves between sparse and busy phrases" />
                <Toggle label="Carry on through scene changes" value={state.dancer.carryOn} onChange={(v) => patchDancer({ carryOn: v })} hint="On: keeps playing across a scene change, in the new scene's key and scale. Off: starts again on the new scene's first bar" />
              </>
            )}
            <Stepper label="Next phrase" value={state.dancer.pick} onChange={(v) => patchDancer({ pick: v })} min={0} max={PICK_NAMES.length - 1} format={(v) => PICK_NAMES[v]} />
            <ActionButton label="New phrases" onPress={() => patchDancer({ seed: state.dancer.seed + 1 })} hint="Makes a different set of phrases with the same settings" />
            {(() => {
              const first = makePhrases(state.dancer, state.harmony.mode, keyRoot(state))[0];
              const text = describePhrase(first, state.dancer.spaceMult, state.dancer.mode, state.dancer.restBars);
              return (
                <Text style={styles.note} accessibilityLabel={`First phrase: ${text}`}>
                  {`First phrase: ${text}`}
                </Text>
              );
            })()}
              </>
            )}
            {part === 'drums' && (
              <Text style={styles.note}>
                Each drum is its own section below, with its note, channel and pattern. The master Percussion layer switch is on the Live tab and at the top of this page.
              </Text>
            )}
            {part === 'loops' && (
              <Text style={styles.note}>The loop settings follow, in the next section.</Text>
            )}
          </Section>

          {part === 'drums' && (
            <>
          <Section title="Drum" fixed>
            <Stepper
              label="Drum"
              value={Math.min(drumIdx, state.drums.length - 1)}
              onChange={(v) => setDrumIdx(Math.max(0, Math.min(state.drums.length - 1, v)))}
              min={0}
              max={state.drums.length - 1}
              format={(v) => `${state.drums[v].name}${state.drums[v].enabled ? '' : ', off'}`}
              hint="Swipe up or down to choose which drum's settings are shown below"
            />
          </Section>
          {state.drums.map((d, i) => i !== Math.min(drumIdx, state.drums.length - 1) ? null : (
            <Section key={d.name} title={d.name} fixed>
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
              <View accessible accessibilityLabel={`${d.name} pattern`} accessibilityValue={{ text: describePattern(d.hits, d.steps, d.rotation) }}>
                <Text style={styles.pattern}>{patternText(d.hits, d.steps, d.rotation)}</Text>
              </View>
              <Section title={`${d.name}: sound of the built-in drum`} id={`${d.name}: Sound of the built-in drum`} inner>
              <Stepper label={`${d.name} built-in sound`} value={d.voice} onChange={(v) => patchDrum(i, { voice: v })} min={0} max={DRUM_TYPES.length - 1} format={(v) => DRUM_TYPES[v]} hint="Which sound the built-in drum plays for this drum, whatever its note. Another app ignores this" />
              <Stepper label={`${d.name} tune`} value={d.tune} onChange={(v) => patchDrum(i, { tune: v })} min={-12} max={12} format={drumTuneText} />
              <Stepper label={`${d.name} decay`} value={d.decay} onChange={(v) => patchDrum(i, { decay: v })} min={25} max={300} step={5} bigStep={25} format={(v) => `${v} percent`} hint="How long the sound rings" />
              <Stepper label={`${d.name} tone`} value={d.tone} onChange={(v) => patchDrum(i, { tone: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} hint="Darker or brighter" />
              <Stepper label={`${d.name} snap`} value={d.snap} onChange={(v) => patchDrum(i, { snap: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} hint="How much click, noise or attack the sound has" />
              <Stepper label={`${d.name} sound level`} value={d.level} onChange={(v) => patchDrum(i, { level: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
              </Section>
              <Section title={`${d.name}: more settings`} id={`${d.name}: More settings`} inner>
              <Stepper label={`${d.name} humanize`} value={d.humanize} onChange={(v) => patchDrum(i, { humanize: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
              <Toggle
                label={`${d.name} always plays its first hit`}
                value={d.keepFirst}
                onChange={(v) => patchDrum(i, { keepFirst: v })}
                hint="The first hit of the pattern ignores the chance, so the downbeat is always there"
              />
              <Stepper
                label={`${d.name} accent every`}
                value={d.accentEvery}
                onChange={(v) => patchDrum(i, { accentEvery: v })}
                min={0}
                max={8}
                format={(v) => (v < 2 ? 'off' : `every ${v} hits`)}
                hint="Every Nth hit of the pattern is louder"
              />
              <Stepper
                label={`${d.name} accent boost`}
                value={d.accentBoost}
                onChange={(v) => patchDrum(i, { accentBoost: v })}
                min={0}
                max={100}
                step={5}
                format={(v) => `${v} percent louder`}
              />
              <Stepper
                label={`${d.name} ghost notes`}
                value={d.ghostHits}
                onChange={(v) => patchDrum(i, { ghostHits: v })}
                min={0}
                max={d.steps}
                format={(v) => (v === 0 ? 'off' : `${v} hits`)}
                hint="A second, quiet pattern, spread evenly over the steps the main pattern leaves free"
              />
              <Stepper
                label={`${d.name} ghost rotation`}
                value={d.ghostRotation}
                onChange={(v) => patchDrum(i, { ghostRotation: v })}
                min={0}
                max={Math.max(0, d.steps - 1)}
              />
              <Stepper
                label={`${d.name} ghost velocity`}
                value={d.ghostVelocity}
                onChange={(v) => patchDrum(i, { ghostVelocity: v })}
                min={1}
                max={127}
                step={5}
              />
              <Stepper
                label={`${d.name} timing looseness`}
                value={d.looseMs}
                onChange={(v) => patchDrum(i, { looseMs: v })}
                min={0}
                max={40}
                step={2}
                bigStep={10}
                format={(v) => (v === 0 ? 'exact' : `up to ${v} milliseconds late`)}
                hint="Each hit lands a little late, at random, so the pattern feels played instead of clocked"
              />
              <ActionButton label={`Play ${d.name} test hit`} hint="Sends this note on this channel once, to check what the other app does with it" onPress={() => engine.sendNote(d.channel, d.note, d.velocity, 200)} />
              </Section>
            </Section>
          ))}
            </>
          )}
          {part === 'loops' && (
            <>
          <Section title="Loops: what it plays">
            <Text style={styles.note}>
              For an app that plays its own loops, like DrumJam. MidiBed does not send notes here. It picks a loop, then starts and stops it. Which loop, and whether it plays, is saved in each scene. Turn on "Send MIDI clock" on the Setup tab so the loops follow this tempo.
            </Text>
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
              hint="The control change that starts the loops. Use the loop controls button under Where it goes to fill this in."
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
          </Section>
            </>
          )}

          <Section title={`${partName}: how it moves`}>
            <Text style={styles.note}>
              Filter movement on this part's channel. To teach a synth which control to move: put it in MIDI learn, touch the control, then press the test sweep button. Press Stop first so only the sweep is sent.
            </Text>
            {state.wanderers.map((w, i) => (onThisPart(w.channel) ? renderWanderer(w, i) : null))}
            {!state.wanderers.some((w) => onThisPart(w.channel)) && (
              <Text style={styles.note}>No filter movement is set for this part's channel. Filter movements are matched to a part by their MIDI channel.</Text>
            )}
            {state.wanderers.some((w) => !anyPartChannel(w.channel)) && (
              <Text style={styles.note}>These filter movements are on a channel no part uses:</Text>
            )}
            {state.wanderers.map((w, i) => (!anyPartChannel(w.channel) ? renderWanderer(w, i) : null))}
          </Section>
          <Section title={`${partName}: level and fade`}>
            <Text style={styles.note}>
              The level is sent to the other app as a volume control when "Send levels to the apps" is on, on the Setup tab. Fades apply when you switch this part on or off and when you press Play.
            </Text>
            <Stepper
              label={`${partName} level`}
              value={state.mixer[part]}
              onChange={(v) => patch({ mixer: { ...state.mixer, [part]: v } })}
              min={0}
              max={127}
              step={5}
              bigStep={10}
              format={levelText}
              hint="Swipe up or down to change the level. Sent as you change it, when levels are switched on."
            />
            {part === 'bass' && (
              <>
                <Stepper label="Bass drone fade in" value={state.fade.droneIn} onChange={(v) => patchFade({ droneIn: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
                <Stepper label="Bass drone fade out" value={state.fade.droneOut} onChange={(v) => patchFade({ droneOut: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
              </>
            )}
            {part === 'pad' && (
              <>
                <Stepper label="Pad fade in" value={state.fade.padIn} onChange={(v) => patchFade({ padIn: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
                <Stepper label="Pad fade out" value={state.fade.padOut} onChange={(v) => patchFade({ padOut: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
              </>
            )}
            {part === 'drums' && (
              <>
                <Stepper label="Drums fade in" value={state.fade.drumIn} onChange={(v) => patchFade({ drumIn: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
                <Stepper label="Drums fade out" value={state.fade.drumOut} onChange={(v) => patchFade({ drumOut: v })} min={0} max={300} step={5} bigStep={50} format={fadeText} />
              </>
            )}
            {(part === 'dancer' || part === 'loops') && (
              <Text style={styles.note}>This part has no fade of its own: switching it on or off is immediate.</Text>
            )}
          </Section>


          {part !== 'loops' && (
            <Section title={`${partName}: internal synth`}>
              <Text style={styles.note}>MidiBed's own built-in sound for this part: its voice and the Ugly FX.</Text>
          {part === 'bass' && (
            <>
              <Section inner title="Bass drone: built-in bass voice">
                <Text style={styles.note}>
                  A bass synth inside MidiBed, in the style of the Moog Taurus and the Cherry Audio Lowdown. Switch it on and the bass drone plays this sound through MidiBed's own audio, with no other app to start. Filter movement on the bass channel moves its cutoff and resonance. It needs the built-in test sound switched on, on the Setup tab.
                </Text>
                <Toggle label="Use the built-in bass voice" value={state.bassVoice.enabled} onChange={(v) => patch({ bassVoice: { ...state.bassVoice, enabled: v } })} />
                <Toggle
                  label="Built-in sound plays only the bass voice"
                  value={state.bassVoice.exclusive}
                  onChange={(v) => patch({ bassVoice: { ...state.bassVoice, exclusive: v } })}
                  hint="Silences the built-in pad, drums and other channels, so only the bass drone is heard from MidiBed's own sound. Use it when other apps play the rest."
                />
                <Stepper
                  label="Bass voice preset"
                  value={state.bassVoice.preset}
                  onChange={(v) => patch({ bassVoice: applyBassPreset(state.bassVoice, v) })}
                  min={0}
                  max={BASS_PRESETS.length - 1}
                  format={(v) => BASS_PRESETS[v].name}
                  hint="Sets every bass voice setting at once. Changing any setting yourself makes it Custom."
                />
              </Section>
              {(
                [
                  ['oscillators', 'Bass voice: oscillators'],
                  ['filter', 'Bass voice: filter'],
                  ['envelopes', 'Bass voice: envelopes'],
                  ['movement', 'Bass voice: movement and output'],
                ] as const
              ).map(([group, title]) => (
                <Section inner key={group} title={title}>
                  {BASS_PARAMS.filter((d) => d.group === group).map((d: BassParamDef) =>
                    d.unit === 'toggle' ? (
                      <Toggle
                        key={d.key}
                        label={d.label}
                        value={state.bassVoice.v[d.key] >= 1}
                        onChange={(v) => patch({ bassVoice: setBassParam(state.bassVoice, d.key, v ? 1 : 0) })}
                        hint={d.hint}
                      />
                    ) : (
                      <Stepper
                        key={d.key}
                        label={d.label}
                        value={state.bassVoice.v[d.key]}
                        onChange={(v) => patch({ bassVoice: setBassParam(state.bassVoice, d.key, v) })}
                        min={d.min}
                        max={d.max}
                        step={d.step}
                        bigStep={d.bigStep}
                        format={(v) => paramText(d, v)}
                        hint={d.hint}
                      />
                    ),
                  )}
                </Section>
              ))}
            </>
          )}
            <Section inner title={`${partName}: Ugly FX`}>
              <Stepper
                label={`${partName} pan`}
                value={state.fx[part as FxPart].pan}
                onChange={(v) => patchFxPart(part as FxPart, { pan: v })}
                min={-100}
                max={100}
                step={10}
                bigStep={50}
                format={panText}
                hint="Where this part sits left to right in the built-in sound"
              />
              <Stepper
                label={`${partName} reverb`}
                value={state.fx[part as FxPart].reverb}
                onChange={(v) => patchFxPart(part as FxPart, { reverb: v })}
                min={0}
                max={100}
                step={5}
                bigStep={20}
                format={fxPercent}
                hint="How much of this part goes into the shared reverb"
              />
              <Stepper
                label={`${partName} delay`}
                value={state.fx[part as FxPart].delay}
                onChange={(v) => patchFxPart(part as FxPart, { delay: v })}
                min={0}
                max={100}
                step={5}
                bigStep={20}
                format={fxPercent}
                hint="How much of this part goes into the shared delay"
              />
              <Stepper
                label={`${partName} chorus`}
                value={state.fx[part as FxPart].chorus}
                onChange={(v) => patchFxPart(part as FxPart, { chorus: v })}
                min={0}
                max={100}
                step={5}
                bigStep={20}
                format={fxPercent}
                hint="Thickens and widens this part"
              />
            </Section>

            </Section>
          )}

          <Section title={`${partName}: external synth`}>
            <Text style={styles.note}>Everything that sends this part to another app: which app, its MIDI port, its sounds, and a test note.</Text>
            {partRole && (
              <View style={styles.group}>
                <Stepper
                  label={`${partName} app`}
                  value={profileIndex(state.profiles[partRole])}
                  onChange={(v) => patchProfile(partRole, allProfiles()[v].id)}
                  min={0}
                  max={allProfiles().length - 1}
                  format={(v) => allProfiles()[v].name}
                  hint="Which app this part is sent to. It then shows real names and keeps that app's own sound favorites. Add apps that are not listed on the Setup tab."
                />
                <Text style={styles.note}>{partProfile.about}</Text>
              </View>
            )}
            {part !== 'loops' && (
              <Toggle
                label={`${partName} has its own MIDI port`}
                value={state.ports[part]}
                onChange={(v) => patch({ ports: { ...state.ports, [part]: v } })}
                hint={`Makes a source called MidiBed ${part === 'bass' ? 'Bass' : part === 'pad' ? 'Pad' : part === 'dancer' ? 'Dancer' : 'Drums'}. The app you point at it hears only this part and can stay on Omni. In that app, choose this source and switch MidiBed off.`}
              />
            )}
            {part === 'loops' && (
              <Toggle
                label="Loops use their own MIDI port"
                value={state.loops.ownPort}
                onChange={(v) => patchLoops({ ownPort: v })}
                hint="Makes a second MIDI source called MidiBed Loops. The loop choice, loop start and stop, and the MIDI clock go only there, so program changes meant for your other sounds cannot change the loops. Then in the loops app, choose MidiBed Loops as its input and switch MidiBed off"
              />
            )}
            {part === 'bass' && (
              <ActionButton label="Play bass drone test note" hint="Plays the key note for a moment on the bass drone channel, to check routing" onPress={() => engine.sendNote(state.drone.channel, keyRoot(state), state.drone.velocity, 1500)} />
            )}
            {part === 'pad' && (
              <ActionButton label="Play pad test chord" hint="Plays the first chord of the pad for a moment, to check routing" onPress={() => padChords(state)[0]?.forEach((n) => engine.sendNote(state.pad.channel, n, state.pad.velocity, 1500))} />
            )}
            {part === 'dancer' && (
              <ActionButton label="Play MidiDancer test note" hint="Plays one note for a moment on the MidiDancer channel, to check routing" onPress={() => engine.sendNote(state.dancer.channel, state.dancer.register, state.dancer.velocity, 1000)} />
            )}
            {part === 'bass' && droneProfile.mono && (state.drone.octave || state.drone.fifth) && (
              <ActionButton
                label="Bass drone app plays one note: use a single bass note"
                hint="Turns off the octave and the fifth"
                onPress={() => patchDrone({ octave: false, fifth: false })}
              />
            )}
            {part === 'loops' && loopsProfile.loopControls &&
              (state.loops.startCC !== loopsProfile.loopControls.startCC || state.loops.stopCC !== loopsProfile.loopControls.stopCC) && (
                <ActionButton
                  label={`Use ${loopsProfile.name} loop controls, start CC ${loopsProfile.loopControls.startCC}, stop CC ${loopsProfile.loopControls.stopCC}`}
                  onPress={() => patchLoops({ startCC: loopsProfile.loopControls?.startCC ?? 0, stopCC: loopsProfile.loopControls?.stopCC ?? 0 })}
                />
              )}
          {soundSlot !== undefined && (
            <Section inner title={`${partName}: sound`}>
              <Text style={styles.note}>
                Sends Bank Select and Program Change to this part's channel so you can step through sounds from here. The receiving app must be set to respond to program changes.
              </Text>
              {renderSlot(state.sounds[soundSlot], soundSlot)}
            </Section>
          )}
          {part === 'dancer' && (
            <Section inner title="MidiDancer: sound">
              <Text style={styles.note}>
                MidiDancer plays whatever sound its channel has in the other app. Choose the sound there, for example a ThumbJam slot on this channel.
              </Text>
            </Section>
          )}
          {part === 'loops' && (
            <Section inner title="Loops: sound">
              <Text style={styles.note}>The loop choice (program, bank, favorites) is under what it plays, above.</Text>
            </Section>
          )}

          </Section>

            </>
          )}
          {tab === 'scene' && (
            <>
          <Section title="This scene">
            <Text style={styles.note}>
              Everything here belongs to the scene you are working on, which is the scene selected at the top. The scene buttons at the top change what is playing and what you are editing together. The part settings (bass, pad, drums, MidiDancer) are saved per scene too.
            </Text>
            <Stepper label="Swing" value={state.swing} onChange={(v) => patch({ swing: v })} min={0} max={100} step={5} format={(v) => `${v} percent`} />
            <View accessible={false} style={styles.nameBox}>
              <Text style={styles.note}>Scene name (optional)</Text>
              <TextInput
                style={styles.nameInput}
                value={state.sceneName}
                onChangeText={(v) => setState((s) => renameScene(s, v))}
                accessibilityLabel="Scene name"
                accessibilityHint="Double tap to give this scene a name, or leave it empty"
                maxLength={30}
                autoCorrect={false}
                placeholder={`Scene ${state.activeScene + 1}`}
                placeholderTextColor={colors.dim}
                onBlur={() => engine.reclaimKeys()}
              />
            </View>
          </Section>

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


          <Section title="Scene tools">
            <Text style={styles.note}>
              Each scene remembers its drums, bass drone on/off and voicing, chord pad, harmony, swing, and filter movement. Tempo, key, outputs, fades and MIDI routing stay the same in every scene. Changes you make are saved into the current scene.
            </Text>
            <Stepper
              label="What to copy"
              value={copyWhat}
              onChange={setCopyWhat}
              min={0}
              max={SCENE_COPY_PARTS.length - 1}
              format={(v) => SCENE_COPY_PARTS[v]}
              hint="The whole scene, or just one part of it. Only that part of the other scene is replaced"
            />
            <Stepper
              label="Copy to scene"
              value={copyTarget}
              onChange={setCopyTarget}
              min={1}
              max={SCENE_COUNT}
              format={(v) => sceneLabel(state, v - 1)}
              hint="Pick where to copy, then press the copy button"
            />
            <ActionButton
              label={`Copy ${copyWhat === 0 ? 'scene' : SCENE_COPY_PARTS[copyWhat].toLowerCase()} from scene ${state.activeScene + 1} to scene ${copyTarget}`}
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

          <Section title="Evolving patterns">
            <Stepper
              label="Patterns change every"
              value={state.evolve.everyBars}
              onChange={(v) => patch({ evolve: { ...state.evolve, everyBars: v } })}
              min={0}
              max={32}
              format={(v) => (v === 0 ? 'off' : `${v} bars`)}
              hint="Each drum except the kick may gain or lose a hit, or move one step. Saved in each scene. Freeze pauses it"
            />
            <Stepper
              label="Chance of a change"
              value={state.evolve.chance}
              onChange={(v) => patch({ evolve: { ...state.evolve, chance: v } })}
              min={0}
              max={100}
              step={5}
              format={(v) => `${v} percent`}
            />
            <Stepper
              label="Back to the original after"
              value={state.evolve.returnAfter}
              onChange={(v) => patch({ evolve: { ...state.evolve, returnAfter: v } })}
              min={1}
              max={16}
              format={(v) => `${v} changes`}
              hint="Each drum returns to its own pattern after this many changes. A new scene always starts from the originals"
            />
          </Section>

          <Section title="Drum fills">
            <Toggle label="Drum fills" value={state.fill.enabled} onChange={(v) => patchFill({ enabled: v })} hint="Short bursts of snare and toms in the last beats of a bar, landing on the downbeat. The normal drums drop out for the fill. Saved in each scene" />
            {state.fill.enabled && (
              <>
                <Stepper label="Fill every" value={state.fill.everyBars} onChange={(v) => patchFill({ everyBars: v })} min={0} max={32} bigStep={4} format={(v) => (v === 0 ? 'not on a count' : `${v} bars`)} hint="Counted in bars from the start of the scene" />
                <Toggle label="Fill before a scene change" value={state.fill.beforeScene} onChange={(v) => patchFill({ beforeScene: v })} hint="In the bar before a scene you switched to, or one that moves on by itself" />
                <Toggle label="Fill as the drums come back" value={state.fill.afterBreakdown} onChange={(v) => patchFill({ afterBreakdown: v })} hint="In the bar before the drums return from a breakdown" />
                <Stepper label="Fill length" value={state.fill.maxBeats} onChange={(v) => patchFill({ maxBeats: v })} min={1} max={2} format={(v) => (v === 1 ? 'up to 1 beat' : 'up to 2 beats')} hint="Each fill is a different length within this" />
                <Stepper label="Fill density" value={state.fill.density} onChange={(v) => patchFill({ density: v })} min={0} max={100} step={10} format={(v) => `${v} percent`} hint="How many of the sixteenth notes are played" />
                <Stepper label="Fill chance" value={state.fill.chance} onChange={(v) => patchFill({ chance: v })} min={10} max={100} step={10} format={(v) => `${v} percent`} hint="How often a due fill actually plays. A fill you ask for with a key or pedal always plays" />
                <ActionButton label="Play a fill now" hint="Plays a fill in the last beats of this bar, or of the next one" onPress={() => engine.playFill()} />
                <View accessible accessibilityLabel="Fills" accessibilityValue={{ text: describeFill(state.fill, fillPalette(state.drums).length) }}>
                  <Text style={styles.note}>{describeFill(state.fill, fillPalette(state.drums).length)}</Text>
                </View>
              </>
            )}
          </Section>

          <Section title="Transitions in this scene">
            <Text style={styles.note}>
              The transition sounds themselves are set once, lower down on this tab. Here you choose whether this scene uses each one. A sound that is switched off on the Sound tab stays off everywhere.
            </Text>
            <Toggle label="Scene start sound in this scene" value={state.transitionUse.entrance} onChange={(v) => patchTransitionUse('entrance', v)} hint="Plays as this scene starts" />
            <Toggle label="Drums break sound in this scene" value={state.transitionUse.drumBreak} onChange={(v) => patchTransitionUse('drumBreak', v)} hint="Plays as the drums drop out in a breakdown" />
            <Toggle label="Drums return sound in this scene" value={state.transitionUse.drumReturn} onChange={(v) => patchTransitionUse('drumReturn', v)} hint="Plays as the drums come back" />
            <Toggle label="Recurring sound in this scene" value={state.transitionUse.recurring} onChange={(v) => patchTransitionUse('recurring', v)} hint="The sound that comes round every so many bars or at the end of each chord loop" />
          </Section>

          <Section title="Transition sounds">
            <Text style={styles.note}>
              Sounds made inside MidiBed from noise, to mark a change. A lead-in (Wave, Wind) starts before the change and rises into it. Thunder, Boom and Crash play on the change itself. These settings are the same in every scene; each scene can switch them off under Transitions in this scene. They play through MidiBed's own sound, even when the built-in test sound is off, and their level is set here in MidiBed. Noise sounds are much louder than the Boom at the same level, so they usually need a lower setting.
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
              A sound that comes round now and then inside a scene: every few bars, or at the end of each chord loop. It skips the first loop of a scene, which is where the scene start sound belongs. The settings are the same in every scene; each scene can switch it off under Transitions in this scene. If the rise is longer than the gap between sounds, a later sound joins its sweep part-way.
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
          <Section title="Keyboard shortcuts">
            <Text style={styles.note}>
              Keys from a keyboard, or a braille display that types like one (such as the Hable One). They work while MidiBed is on screen: iOS does not deliver keys to an app in the background. The magic tap and the three-finger swipes still work as before. While you type in a text field the keys go there instead.
            </Text>
            <Toggle label="Keyboard shortcuts" value={state.shortcuts} onChange={(v) => patch({ shortcuts: v })} />
            <View accessible accessibilityLabel="Last key received" accessibilityValue={{ text: lastKeyText }}>
              <Text style={styles.note}>{`Last key received: ${lastKeyText}`}</Text>
            </View>
            {SHORTCUT_HELP.map((line) => (
              <Text key={line} style={styles.note}>
                {line}
              </Text>
            ))}
          </Section>

          <Section title="MIDI controller">
            <Toggle label="MIDI controller" value={state.midiControl.enabled} onChange={(v) => patch({ midiControl: { ...state.midiControl, enabled: v } })} hint="Lets a MIDI foot pedal or keyboard run the same actions as the keys. It works while another app is in front." />
            <Stepper
              label="MIDI controller channel"
              value={state.midiControl.channel + 1}
              onChange={(v) => patch({ midiControl: { ...state.midiControl, channel: Math.max(0, Math.min(16, v)) - 1 } })}
              min={0}
              max={16}
              format={(v) => (v === 0 ? 'any channel' : `channel ${v}`)}
              hint="Listen to one channel only, so a pedal shared with other apps can use a different channel for each"
            />
            <Stepper
              label="Action to map"
              value={learnIdx}
              onChange={(v) => {
                setLearnIdx(Math.max(0, Math.min(MIDI_ACTIONS.length - 1, v)));
                learningRef.current = null;
                setLearning(false);
              }}
              min={0}
              max={MIDI_ACTIONS.length - 1}
              format={(v) => `${MIDI_ACTIONS[v].label}, ${describeTrigger(parseMidiMap(state.midiControl.map)[MIDI_ACTIONS[v].id])}`}
              hint="Choose an action, then press Learn and press a button on the controller"
            />
            <ActionButton
              label={learning ? 'Waiting for a button' : 'Learn'}
              hint="Then press a button on the controller. The next message it sends is assigned to the chosen action"
              onPress={() => {
                learningRef.current = learning ? null : MIDI_ACTIONS[learnIdx].id;
                setLearning(!learning);
                announceLater(learning ? 'Cancelled' : 'Press a button on the controller', 100);
              }}
            />
            <ActionButton
              label="Clear this mapping"
              onPress={() => {
                setState((s) => ({ ...s, midiControl: { ...s.midiControl, map: clearTrigger(s.midiControl.map, MIDI_ACTIONS[learnIdx].id) } }));
                announceLater('Cleared', 100);
              }}
            />
            <Stepper
              label="A quick double press does"
              value={Math.max(0, MIDI_ACTIONS.findIndex((a) => a.id === parseDoubleMap(state.midiControl.double)[MIDI_ACTIONS[learnIdx].id]) + 1)}
              onChange={(v) =>
                setState((s) => ({
                  ...s,
                  midiControl: { ...s.midiControl, double: setDouble(s.midiControl.double, MIDI_ACTIONS[learnIdx].id, v <= 0 ? null : MIDI_ACTIONS[v - 1].id) },
                }))
              }
              min={0}
              max={MIDI_ACTIONS.length}
              format={(v) => (v === 0 ? 'nothing extra' : MIDI_ACTIONS[v - 1].label)}
              hint="For the action chosen above. The first press runs at once; a quick second press does this instead of repeating it. If the first press was an on or off switch, it is put back first"
            />
            <Stepper
              label="Holding the button does"
              value={Math.max(0, MIDI_ACTIONS.findIndex((a) => a.id === parseHoldMap(state.midiControl.hold)[MIDI_ACTIONS[learnIdx].id]) + 1)}
              onChange={(v) =>
                setState((s) => ({
                  ...s,
                  midiControl: { ...s.midiControl, hold: setHold(s.midiControl.hold, MIDI_ACTIONS[learnIdx].id, v <= 0 ? null : MIDI_ACTIONS[v - 1].id) },
                }))
              }
              min={0}
              max={MIDI_ACTIONS.length}
              format={(v) => (v === 0 ? 'nothing extra' : MIDI_ACTIONS[v - 1].label)}
              hint="For the action chosen above. Needs the pedal's button in Momentary mode, so it sends a message when you let go. The press runs at once; if you keep holding, this is done as well, and an on or off switch is put back first"
            />
            <Stepper
              label="Hold time"
              value={state.midiControl.holdMs}
              onChange={(v) => patch({ midiControl: { ...state.midiControl, holdMs: v } })}
              min={300}
              max={2500}
              step={100}
              format={(v) => `${v} milliseconds`}
            />
            <Stepper
              label="Double press speed"
              value={state.midiControl.doubleMs}
              onChange={(v) => patch({ midiControl: { ...state.midiControl, doubleMs: v } })}
              min={200}
              max={800}
              step={50}
              format={(v) => `within ${v} milliseconds`}
            />
            <View accessible accessibilityLabel="Last MIDI received" accessibilityValue={{ text: lastMidiText }}>
              <Text style={styles.note}>{`Last MIDI received: ${lastMidiText}`}</Text>
            </View>
          </Section>

          <Section title="Output">
            <Toggle label="Announce breathing changes" value={state.announce} onChange={(v) => patch({ announce: v })} hint="Speaks a short message when a bass, pad or drum change happens by itself" />
            <Toggle label="Send MIDI" value={state.midiOut} onChange={(v) => patch({ midiOut: v })} hint="Sends to other apps as the MidiBed source" />
            <Text style={styles.note}>
              Each part can have its own MIDI source, set on the Parts tab under where it goes. The sources are called MidiBed, MidiBed Bass, MidiBed Pad, MidiBed Dancer, MidiBed Drums and MidiBed Loops.
            </Text>
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

          <Section title="Ugly FX: shared reverb and delay">
            <Text style={styles.note}>These effects are in MidiBed's own sound only. Each part's amounts are on the Parts tab.</Text>
            <Stepper
              label="Reverb size"
              value={state.fx.size}
              onChange={(v) => patch({ fx: { ...state.fx, size: v } })}
              min={0}
              max={100}
              step={5}
              bigStep={20}
              format={(v) => `${v} percent`}
              hint="From a small room to a long tail"
            />
            <Stepper
              label="Reverb darkness"
              value={state.fx.damp}
              onChange={(v) => patch({ fx: { ...state.fx, damp: v } })}
              min={0}
              max={100}
              step={5}
              bigStep={20}
              format={(v) => `${v} percent`}
              hint="Higher is a darker, softer tail"
            />
            <Stepper
              label="Delay time"
              value={state.fx.delayNote}
              onChange={(v) => patch({ fx: { ...state.fx, delayNote: v } })}
              min={0}
              max={2}
              format={(v) => DELAY_NOTES[v] ?? ''}
              hint="A note length at the current tempo, so the repeats stay in time"
            />
            <Stepper
              label="Delay repeats"
              value={state.fx.repeats}
              onChange={(v) => patch({ fx: { ...state.fx, repeats: v } })}
              min={0}
              max={70}
              step={5}
              bigStep={10}
              format={(v) => `${v} percent`}
              hint="How long the echoes last. Keep it low for a small delay"
            />
          </Section>

          <Section title="Levels and fades">
            <Text style={styles.note}>
              Each part's own level and fade times are on the Parts tab. These two settings apply to all parts.
            </Text>
            <Toggle
              label="Send levels to the apps"
              value={state.mixer.send}
              onChange={(v) => patch({ mixer: { ...state.mixer, send: v } })}
              hint="Sends each part's level as a volume control (CC 7, or the loops app's own loop volume). Nothing is sent until this is on, so a synth's own volume is not changed by surprise. There is no EQ: EQ is not a standard MIDI control."
            />
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
            {fadeProfile?.fadeCC !== undefined && state.fade.cc !== fadeProfile.fadeCC && (
              <ActionButton
                label={`Use ${fadeProfile.name} volume control, CC ${fadeProfile.fadeCC}, for fades`}
                onPress={() => patchFade({ cc: fadeProfile.fadeCC as number })}
              />
            )}
          </Section>

          <Section title="My apps">
            <Text style={styles.note}>
              Which app each part is sent to is chosen on the Parts tab, under where it goes. Add a synth or drum app that is not in the list here and it gets its own sound favorites.
            </Text>
            <View style={styles.nameBox}>
              <Text style={styles.note}>Your own apps. Add a synth or drum app that is not in the list and it gets its own sound favorites.</Text>
              <TextInput
                style={styles.nameInput}
                value={newAppName}
                onChangeText={setNewAppName}
                accessibilityLabel="New app name"
                accessibilityHint="Type the name of an app, then use the add button"
                maxLength={40}
                autoCorrect={false}
                placeholderTextColor={colors.dim}
                onBlur={() => engine.reclaimKeys()}
              />
            </View>
            <ActionButton
              label="Add this app to my apps"
              hint="Then choose it for a part with the app steppers above"
              onPress={() => {
                const r = addCustomApp(state.customApps, newAppName);
                if (!r.id) {
                  announceLater('You can add up to 20 apps', 300);
                  return;
                }
                setState((s) => ({ ...s, customApps: r.json }));
                setNewAppName('');
                announceLater(`Added ${newAppName.trim() || 'My app'}`, 300);
              }}
            />
            {parseCustomApps(state.customApps).map((a) => (
              <ActionButton
                key={a.id}
                label={`Remove ${a.name} from my apps`}
                hint="Parts using it go back to No profile. Its saved favorites are kept"
                onPress={() => {
                  setState((s) => ({
                    ...s,
                    customApps: removeCustomApp(s.customApps, a.id),
                    profiles: Object.fromEntries(Object.entries(s.profiles).map(([k, v]) => [k, v === a.id ? 'none' : v])) as typeof s.profiles,
                  }));
                  announceLater(`Removed ${a.name}`, 300);
                }}
              />
            ))}
          </Section>
            </>
          )}
            </ScrollView>
            </SectionUiContext.Provider>
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
