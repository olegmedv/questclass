import { z } from 'zod';
import { DEFAULT_TRUSTED_PROXIES } from '../../net';
import { defineSetting, type SecretDef } from '../define';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ipOrCidr = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()], {
  error: 'Ожидается IP-адрес или подсеть CIDR',
});

/** Settings every installation has: time zone, session lifetimes, proxy trust. */
export const coreSettings = {
  timezone: defineSetting({
    schema: z.string().refine(isTimeZone, 'Неизвестный часовой пояс'),
    default: 'Europe/Kaliningrad',
    label: 'Часовой пояс',
    description: 'По нему считаются дни для серий, лимитов и ежедневных дел.',
  }),
  'session.adminIdleMinutes': defineSetting({
    schema: z
      .number()
      .int()
      .min(5)
      .max(24 * 60),
    default: 30,
    label: 'Сессия админа: выход при бездействии, минут',
  }),
  'session.adminMaxHours': defineSetting({
    schema: z
      .number()
      .int()
      .min(1)
      .max(24 * 7),
    default: 12,
    label: 'Сессия админа: максимальная длительность, часов',
  }),
  'session.learnerDays': defineSetting({
    schema: z.number().int().min(1).max(730),
    default: 180,
    label: 'Сессия ученика на доверенном устройстве, дней',
  }),
  'http.trustedProxies': defineSetting<string[]>({
    schema: z.array(ipOrCidr).max(32),
    default: [...DEFAULT_TRUSTED_PROXIES],
    label: 'Доверенные прокси (X-Forwarded-For)',
    description: 'Адреса или подсети обратного прокси. От остальных X-Forwarded-For не читается.',
  }),
};

/** Core secrets: none yet (API keys of AI providers, Telegram, mail arrive with their modules). */
export const coreSecrets: Readonly<Record<string, SecretDef>> = {};
