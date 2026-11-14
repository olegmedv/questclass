import {
  ArrowRight,
  Check,
  Coins,
  ShoppingBag,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { focusableIn, lockScroll, trapTab } from '../../internal/focus';
import { usePrefersReducedMotion } from '../../internal/useReducedMotion';
import { Button } from '../Button';
import { markStreakCelebrated } from './streakOnce';
import './Celebration.css';

export interface CelebrationReward {
  readonly coins?: number;
  readonly xp?: number;
}

export interface Totals {
  readonly coins: number;
  readonly xp: number;
}

interface CommonProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** A demonstration: says so on screen and never marks anything as seen. */
  readonly preview?: boolean;
  /** Static version without flights and the movie; default — the device preference. */
  readonly reducedMotion?: boolean;
  /** The moment the reward is shown (the app plays the «complete» sound). */
  readonly onReward?: () => void;
}

export interface PassCelebrationProps extends CommonProps {
  readonly variant: 'pass';
  readonly title: string;
  readonly message?: ReactNode;
  readonly reward: CelebrationReward;
}

export interface PurchaseCelebrationProps extends CommonProps {
  readonly variant: 'purchase';
  readonly item: { readonly name: string; readonly image?: string };
  readonly spent: number;
  /** Coins left after the purchase. */
  readonly balance: number;
}

export interface StreakCelebrationProps extends CommonProps {
  readonly variant: 'streak';
  readonly reward: CelebrationReward;
  /** Balances after the bonus (confirmed by the server); counters run up to them. */
  readonly totals: Totals;
  readonly movie: {
    /** Animated WebP of the celebration. */
    readonly src: string;
    readonly poster: string;
    readonly durationMs: number;
    readonly audio?: string;
  };
  readonly volume?: number;
  /** Device marker key (`streakCelebrationKey`): written when shown, unless `preview`. */
  readonly seenKey?: string;
}

export type CelebrationProps =
  PassCelebrationProps | PurchaseCelebrationProps | StreakCelebrationProps;

/** A ref that always holds the latest value (callbacks used inside effects). */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const COUNT_STEPS = 10;
const COUNT_STEP_MS = 100;
const COUNT_DELAY_MS = 300;

function format(value: number): string {
  return value.toLocaleString('ru-RU');
}

/** Tokens flying up from the reward (decorative). */
function Flight({ kind, count }: { kind: 'coins' | 'xp'; count: number }) {
  return (
    <span className="qc-celebration-flight" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="qc-celebration-token"
          data-kind={kind}
          style={{ '--i': i, '--x': `${((i % 5) - 2) * 18}px` } as CSSProperties}
        >
          {kind === 'coins' ? <Coins /> : <Zap />}
        </span>
      ))}
    </span>
  );
}

function RewardPills({ reward, flying }: { reward: CelebrationReward; flying: boolean }) {
  return (
    <div className="qc-celebration-rewards">
      {reward.xp ? (
        <span className="qc-celebration-pill" data-kind="xp">
          <Zap aria-hidden="true" />+{format(reward.xp)} XP
          {flying && <Flight kind="xp" count={6} />}
        </span>
      ) : null}
      {reward.coins ? (
        <span className="qc-celebration-pill" data-kind="coins">
          <Coins aria-hidden="true" />+{format(reward.coins)} монет
          {flying && <Flight kind="coins" count={8} />}
        </span>
      ) : null}
    </div>
  );
}

