// Foot pedal gestures: a tap, a quick double tap and a hold on one button. The reference logic for App.tsx.
//
// A button that has a hold action (and is known to send a release when you let go) works like this:
//   - let go before the hold time: the TAP runs, at the moment you let go;
//   - still down at the hold time: the HOLD runs, and the tap never does (so there is nothing to undo);
//   - a second press within the double-tap time of a tap: the DOUBLE runs instead (an on/off tap is put back first).
// A button with no hold action keeps its tap running the instant you press, with nothing waiting.
//
// A pedal in "single" mode never sends a release, so a hold button on such a pedal would never run its tap. A button
// is therefore only treated this way once a release has been seen from it, or when the pedal is declared as one that
// sends releases.

export type PedalButtonConfig = {
  /** the action id the button is learned for (its tap) */
  tapId: string;
  doubleId?: string;
  holdId?: string;
  doubleMs: number;
  holdMs: number;
  /** is the tap an on/off switch (put back before a double press does its own thing)? */
  tapIsToggle: boolean;
  /** the pedal is known to send releases whatever has been seen so far */
  assumeReleases: boolean;
};

export type PedalHost = {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  /** run an action by id */
  run: (actionId: string) => void;
};

export function createPedal(host: PedalHost) {
  const releaseSeen = new Set<string>();
  const timers = new Map<string, unknown>();
  const configs = new Map<string, PedalButtonConfig>();
  const consumed = new Set<string>(); // this press was a double press: its release does nothing
  let last: { id: string; at: number } | null = null;

  const rememberTap = (cfg: PedalButtonConfig) => {
    last = cfg.doubleId ? { id: cfg.tapId, at: host.now() } : null;
  };

  return {
    /** A press of the button with this trigger key. */
    press(key: string, cfg: PedalButtonConfig): 'tap' | 'double' | 'waiting' {
      const t = host.now();
      if (cfg.doubleId && last && last.id === cfg.tapId && t - last.at >= 0 && t - last.at <= cfg.doubleMs) {
        last = null;
        consumed.add(key);
        if (timers.has(key)) {
          host.clearTimer(timers.get(key));
          timers.delete(key);
        }
        if (cfg.tapIsToggle) host.run(cfg.tapId);
        host.run(cfg.doubleId);
        return 'double';
      }
      consumed.delete(key);
      if (cfg.holdId && (cfg.assumeReleases || releaseSeen.has(key))) {
        // wait: a release before the hold time is a tap, still down at the hold time is a hold
        configs.set(key, cfg);
        if (timers.has(key)) host.clearTimer(timers.get(key));
        const holdId = cfg.holdId;
        timers.set(
          key,
          host.setTimer(() => {
            timers.delete(key);
            configs.delete(key);
            last = null;
            host.run(holdId);
          }, cfg.holdMs),
        );
        return 'waiting';
      }
      rememberTap(cfg);
      host.run(cfg.tapId);
      return 'tap';
    },

    /** The button was let go. */
    release(key: string) {
      releaseSeen.add(key);
      if (consumed.delete(key)) return;
      if (timers.has(key)) {
        host.clearTimer(timers.get(key));
        timers.delete(key);
        const cfg = configs.get(key);
        configs.delete(key);
        if (cfg) {
          rememberTap(cfg);
          host.run(cfg.tapId);
        }
      }
    },

    hasSeenRelease(key: string) {
      return releaseSeen.has(key);
    },
  };
}
