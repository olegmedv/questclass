// Choosing an admin upload for a shop item: one of the pictures uploaded before, or a new file.
// The server checks the format (PNG, JPEG, WebP), the size and the frames of an animation.
import { Button, Field, FileInput, Grid, ItemCard, Notice, Select, Stack } from '@questclass/ui';
import { errorText, formatDateTime } from '../admin/forms';
import { useUploadPicture, useUploads, type UploadDto } from './queries';
import { StillArt } from './ItemArt';

const LIMITS = {
  still: 'PNG, JPEG или WebP до 2 МБ, не больше 1024 × 1024 (лучше 512 × 512).',
  animated:
    'Анимированный WebP до 5 МБ: до 10 секунд, до 120 кадров, не быстрее 25 кадров в секунду.',
};

function uploadLabel(upload: UploadDto): string {
  return `№ ${upload.id} · ${Math.round(upload.sizeBytes / 1024)} КБ · ${formatDateTime(upload.createdAt)}`;
}

export interface UploadFieldProps {
  readonly label: string;
  readonly animated: boolean;
  readonly value: number | null;
  readonly onChange: (id: number | null) => void;
}

export function UploadField({ label, animated, value, onChange }: UploadFieldProps) {
  const uploads = useUploads();
  const upload = useUploadPicture();
  const fitting = (uploads.data ?? []).filter(
    (item) => item.kind === 'image' && item.animated === animated,
  );
  const current = uploads.data?.find((item) => item.id === value) ?? null;
  return (
    <Stack gap="sm">
      <Field label={label} hint={LIMITS[animated ? 'animated' : 'still']}>
        <Select
          options={fitting.map((item) => ({ value: String(item.id), label: uploadLabel(item) }))}
          placeholder={fitting.length === 0 ? 'Загрузок пока нет' : 'Выберите загруженную'}
          value={value === null ? '' : String(value)}
          onChange={(event) =>
            onChange(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))
          }
        />
      </Field>
      <Field label="Или загрузите новую">
        <FileInput
          accept="image/png,image/jpeg,image/webp"
          buttonLabel={upload.isPending ? 'Загружаем…' : 'Выбрать файл'}
          disabled={upload.isPending}
          onChange={(files) => {
            const file = files[0];
            if (file) upload.mutate(file, { onSuccess: (created) => onChange(created.id) });
          }}
        />
      </Field>
      {upload.isError && <Notice tone="danger">{errorText(upload.error)}</Notice>}
      {value !== null && (
        <Grid min="xs">
          <ItemCard
            title={`Загрузка № ${value}`}
            subtitle={current ? uploadLabel(current) : undefined}
            media={
              current?.animated ? (
                { src: current.url, alt: `Загрузка № ${value}` }
              ) : (
                <StillArt
                  image={current?.url ?? `/api/uploads/${value}`}
                  alt={`Загрузка № ${value}`}
                  pixelated={false}
                />
              )
            }
            footer={
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                Убрать
              </Button>
            }
          />
        </Grid>
      )}
    </Stack>
  );
}
