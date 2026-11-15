// Tabs between the pages of the «Настройки» section; each tab is its own address.
import { Tabs } from '@questclass/ui';
import { useNavigate } from 'react-router';

const PAGES = [
  { id: '/admin/settings', label: 'Настройки' },
  { id: '/admin/settings/secrets', label: 'Ключи API' },
  { id: '/admin/settings/import-tokens', label: 'Импорт уроков' },
] as const;

export type SettingsPage = (typeof PAGES)[number]['id'];

export function SettingsNav({ current }: { current: SettingsPage }) {
  const navigate = useNavigate();
  return (
    <Tabs
      label="Разделы настроек"
      variant="underline"
      items={PAGES}
      value={current}
      onChange={(id) => void navigate(id)}
    />
  );
}
