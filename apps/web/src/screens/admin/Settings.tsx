// /admin/settings — every setting of the installation in one form, built from the shared
// registry (labels, descriptions, ranges and choices come from there; no per-key code here).
import { settingFieldOf, settingText, settingValue } from '@questclass/shared/settings/form';
import { SETTING_KEYS, SETTINGS, type SettingDef } from '@questclass/shared/settings/registry';
import { Button, Card, EmptyState, Inline, Notice, Stack, useToast } from '@questclass/ui';
import { useMemo, useState, type FormEvent } from 'react';
import { errorText } from '../../features/admin/forms';
import { SettingFieldControl } from '../../features/settings/SettingField';
import { SettingsNav } from '../../features/settings/SettingsNav';
import {
  useSaveSettings,
  useSettings,
  type SettingEntryDto,
} from '../../features/settings/queries';
import { AdminPage } from '../../templates/AdminShell';

const definitions = SETTINGS as unknown as Readonly<Record<string, SettingDef>>;

function textsOf(entries: readonly SettingEntryDto[]): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const entry of entries) {
    const def = definitions[entry.key];
    if (def) texts[entry.key] = settingText(settingFieldOf(def.schema), entry.value);
  }
  return texts;
}

function SettingsForm({ entries }: { entries: readonly SettingEntryDto[] }) {
  const save = useSaveSettings();
  const toast = useToast();
  const saved = useMemo(() => textsOf(entries), [entries]);
  const [texts, setTexts] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // New values from the server (after a save or a refetch) replace the form.
  const [base, setBase] = useState(saved);
  if (base !== saved) {
    setBase(saved);
    setTexts(saved);
    setErrors({});
  }
  const keys = SETTING_KEYS.filter((key) => key in saved);
  const changed = keys.filter((key) => texts[key] !== saved[key]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const values: Record<string, unknown> = {};
    const found: Record<string, string> = {};
    for (const key of changed) {
      const def = definitions[key];
      if (!def) continue;
      const value = settingValue(settingFieldOf(def.schema), texts[key] ?? '');
      const check = def.schema.safeParse(value);
      if (check.success) {
        values[key] = check.data;
      } else {
        found[key] = check.error.issues[0]?.message ?? 'Некорректное значение';
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0 || changed.length === 0) return;
    save.mutate(values, {
      onSuccess: () => toast.show('Настройки сохранены', { tone: 'success' }),
    });
  };

  return (
    <form noValidate onSubmit={submit} aria-label="Настройки">
      <Stack gap="lg">
        <Card>
          <Stack gap="lg">
            {keys.map((key) => {
              const def = definitions[key];
              return def ? (
                <SettingFieldControl
                  key={key}
                  settingKey={key}
                  def={def}
                  text={texts[key] ?? ''}
                  error={errors[key]}
                  disabled={save.isPending}
                  onChange={(text) => setTexts((current) => ({ ...current, [key]: text }))}
                />
              ) : null;
            })}
          </Stack>
        </Card>
        {save.isError && <Notice tone="danger">{errorText(save.error)}</Notice>}
        <Inline>
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={changed.length === 0}
          >
            Сохранить
          </Button>
          {changed.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setTexts(saved);
                setErrors({});
              }}
            >
              Отменить изменения
            </Button>
          )}
        </Inline>
      </Stack>
    </form>
  );
}

export function Settings() {
  const settings = useSettings();
  return (
    <AdminPage
      title="Настройки"
      description="Общие для всей семьи: часовой пояс, сессии, тесты, видео, экономика."
    >
      <SettingsNav current="/admin/settings" />
      {settings.isPending ? (
        <Card loading />
      ) : settings.isError ? (
        <EmptyState
          tone="error"
          title="Не получилось загрузить настройки"
          description={errorText(settings.error)}
          actions={<Button onClick={() => void settings.refetch()}>Повторить</Button>}
        />
      ) : (
        <SettingsForm entries={settings.data} />
      )}
    </AdminPage>
  );
}
