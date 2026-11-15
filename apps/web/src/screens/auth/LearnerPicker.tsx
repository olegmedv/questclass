// /login — on a trusted (children's) device: choose a profile, then the PIN. Elsewhere: ask a
// parent to switch the device on.
import type { ProfileDto } from '@questclass/shared/auth/dto';
import {
  AuthFrame,
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  Grid,
  ItemCard,
  KeyRound,
  Spinner,
  Stack,
  TabletSmartphone,
} from '@questclass/ui';
import { useState } from 'react';
import { useProfiles } from '../../api/queries/auth';
import { AuthBrand } from './common';
import { PinEntry } from './PinEntry';

const parentsLink = (
  <ButtonLink
    href="/login?as=admin"
    variant="ghost"
    size="sm"
    icon={<KeyRound aria-hidden="true" />}
  >
    Я родитель
  </ButtonLink>
);

export function LearnerPicker() {
  const profiles = useProfiles();
  const [selected, setSelected] = useState<ProfileDto | null>(null);

  if (selected) return <PinEntry profile={selected} onBack={() => setSelected(null)} />;

  if (profiles.isPending) {
    return (
      <AuthFrame brand={<AuthBrand />} title="Вход">
        <Stack align="center">
          <Spinner size="lg" label="Загружаем учеников" />
        </Stack>
      </AuthFrame>
    );
  }

  if (profiles.isError) {
    return (
      <AuthFrame brand={<AuthBrand />} title="Вход" footer={parentsLink}>
        <EmptyState
          tone="error"
          title="Не получилось загрузить"
          description={profiles.error.message}
          actions={<Button onClick={() => void profiles.refetch()}>Повторить</Button>}
        />
      </AuthFrame>
    );
  }

  if (profiles.data === null) {
    return (
      <AuthFrame brand={<AuthBrand />} title="Вход" footer={parentsLink}>
        <EmptyState
          art={<TabletSmartphone />}
          title="Попросите родителя включить это устройство"
          description="Ученики входят по PIN только на детском устройстве. Родитель входит в кабинет и нажимает «Сделать устройство детским»."
        />
      </AuthFrame>
    );
  }

  if (profiles.data.length === 0) {
    return (
      <AuthFrame brand={<AuthBrand />} title="Вход" footer={parentsLink}>
        <EmptyState
          title="Учеников пока нет"
          description="Родитель добавляет учеников в кабинете."
        />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      brand={<AuthBrand />}
      title="Кто учится?"
      description="Выбери себя."
      wide
      footer={parentsLink}
    >
      <Grid as="ul" min="xs" aria-label="Ученики">
        {profiles.data.map((profile) => (
          <li key={profile.id}>
            <ItemCard
              title={profile.name}
              media={<Avatar name={profile.name} src={profile.avatar} size="xl" />}
              onClick={() => setSelected(profile)}
            />
          </li>
        ))}
      </Grid>
    </AuthFrame>
  );
}
