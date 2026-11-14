// Template of every learner screen: header with the learner's numbers, profile menu and the
// bottom navigation «Учёба · Герой · Магазин». Data and slots only; the look is in @questclass/ui.
import {
  AppFrame,
  Avatar,
  BookOpen,
  BottomNav,
  Brand,
  ButtonLink,
  Inline,
  KeyRound,
  Menu,
  Shirt,
  ShoppingBag,
  StatChip,
  TopBar,
  Trophy,
  Users,
} from '@questclass/ui';
import type { ReactNode } from 'react';

export type LearnerSection = 'study' | 'hero' | 'shop';

export const LEARNER_PATHS = {
  study: '/',
  hero: '/hero',
  shop: '/shop',
  rewards: '/rewards',
  wishes: '/wishes',
} as const;

const SECTIONS: readonly { id: LearnerSection; label: string; icon: ReactNode }[] = [
  { id: 'study', label: 'Учёба', icon: <BookOpen aria-hidden="true" /> },
  { id: 'hero', label: 'Герой', icon: <Shirt aria-hidden="true" /> },
  { id: 'shop', label: 'Магазин', icon: <ShoppingBag aria-hidden="true" /> },
];

/** Section of a path, for the active tab of the bottom navigation. */
export function learnerSectionOf(pathname: string): LearnerSection | null {
  if (pathname === LEARNER_PATHS.study) return 'study';
  if (pathname.startsWith(LEARNER_PATHS.hero)) return 'hero';
  if (pathname.startsWith(LEARNER_PATHS.shop)) return 'shop';
  return null;
}

export interface LearnerStats {
  readonly level: number;
  readonly xp: number;
  readonly coins: number;
  /** Bought tickets waiting to be used («Мои желания»); hidden while unknown (no wishes API yet). */
  readonly wishes?: number | null;
}

export interface LearnerShellProps {
  readonly learner: { readonly name: string; readonly avatar?: string | null };
  /** Numbers of the header; while unknown (loading) the chips show a placeholder. */
  readonly stats?: LearnerStats | null;
  readonly statsLoading?: boolean;
  readonly active: LearnerSection | null;
  /** «Сменить ученика»: back to the profile picker of this device. */
  readonly onSwitchLearner: () => void;
  /** «Родителям»: to the admin login. */
  readonly onParents: () => void;
  readonly children: ReactNode;
}

const number = (value: number) => value.toLocaleString('ru-RU');

export function LearnerShell({
  learner,
  stats,
  statsLoading = false,
  active,
  onSwitchLearner,
  onParents,
  children,
}: LearnerShellProps) {
  const showStats = Boolean(stats) || statsLoading;
  const header = (
    <TopBar
      brand={<Brand logo="/assets/icons/star-v1-192.png" href={LEARNER_PATHS.study} />}
      actions={
        <>
          <Menu
            label="Профиль"
            trigger={<Users aria-hidden="true" />}
            heading={
              <Inline gap="sm" nowrap>
                <Avatar name={learner.name} src={learner.avatar} size="sm" />
                <span>{learner.name}</span>
              </Inline>
            }
            items={[
              {
                id: 'switch',
                label: 'Сменить ученика',
                icon: <Users aria-hidden="true" />,
                onSelect: onSwitchLearner,
              },
              {
                id: 'parents',
                label: 'Родителям',
                icon: <KeyRound aria-hidden="true" />,
                onSelect: onParents,
              },
            ]}
          />
          <ButtonLink href={LEARNER_PATHS.rewards} size="sm" icon={<Trophy aria-hidden="true" />}>
            Награды
          </ButtonLink>
        </>
      }
    >
      {showStats && (
        <Inline gap="xs" justify="between" aria-label="Мои достижения" role="group">
          <StatChip kind="level" label="Уровень" value={stats ? stats.level : 0} loading={!stats} />
          <StatChip kind="xp" label="Опыт" value={stats ? number(stats.xp) : 0} loading={!stats} />
          <StatChip
            kind="coins"
            label="Монеты"
            value={stats ? number(stats.coins) : 0}
            loading={!stats}
          />
          {(!stats || (stats.wishes !== undefined && stats.wishes !== null)) && (
            <StatChip
              kind="wishes"
              label="Мои желания"
              value={stats?.wishes ?? 0}
              loading={!stats}
              href={LEARNER_PATHS.wishes}
            />
          )}
        </Inline>
      )}
    </TopBar>
  );
  return (
    <AppFrame
      header={header}
      nav={
        <BottomNav
          label="Разделы"
          items={SECTIONS.map((section) => ({
            id: section.id,
            label: section.label,
            href: LEARNER_PATHS[section.id],
            icon: section.icon,
            active: section.id === active,
          }))}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
