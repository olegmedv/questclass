// «Ночной отель»: random events over the room (lightning, eyes, a shadow, a monster in the
// wardrobe…) with their sounds. Behaviour of the original `lib/night-hotel.ts` and
// `app/night-hotel-room.tsx`: one event at a time, each on its own interval, 20–35 s of quiet
// between events, a tap wakes the room at once but not more often than every 8 s; nothing runs
// on a hidden tab, with reduced motion or with the room's animations off; sounds only after the
// learner has touched the page.

/** One event: its layer is `sceneAssets.layers[id]`, its sounds are files of `audio.events`. */
export interface RoomEvent {
  readonly id: string;
  /** Seconds between two runs of this event: [shortest, longest]. */
  readonly interval: readonly [number, number];
  /** How long the layer stays on screen. */
  readonly durationMs: number;
  /** One of these sounds plays with the event. */
  readonly sounds?: readonly string[];
  /** Chance that the sound plays (default 1). */
  readonly soundChance?: number;
  readonly volume?: number;
  readonly soundDelayMs?: number;
  /** How long the sound lasts: the room stays busy until it has finished. */
  readonly soundDurationMs?: number;
  /** Several sounds at given moments (the wardrobe monster). */
  readonly sequence?: readonly {
    readonly sound: string;
    readonly atMs: number;
    readonly volume: number;
  }[];
  /** Relative chance of being picked by a tap (default 1). */
  readonly tapWeight?: number;
  /** A tap repeats this event no sooner than this (the screech is rare). */
  readonly tapGapMs?: number;
}

export const NIGHT_HOTEL_EVENTS: readonly RoomEvent[] = [
  {
    id: 'lightning',
    interval: [20, 40],
    durationMs: 2100,
    sounds: ['thunder_01', 'thunder_02'],
    soundChance: 0.4,
    volume: 0.12,
    soundDelayMs: 300,
    soundDurationMs: 5500,
  },
  { id: 'eyesBlink', interval: [35, 65], durationMs: 2000, tapWeight: 0.4 },
  {
    id: 'lightFlicker',
    interval: [45, 90],
    durationMs: 840,
    sounds: ['light_flicker'],
    volume: 0.12,
    soundDurationMs: 950,
    tapWeight: 0.4,
  },
  {
    id: 'shadowRun',
    interval: [45, 90],
    durationMs: 760,
    sounds: ['shadow_run'],
    volume: 0.14,
    soundDurationMs: 1800,
  },
  {
    id: 'girlWindow',
    interval: [70, 130],
    durationMs: 2900,
    sounds: ['girl_laugh'],
    soundChance: 0.25,
    volume: 0.06,
    soundDelayMs: 500,
    soundDurationMs: 1100,
  },
  {
    id: 'figurePeek',
    interval: [65, 120],
    durationMs: 3000,
    sounds: ['monster_slither'],
    volume: 0.12,
    soundDelayMs: 400,
    soundDurationMs: 2200,
  },
  {
    id: 'wardrobeMonster',
    interval: [55, 100],
    durationMs: 3400,
    soundDurationMs: 5400,
    sequence: [
      { sound: 'wardrobe_thump', atMs: 0, volume: 0.1 },
      { sound: 'closet_creak_open', atMs: 700, volume: 0.12 },
      { sound: 'closet_creak_close', atMs: 3700, volume: 0.1 },
    ],
  },
  {
    id: 'doorBend',
    interval: [55, 110],
    durationMs: 2480,
    sounds: ['door_creak'],
    volume: 0.12,
    soundDurationMs: 2800,
  },
  {
    id: 'screech',
    interval: [180, 300],
    durationMs: 1400,
    sounds: ['screech_jump'],
    volume: 0.09,
    soundDelayMs: 300,
    soundDurationMs: 1150,
    tapWeight: 0.12,
    tapGapMs: 180_000,
  },
];

/** Quiet between two events, seconds. */
export const ROOM_QUIET: readonly [number, number] = [20, 35];
/** A tap wakes the room again only after this pause. */
export const ROOM_TAP_COOLDOWN_MS = 8000;

export interface RoomActivity {
  /** The room is on screen and nothing else (settings, dressing) holds it. */
  readonly active: boolean;
  /** The tab is visible. */
  readonly visible: boolean;
  /** «Анимации фона» is on. */
  readonly animations: boolean;
  /** The device asks for reduced motion. */
  readonly reduced: boolean;
}

