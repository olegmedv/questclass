// Admin side of a video lesson: how watching is checked, the threshold, the strip over burnt-in
// subtitles; then the question bank with the transcript. The video itself comes by import.
import {
  MAX_SHUTTER_PCT,
  MAX_WATCH_PERCENT,
  MIN_SHUTTER_PCT,
  MIN_WATCH_PERCENT,
  VIDEO_LESSON_TYPE,
  videoLessonConfigSchema,
  WATCH_MODES,
  type VideoLessonConfig,
  type WatchMode,
} from '@questclass/shared/task-types/video_lesson/contract';
import { Field, Notice, NumberInput, Select, Stack, Switch, Text } from '@questclass/ui';
import { QuestionBank } from '../../features/questions/QuestionBank';
import type { TaskEditorProps, TaskSectionsProps, TaskTypeAdmin } from '../registry';
import { ConfirmWatch } from './ConfirmWatch';

const MODE_LABEL: Readonly<Record<WatchMode, string>> = {
  percent: 'По проценту просмотра',
  none: 'Без условия',
  manual: 'Подтверждает родитель',
};

const MODE_HINT: Readonly<Record<WatchMode, string>> = {
  percent:
    'Вопросы откроются, когда ученик посмотрит нужную долю видео (считаются уникальные секунды).',
  none: 'Вопросы открыты сразу, видео можно перематывать.',
  manual: 'Вопросы откроются, когда родитель подтвердит просмотр в «Прогрессе».',
};

export function VideoLessonEditor({ config, onChange, disabled }: TaskEditorProps) {
  const parsed = videoLessonConfigSchema.safeParse(config);
  if (!parsed.success) {
    return (
      <Notice tone="danger">Настройки урока повреждены: {parsed.error.issues[0]?.message}</Notice>
    );
  }
  const value = parsed.data;
  const change = (patch: Partial<VideoLessonConfig>) => onChange({ ...value, ...patch });
  return (
    <Stack gap="md">
      <Text tone="muted">
        {value.mediaId === null
          ? 'Видео ещё нет: его загружает программа lesson-prep вместе с вопросами.'
          : `Видео урока: № ${value.mediaId}. Заменить его можно повторным импортом урока.`}
      </Text>
      <Field label="Как проверять просмотр" hint={MODE_HINT[value.watchMode]} disabled={disabled}>
        <Select
          options={WATCH_MODES.map((mode) => ({ value: mode, label: MODE_LABEL[mode] }))}
          value={value.watchMode}
          onChange={(event) => change({ watchMode: event.currentTarget.value as WatchMode })}
        />
      </Field>
      {value.watchMode === 'percent' && (
        <Field
          label="Сколько процентов посмотреть"
          hint={`От ${MIN_WATCH_PERCENT} до ${MAX_WATCH_PERCENT}. Пусто — как в общих настройках («Видео: сколько процентов нужно посмотреть»).`}
          disabled={disabled}
        >
          <NumberInput
            value={value.minWatchPercent ?? null}
            min={MIN_WATCH_PERCENT}
            max={MAX_WATCH_PERCENT}
            suffix="%"
            onChange={(percent) => {
              const { minWatchPercent: _, ...rest } = value;
              onChange(percent === null ? rest : { ...rest, minWatchPercent: percent });
            }}
          />
        </Field>
      )}
      <Switch
        label="Чёрная полоса над субтитрами"
        description="Закрывает вшитые в видео субтитры; ученик может подвинуть её на своём устройстве."
        checked={value.shutter.enabled}
        disabled={disabled}
        onChange={(enabled) => change({ shutter: { ...value.shutter, enabled } })}
      />
      {value.shutter.enabled && (
        <Field
          label="Высота полосы"
          hint={`От ${MIN_SHUTTER_PCT} до ${MAX_SHUTTER_PCT} % кадра.`}
          disabled={disabled}
        >
          <NumberInput
            value={value.shutter.heightPct}
            min={MIN_SHUTTER_PCT}
            max={MAX_SHUTTER_PCT}
            suffix="%"
            onChange={(heightPct) =>
              change({ shutter: { ...value.shutter, heightPct: heightPct ?? MIN_SHUTTER_PCT } })
            }
          />
        </Field>
      )}
    </Stack>
  );
}

function VideoLessonSections({ task }: TaskSectionsProps) {
  return <QuestionBank taskId={task.id} withTranscript />;
}

export const videoLessonAdmin: TaskTypeAdmin = {
  type: VIDEO_LESSON_TYPE,
  Editor: VideoLessonEditor,
  Sections: VideoLessonSections,
  ProgressActions: ConfirmWatch,
};
