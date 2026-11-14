// Route layouts: the learner pages live inside LearnerShell, the admin pages inside AdminShell.
import { House } from '@questclass/ui';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useLogout, useMe } from '../api/queries/auth';
import { AdminShell, type AdminSection } from '../templates/AdminShell';
import { LearnerShell, learnerSectionOf } from '../templates/LearnerShell';

/** Sections of the admin area. Each admin screen adds its line here. */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'home', label: 'Главная', href: '/admin', icon: <House aria-hidden="true" /> },
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
  const logout = useLogout();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!me.data) return null;
  return (
    <LearnerShell
      learner={me.data}
      active={learnerSectionOf(pathname)}
      onSwitchLearner={() => {
        logout.mutate(undefined, { onSettled: () => void navigate('/login') });
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
        logout.mutate(undefined, { onSettled: () => void navigate('/login?as=admin') });
      }}
    >
      <Outlet />
    </AdminShell>
  );
}
