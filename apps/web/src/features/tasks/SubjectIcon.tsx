import { IconImage, Placeholder, type IconImageSize } from '@questclass/ui';
import type { SubjectDto } from '@questclass/shared/tasks/dto';
import { subjectIconUrl } from './assets';

/** Where the icon of a subject comes from: the admin's upload or a built-in pixel picture. */
export function subjectIconSource(
  subject: Pick<SubjectDto, 'icon' | 'iconUploadId'>,
): { readonly src: string; readonly pixelated: boolean } | null {
  if (subject.iconUploadId !== null) {
    return { src: `/api/uploads/${subject.iconUploadId}`, pixelated: false };
  }
  const src = subjectIconUrl(subject.icon);
  return src ? { src, pixelated: true } : null;
}

/**
 * Icon of a subject. `fill` (the default) takes the box of its container (tiles, the lesson card);
 * lists use a fixed `sm`. Without an icon: the placeholder (P-003).
 */
export function SubjectIcon({
  subject,
  size = 'fill',
}: {
  readonly subject: Pick<SubjectDto, 'icon' | 'iconUploadId'>;
  readonly size?: IconImageSize;
}) {
  const source = subjectIconSource(subject);
  if (!source) return <Placeholder kind="subject" label="Значок предмета" size="sm" />;
  return <IconImage src={source.src} pixelated={source.pixelated} size={size} />;
}
