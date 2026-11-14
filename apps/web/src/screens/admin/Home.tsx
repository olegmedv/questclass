// /admin — «Кабинет родителя» (reference 21): search over actions and settings, what waits for
// the parent right now (cards of the queues with links), quick actions and every section.
import type { AdminInboxDto } from '@questclass/shared/inbox/dto';
import {
  ActionList,
  ActionRow,
  Badge,
  Button,
  ButtonLink,
  Card,
  Field,
  Grid,
  Heading,
  Inline,
  Notice,
  Search,
  Skeleton,
  Stack,
  Text,
  TextInput,
  type BadgeTone,
} from '@questclass/ui';
import { useMemo, useState } from 'react';
import { ADMIN_SECTIONS } from '../../app/layouts';
import { errorText } from '../../features/admin/forms';
import { useAdminInbox } from '../../features/admin-inbox/queries';
import { searchAdmin } from '../../features/admin-inbox/search';
import { AdminPage } from '../../templates/AdminShell';

interface Queue {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly action: string;
  readonly count: (inbox: AdminInboxDto) => number;
  /** Short status chip: «Ждут выдачи: 2». */
  readonly chip: string;
}

const QUEUES: readonly Queue[] = [
  {
    id: 'chores',
    title: 'Дела на проверку',
    description: 'Ученик отметил «Я сделал» — засчитайте или верните с комментарием.',
    href: '/admin/reviews',
    action: 'Проверить дела',
    count: (inbox) => inbox.choreReviews,
    chip: 'Дела на проверку',
  },
  {
    id: 'wishes',
    title: 'Желания и Robux к выдаче',
    description: 'Ученик нажал «Хочу использовать» у билета.',
    href: '/admin/wishes',
    action: 'Выдать желание',
    count: (inbox) => inbox.wishRequests,
    chip: 'Ждут выдачи',
  },
  {
    id: 'retries',
    title: 'Просьбы о пересдаче',
    description: 'Бесплатные попытки теста кончились, ученик просит ещё одну.',
    href: '/admin/reviews?queue=retries',
    action: 'Разрешить пересдачу',
    count: (inbox) => inbox.retryRequests,
    chip: 'Просят пересдачу',
  },
  {
    id: 'watch',
    title: 'Просмотры ждут подтверждения',
    description: 'Уроки в режиме «подтверждает родитель», которые ученик открыл.',
    href: '/admin/progress',
    action: 'Открыть прогресс',
    count: (inbox) => inbox.watchConfirmations,
    chip: 'Ждут подтверждения просмотра',
  },
  {
    id: 'revisions',
    title: 'Ревизии импорта',
    description: 'Повторный импорт предлагает изменить опубликованные уроки.',
    href: '/admin/tasks/revisions',
    action: 'Посмотреть ревизии',
    count: (inbox) => inbox.importRevisions,
    chip: 'Ревизии импорта',
  },
];

/** What each section is for, in the words of the home cards. */
const SECTION_TEXT: Readonly<Record<string, string>> = {
  device: 'Детский планшет: выбор ученика и вход по PIN',
  users: 'Ученики и взрослые, PIN и пароли',
  tasks: 'Уроки, тесты и дела: вопросы, публикация, назначения',
  subjects: 'Названия, значки и порядок предметов',
  progress: 'Как идут задания: закрыть, переоткрыть, сбросить',
  reviews: 'Дела на проверку и просьбы о пересдаче',
  awards: 'Начислить монеты и опыт, причины наград',
  shop: 'Товары магазина: образы, комнаты, билеты',
  wishes: 'Выдать желания и Robux',
  history: 'Начисления и действия в кабинете',
  settings: 'Часовой пояс, тесты, видео, ключи, импорт',
  profile: 'Сменить свой пароль',
};

