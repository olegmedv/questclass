// /dev/templates/:name — the five screen templates on demo data (for review and e2e screenshots).
// Nothing here talks to the API.
import {
  Badge,
  BookOpen,
  Button,
  ButtonLink,
  Card,
  CircleQuestionMark,
  Coins,
  DataTable,
  EmptyState,
  Flag,
  Gift,
  Grid,
  Heading,
  House,
  Inline,
  ItemCard,
  OptionTile,
  Play,
  ProgressRing,
  QuestionCard,
  SegmentedControl,
  Settings,
  ShoppingBag,
  Sparkles,
  Stack,
  StatChip,
  StepList,
  Text,
  Ticket,
  Users,
  type Column,
} from '@questclass/ui';
import { useState } from 'react';
import { useParams } from 'react-router';
import { AdminPage, AdminShell } from '../../templates/AdminShell';
import { Catalog } from '../../templates/Catalog';
import { LearnerShell } from '../../templates/LearnerShell';
import { ProgressView } from '../../templates/ProgressView';
import { TaskPlayer } from '../../templates/TaskPlayer';

const TEMPLATES = ['learner', 'task', 'catalog', 'progress', 'admin'] as const;
type TemplateName = (typeof TEMPLATES)[number];

const LEARNER = { name: 'Саша', avatar: null };
const STATS = { level: 4, xp: 1131, coins: 30, wishes: 1 };
const noop = () => {};

function LearnerDemo() {
  const [view, setView] = useState<'lessons' | 'games'>('lessons');
  return (
    <LearnerShell
      learner={LEARNER}
      stats={STATS}
      active="study"
      onSwitchLearner={noop}
      onParents={noop}
    >
      <Stack gap="md">
        <Inline justify="between">
          <Heading level={1} size="md">
            Саша, начнём?
          </Heading>
          <SegmentedControl
            label="Что показать"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'lessons', label: 'Уроки' },
              { value: 'games', label: 'Игры' },
            ]}
          />
        </Inline>
        <Card>
          <Stack gap="md">
            <Inline gap="sm">
              <img src="/assets/game/subjects-pixel/math.webp" alt="" width={27} height={27} />
              <Text tone="blue" weight="semibold">
                Математика
              </Text>
            </Inline>
            <Grid min="sm">
              <Heading level={2} size="lg">
                Сложение и вычитание в пределах 100
              </Heading>
              <img src="/assets/game/characters/vampire-boy.webp" alt="Вампир" />
            </Grid>
            <Button variant="start" size="lg" block icon={<Flag />}>
              Начать урок
            </Button>
            <StepList
              label="Шаги урока"
              steps={[
                { id: 'video', label: 'Видео', icon: <Play />, status: 'current' },
                { id: 'quiz', label: 'Тест', icon: <CircleQuestionMark />, status: 'todo' },
                { id: 'reward', label: 'Награда', icon: <Gift />, status: 'todo' },
              ]}
            />
          </Stack>
        </Card>
        <Button block icon={<BookOpen />}>
          Выбрать предмет или урок
        </Button>
      </Stack>
    </LearnerShell>
  );
}

function TaskDemo() {
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <TaskPlayer
      subject="Математика"
      title="Сложение и вычитание в пределах 100"
      backHref="/dev/templates/learner"
      steps={[
        { id: 'video', label: 'Видео', icon: <Play />, status: 'done' },
        { id: 'quiz', label: 'Тест', icon: <CircleQuestionMark />, status: 'current' },
        { id: 'reward', label: 'Награда', icon: <Gift />, status: 'todo' },
      ]}
      actions={
        <>
          <Button variant="ghost">Пропустить</Button>
          <Button variant="primary" disabled={answer === null}>
            Ответить
          </Button>
        </>
      }
    >
      <QuestionCard index={3} total={8} text="Сколько будет 48 + 25?">
        {['73', '63', '83', '72'].map((option, i) => (
          <OptionTile
            key={option}
            letter={'АБВГ'[i]}
            state={answer === option ? 'selected' : 'idle'}
            onClick={() => setAnswer(option)}
          >
            {option}
          </OptionTile>
        ))}
      </QuestionCard>
    </TaskPlayer>
  );
}

