// Player of the `video_lesson` type (spec/01 §2.11–2.12, reference 18): the lesson video with
// our controls and the strip over the subtitles, honest watch tracking, «Просмотрено N% · Нужно
// M%», «Перейти к вопросам» once the watching rule is met, then the questions (AttemptFlow) and a
// result whose hints open the explaining fragment of the video.
import type { AttemptQuestionDto } from '@questclass/shared/attempts/dto';
import {
  DEFAULT_SHUTTER_PCT,
  VIDEO_LESSON_TYPE,
  WATCH_MODES,
  type WatchMode,
} from '@questclass/shared/task-types/video_lesson/contract';
import type {
  WatchProgressDto,
  WatchSessionDto,
} from '@questclass/shared/task-types/video_lesson/dto';
import {
  Button,
  ButtonLink,
  Check,
  CircleQuestionMark,
  formatTime,
  Gift,
  Inline,
  MediaPlayer,
  Notice,
  Play,
  ProgressBar,
  RewardLine,
  Spinner,
  Stack,
  Text,
  type Step,
} from '@questclass/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { api, isApiError } from '../../api/client';
import { AttemptFlow, type AttemptFrame } from '../../features/attempts/AttemptFlow';
import { TaskPlayer } from '../../templates/TaskPlayer';
import type { TaskPlayerProps, WebTaskType } from '../registry';
import { useShutter } from './controls/shutter';
import { HelpClip } from './HelpClip';
import { useWatchTracking } from './useWatchTracking';

interface PublicConfig {
  readonly mediaId: number | null;
  readonly watchMode: WatchMode;
  readonly shutter: { readonly enabled: boolean; readonly heightPct: number };
}

/** The learner's part of the config (`publicConfig`), with safe defaults. */
export function publicConfig(config: unknown): PublicConfig {
  const value = (config ?? {}) as Partial<PublicConfig>;
  return {
    mediaId: typeof value.mediaId === 'number' ? value.mediaId : null,
    watchMode: WATCH_MODES.includes(value.watchMode as WatchMode)
      ? (value.watchMode as WatchMode)
      : 'percent',
    shutter: {
      enabled: value.shutter?.enabled ?? true,
      heightPct: value.shutter?.heightPct ?? DEFAULT_SHUTTER_PCT,
    },
  };
}

function lessonSteps(stage: 'video' | 'quiz', passed: boolean): Step[] {
  return [
    {
      id: 'video',
      label: 'Видео',
      icon: <Play />,
      status: passed || stage === 'quiz' ? 'done' : 'current',
    },
    {
      id: 'quiz',
      label: 'Вопросы',
      icon: <CircleQuestionMark />,
      status: passed ? 'done' : stage === 'quiz' ? 'current' : 'todo',
    },
    { id: 'reward', label: 'Награда', icon: <Gift />, status: passed ? 'done' : 'todo' },
  ];
}

const startSession = (taskId: number) =>
  api<WatchSessionDto>(`/api/watch/${taskId}/sessions`, { method: 'POST' });

/** «Просмотрено N% · Нужно M%» and what the learner should do. */
function WatchStatus({ progress }: { readonly progress: WatchProgressDto }) {
  if (progress.mode === 'none') {
    return <Text tone="muted">Можно переходить к вопросам, когда будешь готов.</Text>;
  }
  if (progress.mode === 'manual') {
    return (
      <Notice tone={progress.confirmed ? 'success' : 'info'}>
        {progress.confirmed
          ? 'Родитель подтвердил просмотр. Можно переходить к вопросам.'
          : 'Просмотр этого урока подтверждает родитель.'}
      </Notice>
    );
  }
  const required = progress.requiredPercent ?? 0;
  return (
    <Stack gap="xs">
      <ProgressBar
        label={`Просмотрено ${progress.percent}%`}
        showLabel
        value={progress.percent}
        max={100}
        valueText={`Нужно ${required}%`}
      />
      {!progress.satisfied && (
        <Text tone="muted" size="sm">
          Посмотри {required}% видео — вопросы откроются.
        </Text>
      )}
    </Stack>
  );
}

