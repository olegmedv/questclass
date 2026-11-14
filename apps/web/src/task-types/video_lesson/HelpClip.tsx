// A hint from the result screen (decision 14.11.2026: only after answering): the fragment of the
// lesson that explains the question, from 3 s before its start to its end. It is reported as
// `help` and never counts as watching.
import type { AttemptQuestionDto } from '@questclass/shared/attempts/dto';
import type { WatchMediaDto } from '@questclass/shared/task-types/video_lesson/dto';
import { Button, formatTime, MediaPlayer, Modal, Text } from '@questclass/ui';
import { useMemo, useState } from 'react';
import { useWatchTracking } from './useWatchTracking';

export interface HelpClipProps {
  readonly taskId: number;
  readonly sessionId: number | null;
  readonly media: WatchMediaDto;
  readonly question: AttemptQuestionDto;
  readonly onClose: () => void;
}

export function HelpClip({ taskId, sessionId, media, question, onClose }: HelpClipProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useWatchTracking({ taskId, sessionId, video, kind: 'help' });
  const evidence = question.evidence;
  const source = useMemo(() => ({ kind: media.kind, src: media.src }), [media.kind, media.src]);
  if (!evidence) return null;
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Помощь к вопросу"
      description={`Объяснение начнётся с ${formatTime(Math.max(0, evidence.start - 3))}. Когда оно закончится, вернёмся к результату.`}
      footer={<Button onClick={onClose}>Вернуться к результату</Button>}
    >
      <Text weight="bold">{question.text}</Text>
      <MediaPlayer
        source={source}
        label="Объяснение к вопросу"
        clip={{ start: evidence.start, end: evidence.end, onEnd: onClose }}
        autoPlay
        onVideo={setVideo}
      />
    </Modal>
  );
}