/** Full-screen overlay shell: dialog semantics, focus inside, Escape closes, focus returns. */
function Shell({
  label,
  onClose,
  wide,
  children,
}: {
  label: string;
  onClose: () => void;
  wide: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockScroll();
    const root = ref.current;
    (root ? (focusableIn(root).at(-1) ?? root) : null)?.focus();
    return () => {
      unlock();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (ref.current) trapTab(event, ref.current);
  };
  return createPortal(
    <div className="qc-celebration-overlay">
      <div
        ref={ref}
        className="qc-celebration"
        data-wide={wide || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function PreviewNote({ preview }: { preview: boolean }) {
  return preview ? (
    <p className="qc-celebration-preview">
      <Check aria-hidden="true" />
      Предпросмотр: ничего не начислено
    </p>
  ) : null;
}

function SimpleCelebration(props: PassCelebrationProps | PurchaseCelebrationProps) {
  const { onClose, preview = false, onReward } = props;
  const prefersReduced = usePrefersReducedMotion();
  const reduced = props.reducedMotion ?? prefersReduced;
  const titleId = useId();
  const onRewardRef = useLatest(onReward);
  useEffect(() => {
    onRewardRef.current?.();
  }, [onRewardRef]);
  const isPass = props.variant === 'pass';
  const title = isPass ? props.title : 'Куплено!';
  return (
    <Shell label={title} onClose={onClose} wide={false}>
      <div
        className="qc-celebration-card"
        data-variant={props.variant}
        data-reduced={reduced || undefined}
      >
        <div className="qc-celebration-glow" aria-hidden="true" />
        {isPass ? (
          <span className="qc-celebration-icon" aria-hidden="true">
            <Trophy />
          </span>
        ) : props.item.image ? (
          <img className="qc-celebration-item" src={props.item.image} alt={props.item.name} />
        ) : (
          <span className="qc-celebration-icon" aria-hidden="true">
            <ShoppingBag />
          </span>
        )}
        <h2 id={titleId} className="qc-celebration-title">
          {title}
        </h2>
        {isPass ? (
          props.message && <p className="qc-celebration-message">{props.message}</p>
        ) : (
          <p className="qc-celebration-message">
            {props.item.name}. Потрачено {format(props.spent)} монет, осталось{' '}
            {format(props.balance)}.
          </p>
        )}
        {isPass && <RewardPills reward={props.reward} flying={!reduced} />}
        <PreviewNote preview={preview} />
        <Button variant="primary" block onClick={onClose}>
          {preview ? 'Закрыть предпросмотр' : 'Отлично!'}
        </Button>
      </div>
    </Shell>
  );
}

type StreakPhase = 'movie' | 'rewards' | 'done';

function StreakCelebration({
  onClose,
  preview = false,
  onReward,
  reward,
  totals,
  movie,
  volume = 0.55,
  seenKey,
  reducedMotion,
}: StreakCelebrationProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefersReduced;
  const [phase, setPhase] = useState<StreakPhase>(reduced ? 'done' : 'movie');
  const [movieFailed, setMovieFailed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const coinsGain = reward.coins ?? 0;
  const xpGain = reward.xp ?? 0;
  const from: Totals = {
    coins: Math.max(0, totals.coins - coinsGain),
    xp: Math.max(0, totals.xp - xpGain),
  };
  const [step, setStep] = useState(reduced ? COUNT_STEPS : 0);
  const shown: Totals = {
    coins: from.coins + Math.round((coinsGain * step) / COUNT_STEPS),
    xp: from.xp + Math.round((xpGain * step) / COUNT_STEPS),
  };

  // Once per bonus and device; a preview never counts.
  useEffect(() => {
    if (!preview && seenKey) markStreakCelebrated(seenKey);
  }, [preview, seenKey]);

  // The movie ends by itself after its length.
  useEffect(() => {
    if (phase !== 'movie') return;
    const timer = setTimeout(() => setPhase('rewards'), movie.durationMs);
    return () => clearTimeout(timer);
  }, [phase, movie.durationMs]);

  // The soundtrack plays with the movie; browsers may block it until a tap.
  useEffect(() => {
    const element = audio.current;
    if (phase !== 'movie' || !element) return;
    element.volume = volume;
    element.muted = muted;
    if (!muted) {
      Promise.resolve(element.play()).catch(() => setSoundBlocked(true));
    }
    return () => element.pause();
  }, [phase, muted, volume]);

  // Counters run up to the confirmed totals, then the button appears.
  const onRewardRef = useLatest(onReward);
  const rewardShown = phase !== 'movie';
  useEffect(() => {
    if (rewardShown) onRewardRef.current?.();
  }, [rewardShown, onRewardRef]);
  useEffect(() => {
    if (phase !== 'rewards') return;
    const timers = Array.from({ length: COUNT_STEPS }, (_, i) =>
      setTimeout(() => setStep(i + 1), COUNT_DELAY_MS + i * COUNT_STEP_MS),
    );
    timers.push(
      setTimeout(() => setPhase('done'), COUNT_DELAY_MS + COUNT_STEPS * COUNT_STEP_MS + 200),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const toRewards = () => {
    audio.current?.pause();
    setPhase('rewards');
  };

  return (
    <Shell label="Пять дней подряд — серия завершена!" onClose={onClose} wide>
      <div className="qc-streak" data-phase={phase} data-reduced={reduced || undefined}>
        <header className="qc-streak-top">
          <span>{preview ? 'ПРЕДПРОСМОТР' : 'СЕРИЯ ЗАВЕРШЕНА'}</span>
          <button
            type="button"
            className="qc-streak-close"
            aria-label="Закрыть праздник"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div
          className="qc-streak-totals"
          aria-label={preview ? 'Демонстрация счётчиков' : 'Твои награды'}
        >
          <span className="qc-streak-total" data-kind="coins">
            <Coins aria-hidden="true" />
            <b>{format(shown.coins)}</b>
            <small>монет</small>
          </span>
          <span className="qc-streak-total" data-kind="xp">
            <Zap aria-hidden="true" />
            <b>{format(shown.xp)}</b>
            <small>XP</small>
          </span>
        </div>
        {phase === 'movie' ? (
          <div className="qc-streak-stage">
            <img
              className="qc-streak-movie"
              src={movie.src}
              alt="Герой побеждает и поднимает кубок"
              onError={() => {
                setMovieFailed(true);
                toRewards();
              }}
            />
            <div className="qc-streak-heading">
              <span>ПЯТЬ ДНЕЙ ПОДРЯД</span>
              <h2>Вот это победа!</h2>
            </div>
            {movie.audio && <audio ref={audio} src={movie.audio} preload="auto" />}
            <div className="qc-streak-controls">
              {movie.audio && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={muted || soundBlocked ? <VolumeX /> : <Volume2 />}
                  onClick={() => {
                    if (soundBlocked) {
                      setSoundBlocked(false);
                      setMuted(false);
                      void Promise.resolve(audio.current?.play()).catch(() =>
                        setSoundBlocked(true),
                      );
                    } else {
                      setMuted((value) => !value);
                    }
                  }}
                >
                  {muted || soundBlocked ? 'Включить звук' : 'Выключить звук'}
                </Button>
              )}
              <Button size="sm" variant="primary" iconAfter={<ArrowRight />} onClick={toRewards}>
                К наградам
              </Button>
            </div>
          </div>
        ) : (
          <div className="qc-streak-rewards">
            <div className="qc-celebration-glow" aria-hidden="true" />
            {reduced ? (
              <img className="qc-streak-poster" src={movie.poster} alt="" />
            ) : (
              <span className="qc-streak-trophy" aria-hidden="true">
                <Trophy />
                <b>5</b>
              </span>
            )}
            <p className="qc-streak-overline">
              {preview ? 'ТАК БУДЕТ ВЫГЛЯДЕТЬ ПОБЕДА' : 'ДОСТИЖЕНИЕ ОТКРЫТО'}
            </p>
            <h2 className="qc-celebration-title">Пять дней — твои!</h2>
            <p className="qc-celebration-message" role="status">
              {phase === 'done'
                ? preview
                  ? 'Это пробный показ. Настоящий баланс не изменился.'
                  : 'Кубок твой. Награды уже на счету!'
                : 'Забираем заслуженные награды…'}
            </p>
            <RewardPills reward={reward} flying={!reduced && phase === 'rewards'} />
            {movieFailed && (
              <p className="qc-streak-note">
                {preview
                  ? 'Ролик не загрузился. Показываем анимацию наград.'
                  : 'Ролик не загрузился. Награда сохранена.'}
              </p>
            )}
            {phase === 'done' && (
              <div className="qc-streak-actions">
                <PreviewNote preview={preview} />
                <Button variant="primary" block onClick={onClose}>
                  {preview ? 'Закрыть предпросмотр' : 'Отлично!'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

/**
 * Reward overlay: a passed task, a purchase, or the 5-day streak (movie, then flying coins and
 * XP). It only shows what the server has already granted; `preview` changes nothing.
 */
export function Celebration(props: CelebrationProps) {
  if (!props.open) return null;
  return props.variant === 'streak' ? (
    <StreakCelebration {...props} />
  ) : (
    <SimpleCelebration {...props} />
  );
}