interface Good {
  readonly id: string;
  readonly kind: 'hero' | 'room';
  readonly title: string;
  readonly image: string;
  readonly price: number;
  readonly live?: boolean;
  readonly owned?: boolean;
}

const GOODS: readonly Good[] = [
  {
    id: 'vampire',
    kind: 'hero',
    title: 'Вампир',
    image: '/assets/game/characters/vampire-boy.webp',
    price: 40,
    owned: true,
  },
  {
    id: 'fairy',
    kind: 'hero',
    title: 'Фея',
    image: '/assets/game/characters/fairy-boy.webp',
    price: 40,
    live: true,
  },
  {
    id: 'pizza',
    kind: 'hero',
    title: 'Пицца-парень',
    image: '/assets/game/characters/pizza-boy.webp',
    price: 40,
  },
  {
    id: 'astro',
    kind: 'hero',
    title: 'Астро',
    image: '/assets/game/characters/astro.webp',
    price: 120,
    live: true,
  },
  {
    id: 'dracula',
    kind: 'room',
    title: 'Комната Дракулы',
    image: '/assets/game/rooms/room-dracula-thumb.webp',
    price: 120,
  },
  {
    id: 'forest',
    kind: 'room',
    title: 'Лесной домик',
    image: '/assets/game/rooms/room-forest-house-thumb.webp',
    price: 200,
  },
];

function CatalogDemo() {
  const [filter, setFilter] = useState<'hero' | 'room'>('hero');
  const [open, setOpen] = useState<Good | null>(null);
  const balance = 100;
  return (
    <LearnerShell
      learner={LEARNER}
      stats={STATS}
      active="shop"
      onSwitchLearner={noop}
      onParents={noop}
    >
      <Catalog
        title="Магазин желаний"
        description="За монеты — персонажи, комнаты и желания."
        actions={
          <ButtonLink href="/dev/templates/catalog" size="sm" icon={<Ticket />}>
            Мои желания
          </ButtonLink>
        }
        filter={{
          label: 'Что купить',
          value: filter,
          onChange: setFilter,
          items: [
            { id: 'hero', label: 'Герои' },
            { id: 'room', label: 'Комнаты' },
          ],
        }}
        items={GOODS.filter((good) => good.kind === filter)}
        itemKey={(good) => good.id}
        onOpen={setOpen}
        renderItem={(good, openDetails) => (
          <ItemCard
            title={good.title}
            media={{ src: good.image, alt: good.title }}
            pixelated={good.kind === 'hero'}
            badge={
              good.live ? (
                <Badge tone="live" icon={<Sparkles />}>
                  Живой
                </Badge>
              ) : undefined
            }
            footer={
              good.owned ? (
                <Badge tone="success">Куплено</Badge>
              ) : (
                <Stack gap="xs" align="center">
                  <StatChip kind="coins" label="Цена" value={good.price} />
                  {good.price > balance && (
                    <Text size="xs" tone="muted">
                      Ещё {good.price - balance} монет
                    </Text>
                  )}
                </Stack>
              )
            }
            onClick={openDetails}
          />
        )}
        details={{
          item: open,
          title: (good) => good.title,
          onClose: () => setOpen(null),
          render: (good) => (
            <Stack align="center">
              <img src={good.image} alt={good.title} width={180} />
              <Text>
                Потратишь {good.price} монет, останется {Math.max(0, balance - good.price)}.
              </Text>
            </Stack>
          ),
          footer: (good) => (
            <Button variant="primary" icon={<Coins />} disabled={good.price > balance}>
              Купить за {good.price}
            </Button>
          ),
        }}
        empty={{ title: 'Здесь пока пусто' }}
      />
    </LearnerShell>
  );
}

interface HistoryRow {
  readonly id: number;
  readonly date: string;
  readonly event: string;
  readonly xp: number;
  readonly coins: number;
}

