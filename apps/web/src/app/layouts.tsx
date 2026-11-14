// Route layouts: the learner pages live inside LearnerShell, the admin pages inside AdminShell.
import {
  BookOpen,
  ClipboardCheck,
  Gift,
  History,
  House,
  ListChecks,
  Settings,
  Shapes,
  ShoppingBag,
  TabletSmartphone,
  Ticket,
  UserRound,
  Users,
} from '@questclass/ui';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useMe } from '../api/queries/auth';
import { wishesCount } from '../features/shop/model';
import { useMyWishes } from '../features/shop/queries';
import { useWallet } from '../features/wallet/queries';
import { AdminShell, type AdminSection } from '../templates/AdminShell';
import { LearnerShell, learnerSectionOf } from '../templates/LearnerShell';

/** Sections of the admin area. Each admin screen adds its line here. */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'home', label: 'Главная', href: '/admin', icon: <House aria-hidden="true" /> },
  {
    id: 'device',
    label: 'Устройства',
    href: '/admin/device',
    icon: <TabletSmartphone aria-hidden="true" />,
  },
  { id: 'users', label: 'Пользователи', href: '/admin/users', icon: <Users aria-hidden="true" /> },
  { id: 'tasks', label: 'Задания', href: '/admin/tasks', icon: <BookOpen aria-hidden="true" /> },
  {
    id: 'subjects',
    label: 'Предметы',
    href: '/admin/subjects',
    icon: <Shapes aria-hidden="true" />,
  },
  {
    id: 'progress',
    label: 'Прогресс',
    href: '/admin/progress',
    icon: <ListChecks aria-hidden="true" />,
  },
  {
    id: 'reviews',
    label: 'Проверки',
    href: '/admin/reviews',
    icon: <ClipboardCheck aria-hidden="true" />,
  },
  { id: 'awards', label: 'Награды', href: '/admin/awards', icon: <Gift aria-hidden="true" /> },
  {
    id: 'shop',
    label: 'Магазин',
    href: '/admin/shop',
    icon: <ShoppingBag aria-hidden="true" />,
  },
  {
    id: 'wishes',
    label: 'Выдача желаний',
    href: '/admin/wishes',
    icon: <Ticket aria-hidden="true" />,
  },
  {
    id: 'history',
    label: 'История',
    href: '/admin/history',
    icon: <History aria-hidden="true" />,
  },
  {
    id: 'settings',
    label: 'Настройки',
    href: '/admin/settings',
    icon: <Settings aria-hidden="true" />,
  },
  {
    id: 'profile',
    label: 'Профиль',
    href: '/admin/profile',
    icon: <UserRound aria-hidden="true" />,
  },
];

/** The section whose link is the longest prefix of the path. */
export function adminSectionOf(pathname: string, sections = ADMIN_SECTIONS): string | null {
  let best: AdminSection | null = null;
  for (const section of sections) {
    const matches = pathname === section.href || pathname.startsWith(`${section.href}/`);
    if (matches && (!best || section.href.length > best.href.length)) best = section;
  }
  return best?.id ?? null;
}

export function LearnerLayout() {
  const me = useMe();
  const wallet = useWallet();
  const wishes = useMyWishes();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!me.data) return null;
  return (
    <LearnerShell
      learner={me.data}
      stats={
        wallet.data
          ? {
              level: wallet.data.level,
              xp: wallet.data.xp,
              coins: wallet.data.coins,
              // «Мои желания»: hidden while unknown (still loading or failed).
              wishes: wishes.data ? wishesCount(wishes.data.pages[0]?.groups ?? []) : null,
            }
          : null
      }
      statsLoading={wallet.isPending}
      active={learnerSectionOf(pathname)}
      onSwitchLearner={() => {
        // Leave the guarded pages first, so the end of the session cannot race the redirect.
        void navigate('/login', { replace: true });
        logout.mutate();
      }}
      onParents={() => void navigate('/login?as=admin')}
    >
      <Outlet />
    </LearnerShell>
  );
}

export function AdminLayout() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!me.data) return null;
  return (
    <AdminShell
      sections={ADMIN_SECTIONS}
      active={adminSectionOf(pathname)}
      adminName={me.data.name}
      onLogout={() => {
        // On a children's device the profile picker opens; elsewhere «Я родитель» is one tap away.
        void navigate('/login', { replace: true });
        logout.mutate();
      }}
    >
      <Outlet />
    </AdminShell>
  );
}
