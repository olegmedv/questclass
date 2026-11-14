// /dev/ui — every design-system component in the states default, disabled, loading, empty and
// error (CLAUDE.md rule 8). Built only from @questclass/ui; no CSS of its own.
import {
  Accordion,
  ActionList,
  MediaPlayer,
  type ShutterState,
  AnswerReview,
  ResultSummary,
  RewardLine,
  AnimatedHero,
  ChoiceTile,
  LessonCard,
  StreakCard,
  AuthFrame,
  Notice,
  Avatar,
  BottomNav,
  Brand,
  ButtonLink,
  House,
  KeyRound,
  Menu,
  Shirt,
  ShoppingBag,
  SideNav,
  Users,
  Badge,
  BookOpen,
  Button,
  buttonClassName,
  Card,
  Celebration,
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
  MenuIcon,
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
import { INTERFACE_SOUNDS, soundUrl, type InterfaceSound } from '../../features/sound/SoundManager';
import { useSound } from '../../features/sound/useSound';
import { HeroSections, LiveRoomSections, ShopSections } from './learnerGallery';
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

const TEMPLATE_LINKS: readonly (readonly [string, string])[] = [
  ['learner', 'LearnerShell'],
  ['task', 'TaskPlayer'],
  ['catalog', 'Catalog'],
  ['progress', 'ProgressView'],
  ['admin', 'AdminShell'],
];

const STREAK_MOVIE = {
  src: '/assets/celebrations/streak-five-v1.webp',
  poster: '/assets/celebrations/streak-five-poster.webp',
  durationMs: 10_083,
};

const MATH_ICON = '/assets/game/subjects-pixel/math.webp';
const BLUE_HERO = '/assets/game/animated/repaired/blue-idle-cover.webp';

/** Components of the learner's home: lesson card, streak card, choice tiles, lesson list. */
function HomeSections() {
  const [expanded, setExpanded] = useState(true);
  const [subject, setSubject] = useState('all');
  const lessonSteps = (status: 'current' | 'done') => [
    { id: 'video', label: 'Видео', icon: <Play />, status },
    {
      id: 'quiz',
      label: 'Вопросы',
      icon: <CircleQuestionMark />,
      status: status === 'done' ? status : ('todo' as const),
    },
    {
      id: 'reward',
      label: 'Награда',
      icon: <Gift />,
      status: status === 'done' ? status : ('todo' as const),
    },
  ];
  return (
    <>
      <Demo
        id="lesson-card"
        title="LessonCard"
        description="Следующий урок на главной: предмет, название, герой, кнопка «Начать», шаги значками."
        states={{
          default: (
            <LessonCard
              subject={{ name: 'Математика', icon: <img src={MATH_ICON} alt="" /> }}
              title="Сложение и вычитание в пределах 100"
              meta="Урок от 12.11.2026 · Задание от родителя"
              hero={<AnimatedHero poster={BLUE_HERO} alt="Твой герой" playing={false} />}
              action={
                <Button variant="start" size="lg" block icon={<Flag />}>
                  Начать урок
                </Button>
              }
              steps={lessonSteps('current')}
            />
          ),
          disabled: (
            <LessonCard
              subject={{
                name: 'Чтение',
                icon: <Placeholder kind="subject" label="Значок предмета" size="sm" />,
              }}
              title="Устное народное творчество"
              hero={<AnimatedHero poster={BLUE_HERO} alt="Твой герой" playing={false} />}
              action={
                <Button variant="start" size="lg" block icon={<Flag />}>
                  Посмотреть результат
                </Button>
              }
              steps={lessonSteps('done')}
            />
          ),
          loading: <LessonCard loading title="" />,
          empty: { na: 'без урока главная показывает EmptyState «Все уроки пройдены!»' },
          error: { na: 'ошибку загрузки главная показывает через EmptyState' },
        }}
      />
      <Demo
        id="streak-card"
        title="StreakCard"
        description="«Серия занятий N/5»: компактная строка раскрывается в дни, бонус и правило."
        states={{
          default: (
            <StreakCard
              progress={3}
              cycleDays={5}
              reward={{ coins: 200, xp: 200 }}
              expanded={expanded}
              onToggle={() => setExpanded(!expanded)}
            >
              <Text tone="muted" size="sm">
                День засчитывается, когда ты завершаешь тест урока. Ошибки не мешают серии.
              </Text>
              <Inline>
                <Button size="sm" variant="ghost" icon={<Play />}>
                  Предпросмотр награды за серию
                </Button>
              </Inline>
            </StreakCard>
          ),
          disabled: { na: 'карточку можно раскрыть всегда' },
          loading: (
            <StreakCard
              progress={0}
              cycleDays={5}
              reward={{ coins: 0, xp: 0 }}
              expanded={false}
              onToggle={() => {}}
              loading
            />
          ),
          empty: (
            <StreakCard
              progress={0}
              cycleDays={5}
              reward={{ coins: 200, xp: 200 }}
              expanded={false}
              onToggle={() => {}}
            />
          ),
          error: { na: 'без данных серии главная её не показывает' },
        }}
      />
      <Demo
        id="choice-tile"
        title="ChoiceTile"
        description="Плитка выбора: предметы в окне «Выбери урок»."
        states={{
          default: (
            <Grid min="sm" gap="sm">
              <ChoiceTile
                icon={<BookOpen />}
                label="Все предметы"
                selected={subject === 'all'}
                onClick={() => setSubject('all')}
              />
              <ChoiceTile
                icon={<img src={MATH_ICON} alt="" />}
                label="Математика"
                selected={subject === 'math'}
                onClick={() => setSubject('math')}
              />
            </Grid>
          ),
          disabled: (
            <Grid min="sm" gap="sm">
              <ChoiceTile icon={<BookOpen />} label="Нет уроков" disabled />
            </Grid>
          ),
          loading: { na: 'предметы приходят вместе с уроками' },
          empty: (
            <Grid min="sm" gap="sm">
              <ChoiceTile
                icon={<Placeholder kind="subject" label="Значок предмета" size="sm" />}
                label="Новый предмет"
              />
            </Grid>
          ),
          error: { na: 'плитка не загружает данные' },
        }}
      />
      <Demo
        id="action-list"
        title="ActionList"
        description="Список уроков со статусом: открыть, выполнено, недоступно."
        states={{
          default: (
            <ActionList
              label="Уроки"
              items={[
                {
                  id: '1',
                  title: 'Что нас окружает. Повторение',
                  description: 'Окружающий мир · Можно открыть',
                  href: '/dev/ui',
                },
                {
                  id: '2',
                  title: 'Устное народное творчество',
                  description: 'Чтение · Выполнено',
                  status: 'done',
                  href: '/dev/ui',
                },
              ]}
            />
          ),
          disabled: (
            <ActionList
              label="Уроки"
              items={[
                {
                  id: '3',
                  title: 'Входная проверочная работа',
                  description: 'Русский язык · После предыдущего урока',
                  status: 'locked',
                },
              ]}
            />
          ),
          loading: { na: 'список показывается, когда уроки загружены' },
          empty: <ActionList label="Уроки" items={[]} empty="Здесь пока нет открытых уроков." />,
          error: { na: 'ошибку загрузки показывает экран' },
        }}
      />
    </>
  );
}

/** The result of a task: summary with the reward, and the review of the answers. */
function ResultSections() {
  const review = [
    {
      id: '1',
      question: 'Сколько будет 2 + 3?',
      answer: { text: '5' },
      correct: { text: '5' },
      isCorrect: true,
    },
    {
      id: '2',
      question: 'Какое число больше: 47 или 74?',
      answer: { text: '47' },
      correct: { text: '74' },
      isCorrect: false,
      action: (
        <Button size="sm" icon={<Play />}>
          Посмотреть объяснение
        </Button>
      ),
    },
  ];
  return (
    <>
      <Demo
        id="result"
        title="ResultSummary и RewardLine"
        description="Итог задания: заголовок по результату, верные ответы, награда и что дальше."
        states={{
          default: (
            <Stack gap="md">
              <RewardLine label="Награда за пройденный тест" xp={100} coins={350} />
              <ResultSummary
                tone="success"
                title="Миссия выполнена!"
                reward={<RewardLine label="Награда" xp={100} coins={350} />}
                actions={<Button>К урокам</Button>}
              >
                <p>Верных ответов: 3 из 3.</p>
              </ResultSummary>
            </Stack>
          ),
          disabled: (
            <ResultSummary
              tone="partial"
              title="Тест пройден!"
              reward={<RewardLine label="Награда за этот тест уже получена." />}
            >
              <p>Верных ответов: 2 из 3.</p>
            </ResultSummary>
          ),
          loading: { na: 'итог показывается, когда попытка проверена' },
          empty: <RewardLine label="Награда — за пройденный тест." />,
          error: (
            <ResultSummary
              tone="retry"
              title="Попробуем ещё раз"
              actions={
                <>
                  <Button variant="primary">Попросить пересдачу</Button>
                  <Button>К урокам</Button>
                </>
              }
            >
              <p>Верных ответов: 0 из 3.</p>
              <p>Новую попытку откроет родитель.</p>
            </ResultSummary>
          ),
        }}
      />
      <Demo
        id="review"
        title="AnswerReview"
        description="«Давай разберём»: ответ ученика и верный ответ по каждому вопросу."
        states={{
          default: <AnswerReview items={review} />,
          disabled: { na: 'разбор только показывает ответы' },
          loading: { na: 'разбор приходит вместе с результатом' },
          empty: <AnswerReview title="Твои ответы" items={review.slice(0, 1)} />,
          error: <AnswerReview items={review.slice(1)} />,
        }}
      />
    </>
  );
}

/** The lesson player. The gallery has no lesson video, so the demos show the controls around an
 *  unavailable file (the lesson screens play real HLS and MP4, see e2e/video.spec.ts). */
function MediaSection() {
  const [shutter, setShutter] = useState<ShutterState>({ heightPct: 12, visible: true });
  const missing = { kind: 'mp4' as const, src: '/assets/gallery/no-video.mp4' };
  return (
    <Demo
      id="media-player"
      title="MediaPlayer"
      description="Видео урока: ±10 сек, «Смотреть», перемотка, звук, чёрная полоса над субтитрами (тянуть или стрелками), на весь экран."
      states={{
        default: (
          <MediaPlayer
            source={missing}
            label="Видео урока (демо)"
            shutter={shutter}
            onShutterChange={setShutter}
          />
        ),
        disabled: <MediaPlayer source={missing} label="Видео без полосы" />,
        loading: { na: 'пока видео подключается, на кадре «Подключаем видео…»' },
        empty: { na: 'без видео урок не публикуется' },
        error: { na: 'файла нет — на кадре «Видео не загрузилось» и «Загрузить видео заново»' },
      }}
    />
  );
}

type CelebrationDemo =
  'pass' | 'pass-empty' | 'purchase' | 'streak' | 'streak-reduced' | 'streak-broken';

function CelebrationSection() {
  const sound = useSound();
  const [open, setOpen] = useState<CelebrationDemo | null>(null);
  const close = () => setOpen(null);
  const onReward = () => sound.play('complete');
  const opener = (demo: CelebrationDemo, label: string) => (
    <Button size="sm" onClick={() => setOpen(demo)}>
      {label}
    </Button>
  );
  const audio = `/assets/celebrations/streak-five-v1.${sound.format}`;
  return (
    <>
      <Demo
        id="celebration"
        title="Celebration"
        description="Зачёт, покупка, серия (ролик, полёт монет и XP). Здесь всё — предпросмотр: данные не меняются."
        states={{
          default: (
            <Inline>
              {opener('pass', 'Зачёт')}
              {opener('purchase', 'Покупка')}
              {opener('streak', 'Серия')}
            </Inline>
          ),
          disabled: { na: 'праздник не нажимается, его показывает приложение' },
          loading: {
            na: 'пока ролик серии грузится, видна его первая картинка; без анимации (reduced-motion) — статичная версия',
          },
          empty: (
            <Inline>
              {opener('pass-empty', 'Зачёт без награды')}
              {opener('streak-reduced', 'Серия без движения')}
            </Inline>
          ),
          error: opener('streak-broken', 'Серия: ролик не загрузился'),
        }}
      />
      <Celebration
        variant="pass"
        open={open === 'pass' || open === 'pass-empty'}
        onClose={close}
        preview
        title="Тест пройден!"
        message={open === 'pass-empty' ? 'Награда за этот тест уже получена.' : '7 из 8 верно'}
        reward={open === 'pass-empty' ? {} : { xp: 100, coins: 350 }}
        onReward={onReward}
      />
      <Celebration
        variant="purchase"
        open={open === 'purchase'}
        onClose={close}
        preview
        item={{ name: 'Вампир', image: '/assets/game/characters/vampire-boy.webp' }}
        spent={40}
        balance={310}
        onReward={onReward}
      />
      <Celebration
        variant="streak"
        open={open === 'streak' || open === 'streak-reduced' || open === 'streak-broken'}
        onClose={close}
        preview
        reducedMotion={open === 'streak-reduced' ? true : undefined}
        reward={{ coins: 200, xp: 200 }}
        totals={{ coins: 550, xp: 1331 }}
        movie={
          open === 'streak-broken'
            ? { ...STREAK_MOVIE, src: '/assets/celebrations/missing-movie.webp' }
            : { ...STREAK_MOVIE, audio }
        }
        volume={sound.preferences.volume}
        onReward={onReward}
      />
    </>
  );
}

const SOUND_LABELS: Record<InterfaceSound, string> = {
  packet: 'Пакетик',
  element: 'Новый элемент',
  level: 'Новый уровень',
  complete: 'Набор собран',
};

function SoundsSection() {
  const sound = useSound();
  const names = Object.keys(INTERFACE_SOUNDS) as InterfaceSound[];
  return (
    <Demo
      id="sounds"
      title="Звуки интерфейса"
      description={`Один звук за раз, важный не прерывается менее важным; загрузка дольше 900 мс — без звука. Формат на этом устройстве: ${sound.format.toUpperCase()}.`}
      states={{
        default: (
          <Stack>
            <Switch
              checked={sound.preferences.enabled}
              onChange={(enabled) => sound.update({ enabled })}
              label="Звуки интерфейса"
              description="Пакетики, новые элементы, уровни и собранные наборы."
            />
            <Field label="Громкость">
              <Slider
                value={Math.round(sound.preferences.volume * 100)}
                onChange={(value) => sound.update({ volume: value / 100 })}
                step={5}
                format={(value) => `${value}%`}
                disabled={!sound.preferences.enabled}
              />
            </Field>
            <Inline>
              {names.map((name) => (
                <Button
                  key={name}
                  size="sm"
                  icon={<Play />}
                  disabled={!sound.preferences.enabled}
                  onClick={() => {
                    sound.prime();
                    sound.play(name);
                  }}
                >
                  {SOUND_LABELS[name]} · {INTERFACE_SOUNDS[name].priority}
                </Button>
              ))}
            </Inline>
            <Text size="xs" tone="subtle">
              {names.map((name) => soundUrl(INTERFACE_SOUNDS[name].file, sound.format)).join(', ')}
            </Text>
          </Stack>
        ),
        disabled: (
          <Switch
            checked={false}
            onChange={() => {}}
            label="Звуки интерфейса"
            description="Выключены на этом устройстве"
          />
        ),
        loading: { na: 'звуки загружаются при первом касании; поздний звук пропускается' },
        empty: { na: 'список звуков фиксирован' },
        error: { na: 'если звук не загрузился, он просто не играет' },
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
    ['celebration', 'Celebration'],
    ['sounds', 'Звуки интерфейса'],
    ['menu', 'Menu'],
    ['navigation', 'Навигация'],
    ['frames', 'Шаблоны экранов'],
    ['notice', 'Notice'],
    ['auth-frame', 'AuthFrame'],
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
                  <IconButton label="Меню" icon={<MenuIcon />} />
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

          <HomeSections />

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

          <CelebrationSection />
          <SoundsSection />

          <Demo
            id="menu"
            title="Menu"
            description="Меню профиля: стрелки, Escape, клик мимо закрывает."
            states={{
              default: (
                <Menu
                  label="Профиль"
                  align="start"
                  trigger={<Users />}
                  heading="Саша"
                  items={[
                    { id: 'switch', label: 'Сменить ученика', icon: <Users />, onSelect: () => {} },
                    { id: 'parents', label: 'Родителям', icon: <KeyRound />, onSelect: () => {} },
                  ]}
                />
              ),
              disabled: <Menu label="Профиль" trigger={<Users />} items={[]} disabled />,
              loading: { na: 'пункты меню известны заранее' },
              empty: { na: 'меню без пунктов не показывается' },
              error: { na: 'ошибку действия показывает экран' },
            }}
          />

          <Demo
            id="navigation"
            title="Навигация"
            description="Brand, ButtonLink, нижнее меню ученика и разделы кабинета."
            states={{
              default: (
                <Stack>
                  <Inline justify="between">
                    <Brand logo="/assets/icons/star-v1-192.png" href="/dev/ui" />
                    <ButtonLink href="/dev/ui" size="sm" icon={<Trophy />}>
                      Награды
                    </ButtonLink>
                  </Inline>
                  <BottomNav
                    label="Разделы (пример)"
                    placement="static"
                    items={[
                      {
                        id: 'study',
                        label: 'Учёба',
                        href: '/dev/ui',
                        icon: <BookOpen />,
                        active: true,
                      },
                      { id: 'hero', label: 'Герой', href: '/dev/ui', icon: <Shirt /> },
                      { id: 'shop', label: 'Магазин', href: '/dev/ui', icon: <ShoppingBag /> },
                    ]}
                  />
                  <SideNav
                    label="Разделы кабинета (пример)"
                    items={[
                      {
                        id: 'home',
                        label: 'Главная',
                        href: '/dev/ui',
                        icon: <House />,
                        active: true,
                      },
                      { id: 'users', label: 'Пользователи', href: '/dev/ui', icon: <Users /> },
                    ]}
                  />
                </Stack>
              ),
              disabled: { na: 'недоступные разделы не показываются' },
              loading: { na: 'разделы известны заранее' },
              empty: (
                <BottomNav
                  label="Разделы без выбранного (пример)"
                  placement="static"
                  items={[
                    { id: 'study', label: 'Учёба', href: '/dev/ui', icon: <BookOpen /> },
                    { id: 'hero', label: 'Герой', href: '/dev/ui', icon: <Shirt /> },
                    { id: 'shop', label: 'Магазин', href: '/dev/ui', icon: <ShoppingBag /> },
                  ]}
                />
              ),
              error: { na: 'навигация не бывает ошибочной' },
            }}
          />

          <Demo
            id="frames"
            title="Шаблоны экранов"
            description="AppFrame, TopBar и PlayerFrame работают внутри шаблонов: LearnerShell, TaskPlayer, Catalog, ProgressView, AdminShell."
            states={{
              default: (
                <Inline>
                  {TEMPLATE_LINKS.map(([id, name]) => (
                    <ButtonLink key={id} href={`/dev/templates/${id}`} size="sm">
                      {name}
                    </ButtonLink>
                  ))}
                </Inline>
              ),
              disabled: { na: 'см. состояния компонентов внутри шаблонов' },
              loading: { na: 'см. Catalog и ProgressView с loading' },
              empty: { na: 'см. EmptyState внутри шаблонов' },
              error: { na: 'см. EmptyState tone="error" внутри шаблонов' },
            }}
          />

          <Demo
            id="notice"
            title="Notice"
            description="Сообщение в форме или на странице; предупреждения и ошибки читаются сразу."
            states={{
              default: <Notice>Настройки сохраняются на этом устройстве.</Notice>,
              disabled: { na: 'сообщение не нажимается' },
              loading: <Notice>Сохраняем…</Notice>,
              empty: { na: 'пустое сообщение не показывается' },
              error: (
                <Stack gap="sm">
                  <Notice tone="warning">Слишком много попыток. Попробуйте через 15 с.</Notice>
                  <Notice tone="danger">Неверный логин или пароль</Notice>
                  <Notice tone="success">Это устройство — детское.</Notice>
                </Stack>
              ),
            }}
          />

          <Demo
            id="auth-frame"
            title="AuthFrame"
            description="Экраны до входа: первый запуск, вход родителя, выбор ученика, PIN."
            states={{
              default: (
                <AuthFrame
                  embedded
                  title="Вход для родителя"
                  description="Кабинет: задания, награды, магазин и настройки."
                >
                  <Field label="Логин">
                    <TextInput />
                  </Field>
                </AuthFrame>
              ),
              disabled: { na: 'см. поля и кнопки внутри' },
              loading: (
                <AuthFrame embedded title="Вход">
                  <Inline justify="center">
                    <Spinner size="lg" label="Загружаем учеников" />
                  </Inline>
                </AuthFrame>
              ),
              empty: (
                <AuthFrame embedded title="Вход">
                  <EmptyState
                    title="Учеников пока нет"
                    description="Родитель добавляет учеников в кабинете."
                  />
                </AuthFrame>
              ),
              error: (
                <AuthFrame embedded title="Вход">
                  <Notice tone="danger">Не получилось загрузить</Notice>
                </AuthFrame>
              ),
            }}
          />

          {/* New sections go last: inserting above shifts every section below on the page. */}
          <ResultSections />
          <MediaSection />
          <ShopSections Demo={Demo} />
          <HeroSections Demo={Demo} />
          <LiveRoomSections Demo={Demo} />
        </Stack>
      </Container>
    </ToastProvider>
  );
}
