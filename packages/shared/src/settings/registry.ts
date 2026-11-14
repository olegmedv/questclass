import { combineKeys, type SecretDef, type SettingDef } from './define';
import { coreSecrets, coreSettings } from './keys/core';
import { economySettings } from './keys/economy';
import { progressSettings } from './keys/progress';

export { defineSetting, type SecretDef, type SettingDef } from './define';

/** All settings. Each module adds its `keys/<module>.ts` file here. */
export const SETTINGS = combineKeys(
  coreSettings,
  economySettings,
  progressSettings,
  // add module settings here
);

/** All secrets (write-only, encrypted with the master key). */
export const SECRETS: Readonly<Record<string, SecretDef>> = combineKeys(
  coreSecrets,
  // add module secrets here
);

export type SettingsRegistry = typeof SETTINGS;
export type SettingKey = Extract<keyof SettingsRegistry, string>;
export type SettingValue<K extends SettingKey> =
  SettingsRegistry[K] extends SettingDef<infer T> ? T : never;

export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS)) as readonly SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}