export function VideoLessonPlayer({ task, subject, progress }: TaskPlayerProps) {
  const config = useMemo(() => publicConfig(task.config), [task.config]);
  const completed = progress?.completed ?? false;
  const [stage, setStage] = useState<'video' | 'quiz'>('video');
  const [watch, setWatch] = useState<WatchProgressDto | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [help, setHelp] = useState<AttemptQuestionDto | null>(null);
  const [shutter, setShutter] = useShutter(config.mediaId, config.shutter);

  const session = useMutation({ mutationFn: () => startSession(task.id) });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    session.mutate();
  }, [session]);

  const sessionId = session.data?.sessionId ?? null;
  const tracking = useWatchTracking({ taskId: task.id, sessionId, video, onProgress: setWatch });
  const media = session.data?.media ?? null;
  const source = useMemo(() => (media ? { kind: media.kind, src: media.src } : null), [media]);
  const current = watch ?? session.data?.progress ?? null;
  const resumeAt = session.data?.progress.lastPosition ?? 0;

  const frame = (
    parts: Pick<AttemptFrame, 'body' | 'actions' | 'passed'> & { stage: 'video' | 'quiz' },
  ): ReactElement => (
    <TaskPlayer
      title={task.title}
      subject={subject?.name}
      backHref="/"
      steps={lessonSteps(parts.stage, completed || (parts.passed ?? false))}
      actions={parts.actions}
    >
      {parts.body}
    </TaskPlayer>
  );

  if (stage === 'quiz') {
    return (
      <>
        <AttemptFlow
          task={task}
          frame={(parts) => frame({ ...parts, stage: 'quiz' })}
          onRewatch={() => setStage('video')}
          renderHelp={(question) =>
            question.evidence && media ? (
              <Button
                size="sm"
                icon={<Play aria-hidden="true" />}
                onClick={() => setHelp(question)}
              >
                Посмотреть объяснение
              </Button>
            ) : null
          }
        />
        {help && media && (
          <HelpClip
            taskId={task.id}
            sessionId={sessionId}
            media={media}
            question={help}
            onClose={() => setHelp(null)}
          />
        )}
      </>
    );
  }

  let player: ReactNode;
  if (session.isError) {
    const error = session.error;
    const gone = isApiError(error) && error.status === 410;
    player = (
      <Stack gap="sm">
        <Notice tone={gone ? 'info' : 'danger'}>{error.message}</Notice>
        {!gone && !(isApiError(error) && error.status === 409) && (
          <Inline>
            <Button onClick={() => session.mutate()}>Подключить видео заново</Button>
          </Inline>
        )}
      </Stack>
    );
  } else if (!source) {
    player = (
      <Inline justify="center">
        <Spinner size="lg" label="Подключаем видео…" />
      </Inline>
    );
  } else {
    player = (
      <MediaPlayer
        source={source}
        label={`Видео урока «${task.title}»`}
        startAt={resumeAt}
        shutter={shutter}
        onShutterChange={setShutter}
        onVideo={setVideo}
      />
    );
  }

  // Without a working video (deleted, not tracked) the server decides at the start of the attempt.
  const canAsk = completed || current?.satisfied === true || session.isError;
  return frame({
    stage: 'video',
    body: (
      <Stack gap="md">
        {player}
        {resumeAt > 0 && !completed && source && (
          <Text tone="subtle" size="sm">
            Продолжаем с места остановки: {formatTime(resumeAt)}.
          </Text>
        )}
        {current && <WatchStatus progress={current} />}
        {tracking.savedAt !== null && !tracking.error && (
          <Text tone="success" size="sm" role="status">
            ✓ Место остановки сохранено
          </Text>
        )}
        {tracking.error && <Notice tone="danger">{tracking.error}</Notice>}
        {task.description && <Text>{task.description}</Text>}
        {completed ? (
          <RewardLine label="Урок пройден. Награда уже получена." />
        ) : (
          <RewardLine label="Награда за пройденный тест" xp={task.xp} coins={task.coins} />
        )}
      </Stack>
    ),
    actions: completed ? (
      <ButtonLink href="/">К урокам</ButtonLink>
    ) : (
      <Button
        variant="primary"
        size="lg"
        icon={<Check aria-hidden="true" />}
        disabled={!canAsk}
        onClick={() => {
          video?.pause();
          setStage('quiz');
        }}
      >
        Перейти к вопросам
      </Button>
    ),
  });
}

export const videoLessonTaskType: WebTaskType = {
  type: VIDEO_LESSON_TYPE,
  label: 'Видеоурок',
  Player: VideoLessonPlayer,
};
