// Gallery sections of admin-only components (the icon picker). Kept apart from UiGallery.tsx so
// the gallery file only grows by one line per group; rendered at the end of /dev/ui.
import {
  IconImage,
  IconPicker,
  ImageOff,
  Inline,
  Stack,
  type IconPickerOption,
} from '@questclass/ui';
import { useState } from 'react';
import type { GalleryDemo } from './learnerGallery';

const ICONS = ['math', 'russian', 'world', 'reading'].map(
  (key) => `/assets/game/subjects-pixel/${key}.webp`,
);

const NONE: IconPickerOption = { value: '', label: 'Без значка', icon: <ImageOff /> };

const OPTIONS: readonly IconPickerOption[] = [
  NONE,
  ...ICONS.map((src, i) => ({
    value: `asset:${i}`,
    label: `Встроенный значок ${i + 1}`,
    src,
    pixelated: true,
  })),
];

const HINT = 'Встроенные значки и загруженные картинки.';

function Picker(props: Partial<Parameters<typeof IconPicker>[0]>) {
  const [value, setValue] = useState(props.value ?? 'asset:0');
  return (
    <IconPicker
      legend="Значок"
      hint={HINT}
      options={OPTIONS}
      {...props}
      value={value}
      onChange={setValue}
    />
  );
}

export function AdminSections({ Demo }: { readonly Demo: GalleryDemo }) {
  return (
    <Demo
      id="icon-picker"
      title="IconPicker и IconImage"
      description="Выбор значка плитками (радиогруппа: стрелки меняют выбор) и картинка фиксированного размера: sm, md, lg из токенов."
      states={{
        default: (
          <Stack gap="md">
            <Picker />
            <Inline>
              <IconImage src={ICONS[0] ?? ''} size="sm" pixelated />
              <IconImage src={ICONS[1] ?? ''} size="md" pixelated />
              <IconImage src={ICONS[2] ?? ''} size="lg" pixelated />
            </Inline>
          </Stack>
        ),
        disabled: <Picker disabled />,
        loading: <Picker loading />,
        empty: <Picker options={[NONE]} value="" />,
        error: <Picker error="Картинка для значка не найдена" />,
      }}
    />
  );
}
