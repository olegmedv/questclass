import { useState } from 'react';
import './Avatar.css';

export interface AvatarProps {
  readonly name: string;
  /** Picture URL; without it (or when it fails to load) the first letter is shown. */
  readonly src?: string | null;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className="qc-avatar" data-size={size}>
      {showImage ? (
        <img src={src ?? undefined} alt={name} onError={() => setFailed(src ?? null)} />
      ) : (
        <span role="img" aria-label={name} className="qc-avatar-initial">
          {initial}
        </span>
      )}
    </span>
  );
}
