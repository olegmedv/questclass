// «Мои награды» (reference-screens 05, 07, 09, 10): the details of the learner's experience
// (level, XP, coins), and the tabs «От родителя» (manual awards) and «Билетики» (the wishes).
// Achievements are stage 2.
import type { AwardDto } from '@questclass/shared/rewards/dto';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ChevronRight,
  EmptyState,
  Gift,
  Heading,
  Heart,
  Inline,
  ProgressBar,
  RewardLine,
  Skeleton,
  Stack,
  StatChip,
  Tabs,
  Text,
  Ticket,
  type TabItem,
} from '@questclass/ui';
import { useSearchParams } from 'react-router';
import { dateText, useMyAwards } from '../../features/rewards/queries';
import { WishInventory } from '../../features/shop/WishInventory';
import { useWallet } from '../../features/wallet/queries';

type RewardsTab = 'parent' | 'tickets';

const TABS: readonly TabItem<RewardsTab>[] = [
  { id: 'parent', label: 'От родителя', icon: <Heart aria-hidden="true" /> },
  { id: 'tickets', label: 'Билетики', icon: <Ticket aria-hidden="true" /> },
];

const number = (value: number) => value.toLocaleString('ru-RU');

/** «Подробности опыта»: level, XP of the level, coins and what they are for. */
function Experience() {
  const wallet = useWallet();
  if (wallet.isError) return null;
  const data = wallet.data;
  const perLevel = data ? data.levelXp + data.xpToNext : 0;
  return (
    <Card aria-label="Мой опыт" loading={!data}>
      {data && (
        <Stack gap="md">
          <Inline justify="between" align="start">
            <Stack gap="xs">
              <Heading level={2} size="md">
                Уровень {data.level}
              </Heading>
              <Text tone="muted">{number(data.xp)} XP всего</Text>
            </Stack>
            <StatChip kind="coins" label="монет" showLabel value={number(data.coins)} />
          </Inline>
          <ProgressBar
            label={`До уровня ${data.level + 1}`}
            value={data.levelXp}
            max={perLevel}
            valueText={`${number(data.levelXp)} / ${number(perLevel)} XP · до уровня ${data.level + 1}`}
            showLabel
          />
          <Stack gap="xs">
            <Text size="sm">
              <b>XP — опыт.</b> Приближает новый уровень.
            </Text>
            <Text size="sm">
              <b>Монеты.</b> Можно потратить в магазине.
            </Text>
          </Stack>
          <Inline>
            <ButtonLink href="/progress" size="sm" icon={<ChevronRight aria-hidden="true" />}>
              Мой прогресс
            </ButtonLink>
          </Inline>
        </Stack>
      )}
    </Card>
  );
}

function AwardCard({ award }: { readonly award: AwardDto }) {
  const cancelled = award.cancelledAt !== null;
  const where = [award.reasonName, dateText(award.date), award.subjectName].join(' · ');
  return (
    <Card as="article" aria-label={award.title} padding="md">
      <Stack gap="sm">
        <Inline justify="between" align="start" nowrap>
          <Inline gap="sm" nowrap>
            <Gift aria-hidden="true" />
            <Text weight="bold">{award.title}</Text>
          </Inline>
          {cancelled && <Badge tone="danger">Отменено</Badge>}
        </Inline>
        <Text size="sm" tone="muted">
          {where}
        </Text>
        {award.note && <Text size="sm">{award.note}</Text>}
        <RewardLine
          label={cancelled ? 'Было начислено' : 'Награда'}
          xp={award.xp}
          coins={award.coins}
        />
      </Stack>
    </Card>
  );
}

function ParentAwards() {
  const awards = useMyAwards();
  if (awards.isPending) {
    return (
      <Stack gap="md" aria-busy="true" aria-label="Загрузка">
        <Skeleton lines={3} />
        <Skeleton lines={3} />
      </Stack>
    );
  }
  if (awards.isError) {
    return (
      <EmptyState
        tone="error"
        title="Не получилось загрузить"
        description={awards.error.message}
        actions={<Button onClick={() => void awards.refetch()}>Повторить</Button>}
      />
    );
  }
  const items = awards.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <EmptyState
        art={<Heart aria-hidden="true" />}
        title="Здесь будут награды от родителя"
        description="Родитель отмечает занятия и дела — монеты и опыт приходят сюда."
      />
    );
  }
  return (
    <Stack gap="md">
      <Stack as="ul" gap="md" aria-label="Награды от родителя">
        {items.map((award) => (
          <li key={award.id}>
            <AwardCard award={award} />
          </li>
        ))}
      </Stack>
      {awards.hasNextPage && (
        <Button loading={awards.isFetchingNextPage} onClick={() => void awards.fetchNextPage()}>
          Показать ещё
        </Button>
      )}
    </Stack>
  );
}

export function Rewards() {
  const [params, setParams] = useSearchParams();
  const tab: RewardsTab = params.get('tab') === 'tickets' ? 'tickets' : 'parent';
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Heading level={1} size="xl">
          Мои награды
        </Heading>
        <Text tone="muted">Опыт, награды от родителя и желания — всё здесь.</Text>
      </Stack>
      <Experience />
      <Tabs
        label="Мои награды"
        items={TABS}
        value={tab}
        onChange={(next) => setParams(next === 'parent' ? {} : { tab: next }, { replace: true })}
      >
        {tab === 'parent' ? <ParentAwards /> : <WishInventory />}
      </Tabs>
    </Stack>
  );
}