function QueueCard({
  queue,
  count,
  failed,
}: {
  queue: Queue;
  count: number | null;
  failed: boolean;
}) {
  const tone: BadgeTone = count === null ? 'neutral' : count > 0 ? 'warning' : 'success';
  return (
    <Card
      as="article"
      headingLevel={3}
      title={queue.title}
      description={queue.description}
      actions={
        failed ? (
          <Badge>—</Badge>
        ) : count === null ? (
          <Skeleton />
        ) : (
          <Badge tone={tone}>{count > 0 ? String(count) : 'нет'}</Badge>
        )
      }
    >
      <Inline>
        <ButtonLink href={queue.href} size="sm" variant={count ? 'primary' : 'secondary'}>
          {queue.action}
        </ButtonLink>
      </Inline>
    </Card>
  );
}

function SearchBox() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchAdmin(query), [query]);
  return (
    <Card title="Найти действие или настройку" headingLevel={2}>
      <Stack gap="sm" role="search">
        <Field label="Поиск по кабинету" labelHidden>
          <TextInput
            icon={<Search />}
            type="search"
            placeholder="Например: субтитры, монеты, ещё попытка"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </Field>
        {query.trim() !== '' && (
          <ActionList
            label="Найдено"
            empty="Ничего не нашлось. Попробуйте другое слово."
            items={results.map((entry) => ({
              id: entry.id,
              title: entry.title,
              description: ['Кабинет', ...entry.trail].join(' › '),
              href: entry.href,
            }))}
          />
        )}
      </Stack>
    </Card>
  );
}

export function Home() {
  const inbox = useAdminInbox();
  const counts = inbox.data
    ? QUEUES.map((queue) => ({ queue, count: queue.count(inbox.data) }))
    : null;
  const waiting = counts?.filter((item) => item.count > 0) ?? [];
  return (
    <AdminPage title="Кабинет родителя" description="Уроки, награды и настройки ребёнка.">
      <SearchBox />
      <Stack gap="sm">
        <Heading level={2} size="lg">
          Что нужно сделать?
        </Heading>
        <Text tone="muted">Очереди обновляются сами раз в минуту.</Text>
        {counts && (
          <Inline gap="xs" aria-label="Сейчас ждут">
            {waiting.length === 0 ? (
              <Badge tone="success">Всё сделано</Badge>
            ) : (
              waiting.map(({ queue, count }) => (
                <Badge key={queue.id} tone="warning">
                  {queue.chip}: {count}
                </Badge>
              ))
            )}
            {inbox.data && inbox.data.robuxRequested > 0 && (
              <Badge tone="gold">Robux к выдаче: {inbox.data.robuxRequested}</Badge>
            )}
          </Inline>
        )}
        <Inline aria-label="Быстрые действия">
          <ButtonLink href="/admin/wishes">Выдать желание</ButtonLink>
          <ButtonLink href="/admin/reviews">Проверить дела</ButtonLink>
          <ButtonLink href="/admin/tasks">Открыть задания</ButtonLink>
        </Inline>
      </Stack>
      {inbox.isError && (
        <Notice
          tone="warning"
          action={
            <Button size="sm" onClick={() => void inbox.refetch()}>
              Повторить
            </Button>
          }
        >
          Не получилось загрузить очереди: {errorText(inbox.error)}
        </Notice>
      )}
      <Grid as="ul" min="lg" aria-label="Очереди">
        {QUEUES.map((queue) => (
          <li key={queue.id}>
            <QueueCard
              queue={queue}
              count={inbox.data ? queue.count(inbox.data) : null}
              failed={inbox.isError}
            />
          </li>
        ))}
      </Grid>
      <Stack gap="sm">
        <Heading level={2} size="lg">
          Все разделы
        </Heading>
        <Grid as="ul" min="lg" gap="sm" aria-label="Разделы кабинета">
          {ADMIN_SECTIONS.filter((section) => section.id !== 'home').map((section) => (
            <li key={section.id}>
              <ActionRow
                id={section.id}
                title={section.label}
                description={SECTION_TEXT[section.id]}
                href={section.href}
              />
            </li>
          ))}
        </Grid>
      </Stack>
    </AdminPage>
  );
}
