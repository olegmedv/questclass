// Tabs between the pages of the «Награды» section; each tab is its own address.
import { Tabs } from '@questclass/ui';
import { useNavigate } from 'react-router';

export function RewardsNav({
  current,
  learnerId = null,
}: {
  current: 'awards' | 'reasons';
  learnerId?: number | null;
}) {
  const navigate = useNavigate();
  return (
    <Tabs
      label="Разделы наград"
      variant="underline"
      items={[
        { id: 'awards', label: 'Начисления' },
        { id: 'reasons', label: 'Причины' },
      ]}
      value={current}
      onChange={(id) =>
        void navigate(
          id === 'reasons'
            ? '/admin/awards/reasons'
            : learnerId === null
              ? '/admin/awards'
              : `/admin/awards/${learnerId}`,
        )
      }
    />
  );
}