const HISTORY: readonly HistoryRow[] = [
  { id: 1, date: '14.11', event: 'Тест «Сложение в пределах 100»', xp: 100, coins: 350 },
  { id: 2, date: '13.11', event: 'Покупка «Вампир»', xp: 0, coins: -40 },
  { id: 3, date: '12.11', event: 'От мамы: «Убрал комнату»', xp: 0, coins: 50 },
];

const HISTORY_COLUMNS: Column<HistoryRow>[] = [
  { key: 'date', header: 'Дата' },
  { key: 'event', header: 'Событие' },
  { key: 'xp', header: 'XP', align: 'end', secondary: true },
  { key: 'coins', header: 'Монеты', align: 'end' },
];

function ProgressDemo() {
  return (
    <LearnerShell
      learner={LEARNER}
      stats={STATS}
      active={null}
      onSwitchLearner={noop}
      onParents={noop}
    >
      <ProgressView
        title="Мой прогресс"
        description="Пройденные уроки, серия и все начисления."
        totals={[
          { id: 'level', label: 'Уровень', value: 4, kind: 'level', hint: 'До 5-го — 69 XP' },
          { id: 'xp', label: 'Опыт', value: '1 131', kind: 'xp' },
          { id: 'coins', label: 'Монеты', value: 30, kind: 'coins' },
          { id: 'done', label: 'Уроков пройдено', value: 12, kind: 'neutral' },
        ]}
        streak={
          <Card title="Серия занятий" description="День засчитывается после урока и теста.">
            <Inline gap="md">
              <ProgressRing label="Серия" value={3} max={5}>
                3/5
              </ProgressRing>
              <Text tone="muted">Ещё 2 дня — и бонус +200 монет.</Text>
            </Inline>
          </Card>
        }
        history={{
          caption: 'История начислений',
          columns: HISTORY_COLUMNS,
          rows: HISTORY,
          rowKey: (row) => row.id,
        }}
      />
    </LearnerShell>
  );
}

interface UserRow {
  readonly id: number;
  readonly name: string;
  readonly role: string;
  readonly status: string;
}

const USERS: readonly UserRow[] = [
  { id: 1, name: 'Мама', role: 'Админ', status: 'Активен' },
  { id: 2, name: 'Саша', role: 'Ученик', status: 'Активен' },
];

function AdminDemo() {
  return (
    <AdminShell
      adminName="Мама"
      onLogout={noop}
      active="users"
      sections={[
        { id: 'home', label: 'Главная', href: '/dev/templates/admin', icon: <House /> },
        { id: 'users', label: 'Пользователи', href: '/dev/templates/admin', icon: <Users /> },
        { id: 'tasks', label: 'Задания', href: '/dev/templates/admin', icon: <BookOpen /> },
        { id: 'shop', label: 'Магазин', href: '/dev/templates/admin', icon: <ShoppingBag /> },
        { id: 'settings', label: 'Настройки', href: '/dev/templates/admin', icon: <Settings /> },
      ]}
    >
      <AdminPage
        title="Пользователи"
        description="Админы и ученики. Удаления нет — только деактивация."
        actions={<Button variant="primary">Добавить</Button>}
      >
        <DataTable
          caption="Пользователи"
          captionHidden
          columns={[
            { key: 'name', header: 'Имя' },
            { key: 'role', header: 'Роль' },
            {
              key: 'status',
              header: 'Статус',
              render: (row: UserRow) => <Badge tone="success">{row.status}</Badge>,
            },
          ]}
          rows={USERS}
          rowKey={(row) => row.id}
        />
      </AdminPage>
    </AdminShell>
  );
}

export function TemplateDemos() {
  const { name } = useParams();
  switch (name as TemplateName | undefined) {
    case 'learner':
      return <LearnerDemo />;
    case 'task':
      return <TaskDemo />;
    case 'catalog':
      return <CatalogDemo />;
    case 'progress':
      return <ProgressDemo />;
    case 'admin':
      return <AdminDemo />;
    default:
      return (
        <EmptyState
          headingLevel={1}
          title="Такого шаблона нет"
          actions={TEMPLATES.map((template) => (
            <ButtonLink key={template} href={`/dev/templates/${template}`} size="sm">
              {template}
            </ButtonLink>
          ))}
        />
      );
  }
}