export const canRunRoomEvents = (a: RoomActivity): boolean =>
  a.active && a.visible && a.animations && !a.reduced;

export interface RoomSchedule {
  /** The event due now, if any (marks it as playing). */
  next(time: number, activity: RoomActivity, failed?: ReadonlySet<string>): RoomEvent | null;
  /** A tap: any event except the last one, at once, but only after the tap pause. */
  interact(time: number, activity: RoomActivity, failed?: ReadonlySet<string>): RoomEvent | null;
  /** Milliseconds until a tap works again. */
  tapWait(time: number): number;
  /** The playing event has ended (with its sounds). */
  finish(time: number): void;
}

/** A fresh schedule (a return from a hidden tab makes a new one: queued scares never replay). */
export function createRoomSchedule(
  now: number,
  {
    events = NIGHT_HOTEL_EVENTS,
    random = Math.random,
  }: { readonly events?: readonly RoomEvent[]; readonly random?: () => number } = {},
): RoomSchedule {
  const between = ([low, high]: readonly [number, number]) =>
    (low + random() * (high - low)) * 1000;
  const due = new Map(events.map((event) => [event.id, now + between(event.interval)]));
  const played = new Map<string, number>();
  let busy = false;
  let allowedAt = now + between(ROOM_QUIET);
  let tapAllowedAt = now;
  let lastId = '';

  const start = (event: RoomEvent, time: number) => {
    busy = true;
    lastId = event.id;
    played.set(event.id, time);
    due.set(event.id, time + between(event.interval));
    return event;
  };

  return {
    next(time, activity, failed = new Set()) {
      if (busy || time < allowedAt || !canRunRoomEvents(activity)) return null;
      const ready = events.filter(
        (event) => !failed.has(event.id) && time >= (due.get(event.id) ?? Infinity),
      );
      if (ready.length === 0) return null;
      const event = ready[Math.min(ready.length - 1, Math.floor(random() * ready.length))];
      return event ? start(event, time) : null;
    },
    interact(time, activity, failed = new Set()) {
      if (busy || time < tapAllowedAt || !canRunRoomEvents(activity)) return null;
      const choices = events.filter(
        (event) =>
          !failed.has(event.id) &&
          event.id !== lastId &&
          (event.tapGapMs === undefined ||
            time - (played.get(event.id) ?? -Infinity) >= event.tapGapMs),
      );
      const weight = (event: RoomEvent) => event.tapWeight ?? 1;
      let pick = random() * choices.reduce((sum, event) => sum + weight(event), 0);
      for (const event of choices) {
        pick -= weight(event);
        if (pick < 0) return start(event, time);
      }
      return null;
    },
    tapWait: (time) => Math.max(0, tapAllowedAt - time),
    finish(time) {
      busy = false;
      tapAllowedAt = time + ROOM_TAP_COOLDOWN_MS;
      allowedAt = time + between(ROOM_QUIET);
    },
  };
}

// --- The director: the schedule, the clip on screen and the sounds, without React or DOM. ---

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
};

/** The sound side the director needs (a `RoomAudio`). */
export interface DirectorAudio {
  loop(name: string, volume: number): void;
  effect(name: string, volume: number): void;
  prepare(names: readonly string[]): Promise<void>;
  stopEffects(): void;
  dispose(): void;
}

export interface NightHotelConditions extends RoomActivity {
  /** «Звуки комнаты». */
  readonly sounds: boolean;
  /** «Атмосфера / дождь». */
  readonly atmosphere: boolean;
  readonly music: boolean;
  /** The learner has touched or pressed a key on the page (browsers block sound before). */
  readonly gesture: boolean;
}

export interface NightHotelView {
  /** The event layer to show (a fresh object URL each time, so a one-shot WebP restarts). */
  readonly clip: { readonly event: RoomEvent; readonly url: string } | null;
  readonly state: 'idle' | 'loading' | 'playing';
  /** Seconds until a tap works again. */
  readonly tapWait: number;
  readonly warning: string | null;
  readonly running: boolean;
}

