// The search of the admin home: sections, actions, settings and API keys, each with the trail
// of where it lives («Настройки › Видео: …»). Settings and keys come from the shared registry.
import {
  SECRETS,
  SETTING_KEYS,
  SETTINGS,
  type SettingDef,
} from '@questclass/shared/settings/registry';

export interface SearchEntry {
  readonly id: string;
  readonly title: string;
  /** Where it lives, from the cabinet down: the breadcrumbs of the result. */
  readonly trail: readonly string[];
  readonly href: string;
  /** Extra words people may type («субтитры», «ещё попытка»). */
  readonly keywords?: string;
}

/** Sections and the actions inside them. */
const ACTIONS: readonly SearchEntry[] = [
  {
    id: 'wishes',
    title: 'Выдать желание или Robux',
    trail: ['Выдача желаний'],
    href: '/admin/wishes',
    keywords: 'билет просьба robux роблокс',
  },
  {
    id: 'chores',
    title: 'Проверить дела',
    trail: ['Проверки'],
    href: '/admin/reviews',
    keywords: 'я сделал засчитать',
  },
  {
    id: 'retries',
    title: 'Разрешить ещё попытку',
    trail: ['Проверки', 'Пересдачи'],
    href: '/admin/reviews?queue=retries',
    keywords: 'пересдача ещё попытка тест провален',
  },
  {
    id: 'tasks',
    title: 'Открыть задания',
    trail: ['Задания'],
    href: '/admin/tasks',
    keywords: 'уроки тесты дела опубликовать назначить вопросы',
  },
  {
    id: 'revisions',
    title: 'Ревизии импорта',
    trail: ['Задания', 'Ревизии'],
    href: '/admin/tasks/revisions',
    keywords: 'импорт принять отклонить',
  },
  {
    id: 'shutter',
    title: 'Полоса над субтитрами',
    trail: ['Задания', 'Видеоурок'],
    href: '/admin/tasks',
    keywords: 'субтитры полоса видео',
  },
  {
    id: 'appearance',
    title: 'Заменить картинку, логотип или звук',
    trail: ['Оформление'],
    href: '/admin/appearance',
    keywords: 'оформление логотип иконка значок картинка анимация звук фон комната герой заменить',
  },
  {
    id: 'subjects',
    title: 'Предметы',
    trail: ['Предметы'],
    href: '/admin/subjects',
    keywords: 'предмет значок',
  },
  {
    id: 'progress',
    title: 'Прогресс ученика',
    trail: ['Прогресс'],
    href: '/admin/progress',
    keywords: 'закрыть переоткрыть пройти с мамой сбросить подтвердить просмотр попытки',
  },
  {
    id: 'reset',
    title: 'Сбросить прогресс или обнулить монеты',
    trail: ['Прогресс'],
    href: '/admin/progress',
    keywords: 'сброс монеты обнулить',
  },
  {
    id: 'awards',
    title: 'Начислить награду',
    trail: ['Награды'],
    href: '/admin/awards',
    keywords: 'монеты xp опыт от родителя отменить',
  },
  {
    id: 'reasons',
    title: 'Причины наград',
    trail: ['Награды', 'Причины'],
    href: '/admin/awards/reasons',
    keywords: 'причина',
  },
  {
    id: 'shop',
    title: 'Магазин',
    trail: ['Магазин'],
    href: '/admin/shop',
    keywords: 'товар цена образ комната билет картинка загрузить',
  },
  {
    id: 'history',
    title: 'История',
    trail: ['История'],
    href: '/admin/history',
    keywords: 'события начисления журнал',
  },
  {
    id: 'users',
    title: 'Добавить ученика или взрослого',
    trail: ['Пользователи'],
    href: '/admin/users',
    keywords: 'ученик пин pin отключить',
  },
  {
    id: 'device',
    title: 'Сделать устройство детским',
    trail: ['Устройства'],
    href: '/admin/device',
    keywords: 'планшет устройство',
  },
  {
    id: 'tokens',
    title: 'Токены импорта',
    trail: ['Настройки', 'Импорт уроков'],
    href: '/admin/settings/import-tokens',
    keywords: 'lesson-prep токен',
  },
  {
    id: 'password',
    title: 'Сменить свой пароль',
    trail: ['Профиль'],
    href: '/admin/profile',
    keywords: 'пароль',
  },
];

function settingEntries(): SearchEntry[] {
  const defs = SETTINGS as unknown as Readonly<Record<string, SettingDef>>;
  return SETTING_KEYS.map((key) => {
    const def = defs[key];
    return {
      id: `setting:${key}`,
      title: def?.label ?? key,
      trail: ['Настройки'],
      href: '/admin/settings',
      keywords: `${key} ${def?.description ?? ''}`,
    };
  });
}

function secretEntries(): SearchEntry[] {
  return Object.entries(SECRETS).map(([key, def]) => ({
    id: `secret:${key}`,
    title: def.label,
    trail: ['Настройки', 'Ключи API'],
    href: '/admin/settings/secrets',
    keywords: `${key} ${def.description ?? ''} ключ`,
  }));
}

export const SEARCH_INDEX: readonly SearchEntry[] = [
  ...ACTIONS,
  ...settingEntries(),
  ...secretEntries(),
];

const normal = (text: string) => text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

/** Entries containing every word of the query, titles first. */
export function searchAdmin(query: string, index = SEARCH_INDEX, limit = 8): SearchEntry[] {
  const words = normal(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored = index
    .map((entry) => {
      const title = normal(entry.title);
      const all = normal(`${entry.title} ${entry.trail.join(' ')} ${entry.keywords ?? ''}`);
      if (!words.every((word) => all.includes(word))) return null;
      return { entry, score: words.every((word) => title.includes(word)) ? 0 : 1 };
    })
    .filter((item): item is { entry: SearchEntry; score: number } => item !== null)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((item) => item.entry);
}
