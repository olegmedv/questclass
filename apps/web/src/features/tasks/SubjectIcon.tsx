import { Placeholder } from '@questclass/ui';
import type { SubjectDto } from '@questclass/shared/tasks/dto';
import { subjectIconUrl } from './assets';

/** Pixel icon of a subject; a subject created by the admin has none yet (P-003). */
export function SubjectIcon({ subject }: { readonly subject: SubjectDto }) {
  const src = subjectIconUrl(subject.icon);
  if (!src) return <Placeholder kind="subject" label="Значок предмета" size="sm" />;
  return <img src={src} alt="" loading="lazy" decoding="async" />;
}