export interface NightHotelDirectorOptions {
  /** Layer URL by event id (`sceneAssets.layers`). */
  readonly layers: Readonly<Record<string, string>>;
  /** Creates the sound bank of the room (called only when sound is allowed). */
  readonly createAudio: () => DirectorAudio;
  /** Fetches a layer and returns an object URL; `release` frees it. */
  readonly loadClip?: (url: string, signal: AbortSignal) => Promise<string>;
  readonly releaseClip?: (url: string) => void;
  readonly onChange: (view: NightHotelView) => void;
  readonly events?: readonly RoomEvent[];
  readonly clock?: Clock;
  readonly random?: () => number;
}

const LOAD_TIMEOUT_MS = 10_000;

const fetchClip = async (url: string, signal: AbortSignal) => {
  const res = await fetch(url, { signal, cache: 'force-cache' });
  if (!res.ok) throw new Error('clip');
  return URL.createObjectURL(await res.blob());
};

export const IDLE_VIEW: NightHotelView = {
  clip: null,
  state: 'idle',
  tapWait: 0,
  warning: null,
  running: false,
};

/**
 * Runs the «Ночной отель» while the conditions allow: a tick every second picks a due event,
 * a tap picks one at once; the chosen layer is loaded, shown (`clipShown`) and its sounds play;
 * when it ends the room is quiet again. Changing the conditions so that the room may not run
 * cancels everything (no queued scares replay after a hidden tab).
 */
export class NightHotelDirector {
  private readonly events: readonly RoomEvent[];
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly loadClip: (url: string, signal: AbortSignal) => Promise<string>;
  private readonly releaseClip: (url: string) => void;
  private conditions: NightHotelConditions | null = null;
  private schedule: RoomSchedule | null = null;
  private ticker: unknown = null;
  private readonly timers = new Set<unknown>();
  private readonly failed = new Set<string>();
  private fetcher: AbortController | null = null;
  private audio: DirectorAudio | null = null;
  private audioKey = '';
  private view: NightHotelView = IDLE_VIEW;

  constructor(private readonly options: NightHotelDirectorOptions) {
    this.events = (options.events ?? NIGHT_HOTEL_EVENTS).filter((e) => options.layers[e.id]);
    this.clock = options.clock ?? realClock;
    this.random = options.random ?? Math.random;
    this.loadClip = options.loadClip ?? fetchClip;
    this.releaseClip = options.releaseClip ?? ((url) => URL.revokeObjectURL(url));
  }

  /** Whether events may run under these conditions. */
  static running(conditions: NightHotelConditions): boolean {
    return canRunRoomEvents(conditions);
  }

  /** Whether the room may make sound under these conditions. */
  static audible(conditions: NightHotelConditions): boolean {
    return conditions.active && conditions.visible && conditions.sounds && conditions.gesture;
  }

  update(conditions: NightHotelConditions): void {
    const wasRunning = this.conditions ? canRunRoomEvents(this.conditions) : false;
    this.conditions = conditions;
    const running = canRunRoomEvents(conditions);
    if (!running && wasRunning) this.stop();
    this.updateAudio(conditions);
    if (running && !wasRunning) this.start();
  }

  /** A tap on the room. */
  tap(): void {
    if (!this.schedule || !this.conditions) return;
    const event = this.schedule.interact(this.clock.now(), this.conditions, this.failed);
    if (event) this.load(event);
  }

  /** The layer of the clip has loaded: the event begins (its sounds and its end). */
  clipShown(eventId: string): void {
    const clip = this.view.clip;
    if (!clip || clip.event.id !== eventId || this.view.state !== 'loading') return;
    const event = clip.event;
    this.emit({ state: 'playing' });
    const audio = this.audio;
    if (audio && event.sounds && this.random() < (event.soundChance ?? 1)) {
      const name = event.sounds[Math.floor(this.random() * event.sounds.length)];
      if (name) this.later(() => audio.effect(name, event.volume ?? 0.12), event.soundDelayMs ?? 0);
    }
    for (const cue of event.sequence ?? []) {
      this.later(() => audio?.effect(cue.sound, cue.volume), cue.atMs);
    }
    this.later(() => this.hideClip(), event.durationMs);
    this.later(
      () => this.finish(),
      Math.max(event.durationMs, (event.soundDurationMs ?? 0) + (event.soundDelayMs ?? 0)),
    );
  }

