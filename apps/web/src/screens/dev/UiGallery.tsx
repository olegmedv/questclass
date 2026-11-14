// /dev/ui — every design-system component in the states default, disabled, loading, empty and
// error (CLAUDE.md rule 8). Built only from @questclass/ui; no CSS of its own.
import {
  Accordion,
  AnimatedHero,
  Avatar,
  Badge,
  BookOpen,
  Button,
  buttonClassName,
  Card,
  Checkbox,
  CircleQuestionMark,
  Container,
  DataTable,
  DateTimeInput,
  Drawer,
  EmptyState,
  Field,
  FileInput,
  Flag,
  Gift,
  Grid,
  Heading,
  IconButton,
  Inline,
  ItemCard,
  Menu,
  Modal,
  NumberInput,
  OptionTile,
  PinPad,
  Placeholder,
  Play,
  ProgressBar,
  ProgressRing,
  QuestionCard,
  Search,
  SegmentedControl,
  Select,
  Settings,
  Sheet,
  Skeleton,
  Slider,
  Sparkles,
  Spinner,
  Stack,
  StatChip,
  StepList,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Toast,
  ToastProvider,
  Tooltip,
  Trophy,
  useToast,
  type Column,
} from '@questclass/ui';
import { useState, type ReactNode } from 'react';
import { LiveHero } from '../../features/animation/LiveHero';
import { describeHero, LIVE_HEROES } from './liveHeroes';

type StateName = 'default' | 'disabled' | 'loading' | 'empty' | 'error';

const STATE_LABELS: Record<StateName, string> = {
  default: 'Обычное',
  disabled: 'Недоступно',
  loading: 'Загрузка',
  empty: 'Пусто',
  error: 'Ошибка',
};

const STATES = Object.keys(STATE_LABELS) as StateName[];

/** A state either shows the component or explains why it does not apply. */
type StateDemo = ReactNode | { readonly na: string };

const isNotApplicable = (demo: StateDemo): demo is { na: string } =>
  typeof demo === 'object' && demo !== null && 'na' in demo;

