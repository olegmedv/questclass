// The card of the next lesson on the home: subject, title, the live hero (3 s), CTA and steps.
import { ButtonLink, Flag, LessonCard } from '@questclass/ui';
import { LiveHero } from '../animation/LiveHero';
import { lookArt, useCharacter } from '../character/useCharacter';
import { STARTER_HERO } from './assets';
import { ctaLabel, lessonDateText, lessonSteps, type LessonView } from './model';
import { SubjectIcon } from './SubjectIcon';

/** The worn look of the learner (the starter hero until the character has loaded). */
function useWornHero() {
  const character = useCharacter();
  const art = character.data?.look ? lookArt(character.data.look) : null;
  if (!art) return STARTER_HERO;
  return {
    poster: art.poster,
    sprite: art.sprite,
    src: art.src,
    motion: art.motion,
    alt: 'Твой герой',
  };
}

export function NextLesson({ lesson }: { readonly lesson: LessonView }) {
  const { task, subject } = lesson;
  const hero = useWornHero();
  const meta = [lessonDateText(task.lessonDate), task.assigned ? 'Задание от родителя' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <LessonCard
      subject={
        subject ? { name: subject.name, icon: <SubjectIcon subject={subject} /> } : undefined
      }
      title={task.title}
      meta={meta || undefined}
      hero={<LiveHero {...hero} mode="autoplay-3s" controls={false} />}
      action={
        <ButtonLink
          href={`/tasks/${task.id}`}
          variant="start"
          size="lg"
          block
          icon={<Flag aria-hidden="true" />}
        >
          {ctaLabel(lesson)}
        </ButtonLink>
      }
      steps={lessonSteps(lesson)}
    />
  );
}