  /** The layer could not be shown: the room keeps working without this event. */
  clipFailed(eventId: string): void {
    this.failed.add(eventId);
    this.emit({ warning: 'Один из эффектов недоступен. Остальная комната работает.' });
    this.finish();
  }

  /** The candles could not load. */
  candlesFailed(): void {
    this.emit({ warning: 'Свечи временно неподвижны: эффект не загрузился.' });
  }

  /** The browser blocked the room's sound. */
  audioBlocked(): void {
    this.emit({ warning: 'Браузер не включил звук. Переключи «Звуки комнаты» в настройках.' });
  }

  dispose(): void {
    this.stop();
    this.audio?.dispose();
    this.audio = null;
    this.audioKey = '';
  }

  private updateAudio(conditions: NightHotelConditions): void {
    const audible = NightHotelDirector.audible(conditions);
    const key = audible ? `${conditions.atmosphere ? 'a' : ''}${conditions.music ? 'm' : ''}` : '';
    if (audible && this.audio && key === this.audioKey) return;
    this.audio?.dispose();
    this.audio = null;
    this.audioKey = key;
    if (!audible) return;
    const bank = this.options.createAudio();
    this.audio = bank;
    if (conditions.atmosphere) {
      bank.loop('ambient_room_loop', 0.16);
      bank.loop('rain_loop', 0.2);
    }
    if (conditions.music) bank.loop('music_optional_loop', 0.08);
  }

  private start(): void {
    this.schedule = createRoomSchedule(this.clock.now(), {
      events: this.events,
      random: this.random,
    });
    this.emit({ running: true, warning: null });
    this.ticker = this.clock.setInterval(() => this.tick(), 1000);
  }

  private stop(): void {
    if (this.ticker !== null) this.clock.clearInterval(this.ticker);
    this.ticker = null;
    for (const timer of this.timers) this.clock.clearTimeout(timer);
    this.timers.clear();
    this.fetcher?.abort();
    this.fetcher = null;
    this.audio?.stopEffects();
    this.schedule = null;
    this.dropClip();
    this.emit({ clip: null, state: 'idle', tapWait: 0, running: false });
  }

  private tick(): void {
    if (!this.schedule || !this.conditions) return;
    const now = this.clock.now();
    const wait = Math.ceil(this.schedule.tapWait(now) / 1000);
    if (wait !== this.view.tapWait) this.emit({ tapWait: wait });
    const event = this.schedule.next(now, this.conditions, this.failed);
    if (event) this.load(event);
  }

  private load(event: RoomEvent): void {
    const url = this.options.layers[event.id];
    if (!url) {
      this.clipFailed(event.id);
      return;
    }
    this.emit({ state: 'loading', tapWait: 0, warning: null });
    const request = new AbortController();
    this.fetcher = request;
    const timeout = this.later(() => request.abort(), LOAD_TIMEOUT_MS);
    const sounds = [...(event.sounds ?? []), ...(event.sequence ?? []).map((cue) => cue.sound)];
    void Promise.all([this.loadClip(url, request.signal), this.audio?.prepare(sounds)])
      .then(([objectUrl]) => {
        if (request.signal.aborted || this.fetcher !== request) {
          this.releaseClip(objectUrl);
          return;
        }
        this.emit({ clip: { event, url: objectUrl } });
      })
      .catch(() => {
        // Stopped meanwhile: nothing to report; a failure or a timeout skips this event.
        if (this.fetcher === request) this.clipFailed(event.id);
      })
      .finally(() => {
        this.clock.clearTimeout(timeout);
        this.timers.delete(timeout);
      });
  }

  private hideClip(): void {
    this.dropClip();
    this.emit({ clip: null });
  }

  private finish(): void {
    this.dropClip();
    this.fetcher = null;
    this.audio?.stopEffects();
    if (!this.schedule) return;
    const now = this.clock.now();
    this.schedule.finish(now);
    this.emit({ clip: null, state: 'idle', tapWait: Math.ceil(this.schedule.tapWait(now) / 1000) });
  }

  private dropClip(): void {
    const clip = this.view.clip;
    if (clip) this.releaseClip(clip.url);
  }

  private later(callback: () => void, ms: number): unknown {
    const timer = this.clock.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  private emit(patch: Partial<NightHotelView>): void {
    this.view = { ...this.view, ...patch };
    this.options.onChange(this.view);
  }
}