function Demo({
  id,
  title,
  description,
  states,
}: {
  id: string;
  title: string;
  description?: string;
  states: Record<StateName, StateDemo>;
}) {
  return (
    <Card id={id} title={title} description={description} data-gallery={id}>
      <Stack gap="md">
        {STATES.map((state) => {
          const demo = states[state];
          return (
            <Stack key={state} gap="sm" data-state={state}>
              <Inline>
                <Badge
                  tone={state === 'error' ? 'danger' : state === 'default' ? 'info' : 'neutral'}
                >
                  {STATE_LABELS[state]}
                </Badge>
              </Inline>
              {isNotApplicable(demo) ? (
                <Text tone="subtle" size="sm">
                  Не применимо: {demo.na}
                </Text>
              ) : (
                (demo as ReactNode)
              )}
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}

const HERO = { src: '/assets/game/characters/vampire-boy.webp', alt: 'Вампир' };
const STAR = '/assets/game/characters/star-hero.webp';

function OverlayDemo({ kind }: { kind: 'modal' | 'sheet' | 'drawer' }) {
  const [open, setOpen] = useState<StateName | null>(null);
  const Overlay = kind === 'modal' ? Modal : kind === 'sheet' ? Sheet : Drawer;
  const title = { modal: 'Модальное окно', sheet: 'Нижняя панель', drawer: 'Боковая панель' }[kind];
  const close = () => setOpen(null);
  const body: Record<StateName, ReactNode> = {
    default: (
      <Field label="Имя ребёнка">
        <TextInput placeholder="Например, Саша" />
      </Field>
    ),
    disabled: (
      <Field label="Имя ребёнка" disabled>
        <TextInput value="Саша" readOnly />
      </Field>
    ),
    loading: <Skeleton lines={3} />,
    empty: <EmptyState title="Здесь пока пусто" description="Добавьте первый элемент." />,
    error: (
      <Field label="PIN" error="PIN — от 4 до 8 цифр">
        <TextInput value="12" readOnly />
      </Field>
    ),
  };
  const opener = (state: StateName) => (
    <Button onClick={() => setOpen(state)}>Открыть: {STATE_LABELS[state].toLowerCase()}</Button>
  );
  return (
    <>
      <Demo
        id={kind}
        title={title}
        description="Фокус внутри окна, Escape и крестик закрывают, фокус возвращается на кнопку."
        states={{
          default: opener('default'),
          disabled: opener('disabled'),
          loading: opener('loading'),
          empty: opener('empty'),
          error: opener('error'),
        }}
      />
      <Overlay
        open={open !== null}
        onClose={close}
        title={title}
        description="Настройки сохраняются на этом устройстве."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Отмена
            </Button>
            <Button variant="primary" loading={open === 'loading'} disabled={open === 'disabled'}>
              Сохранить
            </Button>
          </>
        }
      >
        {open && body[open]}
      </Overlay>
    </>
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <Demo
      id="toast"
      title="Toast"
      states={{
        default: (
          <Stack gap="sm">
            <Toast tone="success">Куплено! Осталось 120 монет.</Toast>
            <Inline>
              <Button size="sm" onClick={() => toast.show('Сохранено', { tone: 'success' })}>
                Показать тост
              </Button>
            </Inline>
          </Stack>
        ),
        disabled: { na: 'тост не нажимается' },
        loading: <Toast tone="info">Сохраняем…</Toast>,
        empty: { na: 'пустой тост не показывается' },
        error: <Toast tone="error">Не хватает 40 монет</Toast>,
      }}
    />
  );
}

function PinPadDemo() {
  const [pin, setPin] = useState('');
  const [empty, setEmpty] = useState('');
  return (
    <Demo
      id="pinpad"
      title="PinPad"
      description="Работает и с клавиатуры (только первая панель на этой странице)."
      states={{
        default: <PinPad value={pin} onChange={setPin} onSubmit={() => setPin('')} />,
        disabled: (
          <PinPad value="12" onChange={() => {}} onSubmit={() => {}} disabled keyboard={false} />
        ),
        loading: (
          <PinPad value="1234" onChange={() => {}} onSubmit={() => {}} loading keyboard={false} />
        ),
        empty: <PinPad value={empty} onChange={setEmpty} onSubmit={() => {}} keyboard={false} />,
        error: (
          <PinPad
            value=""
            onChange={() => {}}
            onSubmit={() => {}}
            error="Неверный PIN. Попробуйте через 8 с"
            keyboard={false}
          />
        ),
      }}
    />
  );
}

interface Row {
  readonly id: number;
  readonly name: string;
  readonly role: string;
  readonly coins: number;
}

const rows: Row[] = [
  { id: 1, name: 'Мама', role: 'Админ', coins: 0 },
  { id: 2, name: 'Саша', role: 'Ученик', coins: 350 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Имя' },
  { key: 'role', header: 'Роль', secondary: true },
  { key: 'coins', header: 'Монеты', align: 'end' },
];

export function UiGallery() {
  const [tab, setTab] = useState<'from' | 'tickets'>('from');
  const [view, setView] = useState<'lessons' | 'games'>('lessons');
  const [sound, setSound] = useState(true);
  const [assigned, setAssigned] = useState(true);
  const [coins, setCoins] = useState<number | null>(350);
  const [volume, setVolume] = useState(55);
  const [text, setText] = useState('Посмотри урок до конца.');
  const [answer, setAnswer] = useState<string | null>(null);

  const sections: [string, string][] = [
    ['button', 'Button'],
    ['icon-button', 'IconButton'],
    ['card', 'Card'],
    ['item-card', 'ItemCard'],
    ['modal', 'Modal'],
    ['sheet', 'Sheet'],
    ['drawer', 'Drawer'],
    ['tabs', 'Tabs'],
    ['segmented', 'SegmentedControl'],
    ['progress', 'ProgressBar'],
    ['ring', 'ProgressRing'],
    ['stat', 'StatChip'],
    ['badge', 'Badge'],
    ['avatar', 'Avatar'],
    ['steps', 'StepList'],
    ['empty', 'EmptyState'],
    ['toast', 'Toast'],
    ['tooltip', 'Tooltip'],
    ['placeholder', 'Placeholder'],
    ['field', 'Field'],
    ['select', 'Select'],
    ['switch', 'Switch'],
    ['checkbox', 'Checkbox'],
    ['number', 'NumberInput'],
    ['slider', 'Slider'],
    ['textarea', 'Textarea'],
    ['datetime', 'DateTimeInput'],
    ['file', 'FileInput'],
    ['accordion', 'Accordion'],
    ['table', 'DataTable'],
    ['pinpad', 'PinPad'],
    ['spinner', 'Spinner'],
    ['question', 'QuestionCard'],
    ['option', 'OptionTile'],
    ['skeleton', 'Skeleton'],
    ['typography', 'Heading и Text'],
    ['animated-hero', 'AnimatedHero'],
    ['live-heroes', 'Живые герои'],
  ];

  return (
    <ToastProvider>
      <Container width="admin" padded>
        <Stack as="section" gap="lg" aria-labelledby="gallery-title">
          <Stack gap="sm">
            <Heading level={1} size="display" id="gallery-title">
              Галерея компонентов
            </Heading>
            <Text tone="muted">
              Все компоненты дизайн-системы в состояниях «обычное», «недоступно», «загрузка»,
              «пусто» и «ошибка». Экраны собираются только из них.
            </Text>
            <Inline as="nav" aria-label="Компоненты" gap="xs">
              {sections.map(([id, name]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={buttonClassName({ variant: 'ghost', size: 'sm' })}
                >
                  {name}
                </a>
              ))}
            </Inline>
          </Stack>

          <Demo
            id="button"
            title="Button"
            description="primary — тёплый акцент; start — большая жёлтая «Начать»; secondary, ghost, danger."
            states={{
              default: (
                <Inline>
                  <Button variant="start" size="lg" icon={<Flag />}>
                    Начать урок
                  </Button>
                  <Button variant="primary">Войти</Button>
                  <Button>Открыть уроки</Button>
                  <Button variant="ghost">Отмена</Button>
                  <Button variant="danger">Отозвать</Button>
                </Inline>
              ),
              disabled: (
                <Inline>
                  <Button variant="start" disabled>
                    Начать урок
                  </Button>
                  <Button variant="primary" disabled>
                    Войти
                  </Button>
                  <Button disabled>Открыть уроки</Button>
                </Inline>
              ),
              loading: (
                <Inline>
                  <Button variant="primary" loading>
                    Сохраняем
                  </Button>
                  <Button loading>Загружаем</Button>
                </Inline>
              ),
              empty: { na: 'у кнопки всегда есть подпись' },
              error: (
                <Button variant="danger" icon={<CircleQuestionMark />}>
                  Повторить
                </Button>
              ),
            }}
          />

          <Demo
            id="icon-button"
            title="IconButton"
            states={{
              default: (
                <Inline>
                  <IconButton label="Меню" icon={<Menu />} />
                  <IconButton label="Награды" icon={<Trophy />} variant="secondary" badge={2} />
                  <IconButton label="Звук" icon={<Play />} pressed />
                </Inline>
              ),
              disabled: <IconButton label="Настройки" icon={<Settings />} disabled />,
              loading: <IconButton label="Обновить" icon={<Settings />} loading />,
              empty: { na: 'у кнопки всегда есть значок и подпись' },
              error: { na: 'ошибку показывает экран, а не кнопка' },
            }}
          />

          <Demo
            id="card"
            title="Card"
            states={{
              default: (
                <Card title="Серия занятий" description="День засчитывается после урока и теста.">
                  <Text>3 из 5 дней</Text>
                </Card>
              ),
              disabled: (
                <Card title="Игры" tone="raised" description="Откроются после уроков">
                  <Text tone="subtle">Пока закрыто</Text>
                </Card>
              ),
              loading: <Card title="История" loading />,
              empty: (
                <Card title="Задания от родителя">
                  <EmptyState title="Заданий нет" plain />
                </Card>
              ),
              error: (
                <Card title="Не получилось загрузить" tone="danger">
                  <Text tone="danger">Сервер недоступен. Попробуйте позже.</Text>
                </Card>
              ),
            }}
          />

          <Demo
            id="item-card"
            title="ItemCard"
            states={{
              default: (
                <Grid min="sm">
                  <ItemCard
                    title="Вампир"
                    subtitle="Обычный образ"
                    media={HERO}
                    pixelated
                    footer={<StatChip kind="coins" label="Цена" value={40} />}
                    onClick={() => {}}
                  />
                  <ItemCard
                    title="Вампир"
                    media={HERO}
                    pixelated
                    selected
                    badge={
                      <Badge tone="live" icon={<Sparkles />}>
                        Живой
                      </Badge>
                    }
                    footer={<Badge tone="success">Надет</Badge>}
                    onClick={() => {}}
                  />
                </Grid>
              ),
              disabled: (
                <Grid min="sm">
                  <ItemCard
                    title="Комната Дракулы"
                    media={{
                      src: '/assets/game/rooms/room-dracula-thumb.webp',
                      alt: 'Комната Дракулы',
                    }}
                    footer={
                      <Text size="xs" tone="muted">
                        Ещё 80 монет
                      </Text>
                    }
                    onClick={() => {}}
                    disabled
                  />
                </Grid>
              ),
              loading: (
                <Grid min="sm">
                  <ItemCard title="" loading />
                </Grid>
              ),
              empty: (
                <Grid min="sm">
                  <ItemCard
                    title="Свой товар"
                    media={<Placeholder kind="upload" label="Картинка товара" />}
                  />
                </Grid>
              ),
              error: (
                <Grid min="sm">
                  <ItemCard
                    title="Билет «Кино»"
                    media={<Placeholder kind="image" label="Картинка не загрузилась" />}
                    footer={<Badge tone="danger">Ошибка</Badge>}
                  />
                </Grid>
              ),
            }}
          />

          <OverlayDemo kind="modal" />
          <OverlayDemo kind="sheet" />
          <OverlayDemo kind="drawer" />

          <Demo
            id="tabs"
            title="Tabs"
            states={{
              default: (
                <Tabs
                  label="Мои награды"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { id: 'from', label: 'От родителя', icon: <Gift /> },
                    { id: 'tickets', label: 'Билетики', count: 2 },
                  ]}
                >
                  <Text tone="muted">
                    {tab === 'from' ? 'Похвалы и подарки' : 'Купленные билеты'}
                  </Text>
                </Tabs>
              ),
              disabled: (
                <Tabs
                  label="Разделы"
                  value="a"
                  onChange={() => {}}
                  items={[
                    { id: 'a', label: 'Уроки' },
                    { id: 'b', label: 'Игры', disabled: true },
                  ]}
                />
              ),
              loading: (
                <Tabs
                  label="Фильтр"
                  variant="underline"
                  value="all"
                  onChange={() => {}}
                  items={[{ id: 'all', label: 'Весь альбом' }]}
                >
                  <Skeleton lines={2} />
                </Tabs>
              ),
              empty: (
                <Tabs
                  label="Фильтр"
                  variant="underline"
                  value="mine"
                  onChange={() => {}}
                  items={[{ id: 'mine', label: 'Мои', count: 0 }]}
                >
                  <EmptyState title="Пока ничего нет" plain />
                </Tabs>
              ),
              error: (
                <Tabs
                  label="Фильтр"
                  value="all"
                  onChange={() => {}}
                  items={[{ id: 'all', label: 'Все' }]}
                >
                  <Text tone="danger">Не получилось загрузить</Text>
                </Tabs>
              ),
            }}
          />

          <Demo
            id="segmented"
            title="SegmentedControl"
            states={{
              default: (
                <SegmentedControl
                  label="Что показать"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'lessons', label: 'Уроки' },
                    { value: 'games', label: 'Игры' },
                  ]}
                />
              ),
              disabled: (
                <SegmentedControl
                  label="Режим"
                  value="a"
                  onChange={() => {}}
                  disabled
                  options={[
                    { value: 'a', label: 'Обычные' },
                    { value: 'b', label: 'Живые' },
                  ]}
                />
              ),
              loading: { na: 'варианты известны заранее' },
              empty: { na: 'без вариантов не показывается' },
              error: { na: 'выбор не бывает ошибочным' },
            }}
          />

          <Demo
            id="progress"
            title="ProgressBar"
            states={{
              default: <ProgressBar label="Просмотрено" value={70} showLabel valueText="70%" />,
              disabled: (
                <ProgressBar label="Наклейки" value={2} max={5} valueText="2 / 5" tone="xp" />
              ),
              loading: <ProgressBar label="Загрузка" />,
              empty: <ProgressBar label="Просмотрено" value={0} showLabel valueText="0%" />,
              error: (
                <ProgressBar
                  label="Не досмотрено"
                  value={30}
                  showLabel
                  valueText="30% из 80%"
                  tone="accent"
                />
              ),
            }}
          />

          <Demo
            id="ring"
            title="ProgressRing"
            states={{
              default: (
                <ProgressRing label="Серия" value={3} max={5}>
                  3/5
                </ProgressRing>
              ),
              disabled: { na: 'кольцо только показывает' },
              loading: { na: 'показывается после загрузки данных' },
              empty: (
                <ProgressRing label="Серия" value={0} max={5}>
                  0/5
                </ProgressRing>
              ),
              error: { na: 'прогресс не бывает ошибочным' },
            }}
          />

          <Demo
            id="stat"
            title="StatChip"
            states={{
              default: (
                <Inline>
                  <StatChip kind="level" label="Уровень" value={4} />
                  <StatChip kind="xp" label="Опыт" value="1 131" />
                  <StatChip kind="coins" label="Монеты" value={30} />
                  <StatChip kind="wishes" label="Мои желания" value={1} onClick={() => {}} />
                </Inline>
              ),
              disabled: (
                <StatChip kind="wishes" label="Мои желания" value={0} onClick={() => {}} disabled />
              ),
              loading: <StatChip kind="coins" label="Монеты" value={0} loading />,
              empty: <StatChip kind="coins" label="Монеты" value={0} showLabel />,
              error: <StatChip kind="coins" label="Монеты" value="−40" showLabel />,
            }}
          />

          <Demo
            id="badge"
            title="Badge"
            states={{
              default: (
                <Inline>
                  <Badge>Черновик</Badge>
                  <Badge tone="info">Назначен</Badge>
                  <Badge tone="success">Засчитано</Badge>
                  <Badge tone="warning">Ждёт проверки</Badge>
                  <Badge tone="live" icon={<Sparkles />}>
                    Живой образ
                  </Badge>
                  <Badge tone="gold">+350 монет</Badge>
                </Inline>
              ),
              disabled: <Badge>Архив</Badge>,
              loading: { na: 'метка показывается вместе с данными' },
              empty: { na: 'пустая метка не показывается' },
              error: <Badge tone="danger">Не засчитано</Badge>,
            }}
          />

          <Demo
            id="avatar"
            title="Avatar"
            states={{
              default: (
                <Inline>
                  <Avatar name="Звёздный герой" src={STAR} size="lg" />
                  <Avatar name="Саша" />
                  <Avatar name="Мама" size="sm" />
                </Inline>
              ),
              disabled: { na: 'аватар не нажимается' },
              loading: { na: 'буква показывается до загрузки картинки' },
              empty: <Avatar name="" />,
              error: <Avatar name="Саша" src="/assets/missing.webp" size="lg" />,
            }}
          />

          <Demo
            id="steps"
            title="StepList"
            states={{
              default: (
                <StepList
                  label="Шаги урока"
                  steps={[
                    { id: 'video', label: 'Видео', icon: <Play />, status: 'done' },
                    { id: 'quiz', label: 'Тест', icon: <CircleQuestionMark />, status: 'current' },
                    { id: 'reward', label: 'Награда', icon: <Gift />, status: 'todo' },
                  ]}
                />
              ),
              disabled: (
                <StepList
                  label="Шаги урока"
                  steps={[
                    { id: 'video', label: 'Видео', icon: <Play />, status: 'todo' },
                    { id: 'quiz', label: 'Тест', icon: <CircleQuestionMark />, status: 'todo' },
                  ]}
                />
              ),
              loading: { na: 'шаги известны вместе с заданием' },
              empty: { na: 'у задания всегда есть шаги' },
              error: { na: 'ошибку шага показывает плеер задания' },
            }}
          />

          <Demo
            id="empty"
            title="EmptyState"
            states={{
              default: (
                <EmptyState
                  art={<BookOpen />}
                  title="Все уроки пройдены"
                  description="Новые появятся, когда родитель их откроет."
                  actions={<Button>Выбрать предмет</Button>}
                />
              ),
              disabled: { na: 'сообщение не нажимается' },
              loading: { na: 'во время загрузки показывается Skeleton' },
              empty: <EmptyState title="Здесь пока пусто" />,
              error: (
                <EmptyState
                  tone="error"
                  title="Не получилось загрузить"
                  description="Нет связи с сервером."
                  actions={<Button>Повторить</Button>}
                />
              ),
            }}
          />

          <ToastDemo />

          <Demo
            id="tooltip"
            title="Tooltip"
            states={{
              default: (
                <Tooltip content="Монеты дают за уроки и тесты">
                  <IconButton label="Что такое монеты" icon={<CircleQuestionMark />} />
                </Tooltip>
              ),
              disabled: { na: 'подсказка появляется у доступных элементов' },
              loading: { na: 'текст подсказки известен заранее' },
              empty: { na: 'пустая подсказка не показывается' },
              error: { na: 'ошибки показывает поле или тост' },
            }}
          />

          <Demo
            id="placeholder"
            title="Placeholder"
            description="Только через него выводится отсутствующий ассет; каждая заглушка — в docs/PLACEHOLDERS.md."
            states={{
              default: (
                <Inline align="start">
                  <Placeholder kind="upload" label="Картинка товара" size="md" />
                  <Placeholder kind="subject" label="Значок предмета" size="md" />
                  <Placeholder kind="upload" label="Картинка похвалы" size="sm" />
                </Inline>
              ),
              disabled: { na: 'заглушка не нажимается' },
              loading: { na: 'во время загрузки показывается Skeleton' },
              empty: <Placeholder kind="image" label="Нет картинки" size="md" />,
              error: <Placeholder kind="animation" label="Анимация не загрузилась" size="md" />,
            }}
          />

          <Demo
            id="field"
            title="Field + TextInput"
            states={{
              default: (
                <Stack>
                  <Field label="Логин" hint="Латиница, цифры, точка и дефис">
                    <TextInput autoComplete="username" />
                  </Field>
                  <Field label="Поиск" labelHidden>
                    <TextInput icon={<Search />} placeholder="Например: монеты, PIN" />
                  </Field>
                </Stack>
              ),
              disabled: (
                <Field label="Логин" disabled>
                  <TextInput value="mama" readOnly />
                </Field>
              ),
              loading: { na: 'поле доступно сразу' },
              empty: (
                <Field label="Имя ребёнка" required>
                  <TextInput placeholder="Например, Саша" />
                </Field>
              ),
              error: (
                <Field label="Пароль" error="Пароль не короче 8 символов">
                  <TextInput type="password" value="123" readOnly />
                </Field>
              ),
            }}
          />

          <Demo
            id="select"
            title="Select"
            states={{
              default: (
                <Field label="Предмет">
                  <Select
                    options={[
                      { value: 'math', label: 'Математика' },
                      { value: 'russian', label: 'Русский язык' },
                    ]}
                    defaultValue="math"
                  />
                </Field>
              ),
              disabled: (
                <Field label="Предмет" disabled>
                  <Select options={[{ value: 'math', label: 'Математика' }]} />
                </Field>
              ),
              loading: { na: 'варианты приходят вместе с формой' },
              empty: (
                <Field label="Предмет">
                  <Select placeholder="Выберите предмет" options={[]} />
                </Field>
              ),
              error: (
                <Field label="Предмет" error="Выберите предмет">
                  <Select
                    placeholder="Выберите предмет"
                    options={[{ value: 'math', label: 'Математика' }]}
                  />
                </Field>
              ),
            }}
          />

          <Demo
            id="switch"
            title="Switch"
            states={{
              default: (
                <Switch
                  checked={sound}
                  onChange={setSound}
                  label="Звуки интерфейса"
                  description="Пакетики, новые элементы, уровни."
                />
              ),
              disabled: <Switch checked onChange={() => {}} label="Движение" disabled />,
              loading: { na: 'переключатель применяется сразу' },
              empty: <Switch checked={false} onChange={() => {}} label="Озвучка вопросов" />,
              error: { na: 'ошибку сохранения показывает тост' },
            }}
          />

          <Demo
            id="checkbox"
            title="Checkbox"
            states={{
              default: (
                <Checkbox checked={assigned} onChange={setAssigned} label="Назначить Саше" />
              ),
              disabled: <Checkbox checked onChange={() => {}} label="Все ученики" disabled />,
              loading: { na: 'флажок применяется сразу' },
              empty: (
                <Checkbox
                  checked={false}
                  indeterminate
                  onChange={() => {}}
                  label="Выбраны не все"
                />
              ),
              error: { na: 'ошибку показывает поле формы' },
            }}
          />

          <Demo
            id="number"
            title="NumberInput"
            states={{
              default: (
                <Field label="Монеты за урок">
                  <NumberInput
                    value={coins}
                    onChange={setCoins}
                    min={0}
                    max={1000}
                    step={10}
                    suffix="монет"
                  />
                </Field>
              ),
              disabled: (
                <Field label="Опыт" disabled>
                  <NumberInput value={100} onChange={() => {}} />
                </Field>
              ),
              loading: { na: 'поле доступно сразу' },
              empty: (
                <Field label="Порог зачёта">
                  <NumberInput value={null} onChange={() => {}} min={1} max={3} />
                </Field>
              ),
              error: (
                <Field label="Опыт" error="От 1 до 1000">
                  <NumberInput value={0} onChange={() => {}} />
                </Field>
              ),
            }}
          />

          <Demo
            id="slider"
            title="Slider"
            states={{
              default: (
                <Field label="Громкость">
                  <Slider value={volume} onChange={setVolume} step={5} format={(v) => `${v}%`} />
                </Field>
              ),
              disabled: (
                <Field label="Громкость" disabled>
                  <Slider value={55} onChange={() => {}} format={(v) => `${v}%`} />
                </Field>
              ),
              loading: { na: 'значение известно сразу' },
              empty: (
                <Field label="Громкость">
                  <Slider value={0} onChange={() => {}} format={(v) => `${v}%`} />
                </Field>
              ),
              error: { na: 'любое значение в пределах допустимо' },
            }}
          />

          <Demo
            id="textarea"
            title="Textarea"
            states={{
              default: (
                <Field label="Комментарий">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.currentTarget.value)}
                    maxLength={300}
                    showCount
                  />
                </Field>
              ),
              disabled: (
                <Field label="Комментарий" disabled>
                  <Textarea value="Засчитано" readOnly />
                </Field>
              ),
              loading: { na: 'поле доступно сразу' },
              empty: (
                <Field label="Описание задания">
                  <Textarea placeholder="Что нужно сделать?" />
                </Field>
              ),
              error: (
                <Field label="Описание" error="Не длиннее 1500 символов">
                  <Textarea value="…" readOnly />
                </Field>
              ),
            }}
          />

          <Demo
            id="datetime"
            title="DateTimeInput"
            states={{
              default: (
                <Field label="Открыть с">
                  <DateTimeInput defaultValue="2026-11-14T09:00" />
                </Field>
              ),
              disabled: (
                <Field label="Открыть с" disabled>
                  <DateTimeInput defaultValue="2026-11-14T09:00" />
                </Field>
              ),
              loading: { na: 'поле доступно сразу' },
              empty: (
                <Field label="Открыть с" hint="Пусто — сразу после публикации">
                  <DateTimeInput />
                </Field>
              ),
              error: (
                <Field label="Открыть с" error="Дата в прошлом">
                  <DateTimeInput defaultValue="2020-01-01T09:00" />
                </Field>
              ),
            }}
          />

          <Demo
            id="file"
            title="FileInput"
            states={{
              default: (
                <Field label="Картинка товара" hint="WebP или PNG до 5 МБ">
                  <FileInput accept="image/webp,image/png" onChange={() => {}} />
                </Field>
              ),
              disabled: (
                <Field label="Картинка товара" disabled>
                  <FileInput onChange={() => {}} />
                </Field>
              ),
              loading: (
                <Stack gap="sm">
                  <ProgressBar label="Загрузка файла" value={40} valueText="40%" />
                </Stack>
              ),
              empty: (
                <Field label="Анимация">
                  <FileInput
                    accept="image/webp"
                    buttonLabel="Загрузить анимацию WebP"
                    onChange={() => {}}
                  />
                </Field>
              ),
              error: (
                <Field label="Картинка товара" error="Файл больше 5 МБ">
                  <FileInput onChange={() => {}} />
                </Field>
              ),
            }}
          />

          <Demo
            id="accordion"
            title="Accordion"
            states={{
              default: (
                <Accordion
                  defaultOpen={['streak']}
                  items={[
                    {
                      id: 'streak',
                      title: 'Серия занятий',
                      content: 'День засчитывается после урока и теста.',
                    },
                    { id: 'help', title: 'Помощь', content: 'Спроси родителя.' },
                  ]}
                />
              ),
              disabled: (
                <Accordion
                  items={[{ id: 'games', title: 'Игры (скоро)', content: '', disabled: true }]}
                />
              ),
              loading: (
                <Accordion
                  defaultOpen={['history']}
                  items={[{ id: 'history', title: 'История', content: <Skeleton lines={2} /> }]}
                />
              ),
              empty: (
                <Accordion
                  defaultOpen={['notes']}
                  items={[{ id: 'notes', title: 'Заметки', content: 'Пока пусто' }]}
                />
              ),
              error: (
                <Accordion
                  defaultOpen={['err']}
                  items={[
                    {
                      id: 'err',
                      title: 'Отчёт',
                      content: <Text tone="danger">Не получилось загрузить</Text>,
                    },
                  ]}
                />
              ),
            }}
          />

          <Demo
            id="table"
            title="DataTable"
            states={{
              default: (
                <DataTable
                  caption="Пользователи"
                  columns={columns}
                  rows={rows}
                  rowKey={(r) => r.id}
                />
              ),
              disabled: { na: 'таблица только показывает' },
              loading: (
                <DataTable
                  caption="Пользователи"
                  columns={columns}
                  rows={[]}
                  rowKey={(r) => r.id}
                  loading
                />
              ),
              empty: (
                <DataTable
                  caption="Устройства"
                  columns={columns}
                  rows={[]}
                  rowKey={(r) => r.id}
                  empty="Доверенных устройств нет"
                />
              ),
              error: (
                <DataTable
                  caption="История"
                  columns={columns}
                  rows={[]}
                  rowKey={(r) => r.id}
                  error="Сервер недоступен"
                />
              ),
            }}
          />

          <PinPadDemo />

          <Demo
            id="spinner"
            title="Spinner"
            states={{
              default: (
                <Inline>
                  <Spinner size="sm" />
                  <Spinner />
                  <Spinner size="lg" label="Загружаем уроки" />
                </Inline>
              ),
              disabled: { na: 'индикатор не нажимается' },
              loading: <Spinner label="Загрузка" />,
              empty: { na: 'индикатор показывается только при загрузке' },
              error: { na: 'вместо индикатора показывается ошибка' },
            }}
          />

          <Demo
            id="question"
            title="QuestionCard"
            states={{
              default: (
                <QuestionCard
                  index={2}
                  total={8}
                  text="Сколько будет 7 + 5?"
                  tools={
                    <IconButton
                      label="Послушать вопрос"
                      icon={<Play />}
                      size="sm"
                      variant="secondary"
                    />
                  }
                >
                  {['12', '13', '11', '14'].map((option, i) => (
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
              ),
              disabled: (
                <QuestionCard index={8} total={8} text="Тест уже сдан">
                  <OptionTile letter="А" disabled>
                    Да
                  </OptionTile>
                </QuestionCard>
              ),
              loading: <QuestionCard index={1} total={8} text="" loading />,
              empty: { na: 'у вопроса всегда есть варианты' },
              error: (
                <QuestionCard
                  index={3}
                  total={8}
                  text="Какой звук в начале слова «кот»?"
                  error="Не удалось сохранить ответ. Попробуй ещё раз."
                >
                  <OptionTile letter="А">К</OptionTile>
                  <OptionTile letter="Б">Т</OptionTile>
                </QuestionCard>
              ),
            }}
          />

          <Demo
            id="option"
            title="OptionTile"
            states={{
              default: (
                <Stack gap="sm">
                  <OptionTile letter="А">12</OptionTile>
                  <OptionTile letter="Б" state="selected">
                    13
                  </OptionTile>
                  <OptionTile letter="В" state="correct" disabled>
                    12
                  </OptionTile>
                </Stack>
              ),
              disabled: (
                <OptionTile letter="Г" disabled>
                  14
                </OptionTile>
              ),
              loading: { na: 'варианты приходят вместе с вопросом' },
              empty: { na: 'пустой вариант не показывается' },
              error: (
                <OptionTile letter="Б" state="wrong" disabled>
                  13
                </OptionTile>
              ),
            }}
          />

          <Demo
            id="skeleton"
            title="Skeleton"
            states={{
              default: <Skeleton lines={3} />,
              disabled: { na: 'только для загрузки' },
              loading: <Skeleton ratio="3 / 2" />,
              empty: { na: 'только для загрузки' },
              error: { na: 'только для загрузки' },
            }}
          />

          <Demo
            id="typography"
            title="Heading и Text"
            states={{
              default: (
                <Stack gap="sm">
                  <Heading level={2} size="display">
                    Мои награды
                  </Heading>
                  <Heading level={3}>Что нужно сделать?</Heading>
                  <Text>Выберите раздел. Настройки сохраняются на устройстве.</Text>
                  <Text tone="muted" size="sm">
                    Подпись второстепенным цветом
                  </Text>
                  <Text tone="gold" weight="bold">
                    +350 монет
                  </Text>
                </Stack>
              ),
              disabled: <Text tone="subtle">Недоступный текст</Text>,
              loading: { na: 'во время загрузки показывается Skeleton' },
              empty: { na: 'пустой текст не показывается' },
              error: <Text tone="danger">Сообщение об ошибке</Text>,
            }}
          />

          <Demo
            id="animated-hero"
            title="AnimatedHero"
            description="Постер до старта; одновременно движется один герой; вне экрана и на скрытой вкладке — стоп; reduced-motion отключает автозапуск."
            states={{
              default: (
                <Grid min="sm">
                  <LiveHero
                    poster="/assets/game/characters/vampire-boy.webp"
                    src="/assets/game/animated/vampire-cape.webp"
                    alt="Вампир · оживший плащ"
                  />
                </Grid>
              ),
              disabled: (
                <Grid min="sm">
                  <AnimatedHero
                    poster="/assets/game/characters/vampire-boy.webp"
                    src="/assets/game/animated/vampire-cape.webp"
                    alt="Вампир"
                    playing={false}
                    onToggle={() => {}}
                    disabled
                  />
                </Grid>
              ),
              loading: {
                na: 'пока анимация грузится, виден постер, а на кнопке — индикатор (см. «Живые герои»)',
              },
              empty: (
                <Grid min="sm">
                  <AnimatedHero
                    poster="/assets/game/characters/star-hero.webp"
                    alt="Звёздный герой без анимации"
                    playing={false}
                  />
                </Grid>
              ),
              error: (
                <Grid min="sm">
                  <AnimatedHero
                    poster="/assets/game/characters/zombie-boy.webp"
                    src="/assets/game/animated/missing-animation.webp"
                    alt="Зомби"
                    playing
                    onToggle={() => {}}
                  />
                </Grid>
              ),
            }}
          />

          <Card
            id="live-heroes"
            data-gallery="live-heroes"
            title="Живые герои и экшен-анимации"
            description={`Все живые герои и 9 экшен-анимаций из манифеста ассетов (${LIVE_HEROES.length}). Запуск — кнопкой «Оживить героя».`}
          >
            <Grid min="sm">
              {LIVE_HEROES.map((hero) => (
                <Stack key={hero.id} gap="xs" align="center" data-live-hero={hero.id}>
                  <LiveHero
                    poster={hero.poster}
                    src={hero.src}
                    motion={hero.motion}
                    sprite={hero.sprite}
                    alt={hero.name}
                  />
                  <Badge tone={hero.group === 'action' ? 'gold' : 'live'}>
                    {hero.group === 'action' ? 'Экшен' : 'Живой'}
                  </Badge>
                  <Text size="sm" weight="semibold">
                    {hero.name}
                  </Text>
                  <Text size="xs" tone="muted">
                    {describeHero(hero)}
                  </Text>
                </Stack>
              ))}
            </Grid>
          </Card>
        </Stack>
      </Container>
    </ToastProvider>
  );
}
