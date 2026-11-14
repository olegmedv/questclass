import type { MeDto } from '@questclass/shared/auth/dto';
import type { UserRole } from '@questclass/shared/auth/schemas';
import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { isApiError } from '../api/client';
import { useMe, useSetupStatus } from '../api/queries/auth';
import { StatusScreen } from './ErrorBoundary';

/** Where each role lands after login and when it opens a page that is not for it. */
export const HOME_BY_ROLE: Readonly<Record<UserRole, string>> = {
  learner: '/',
  admin: '/admin',
};

/** Location state of the login redirect: where to return after a successful login. */
export interface LoginRedirectState {
  readonly from?: string;
}

export function LoadingScreen() {
  return (
    <main className="qc-status-screen" aria-busy="true">
      <p role="status">Загрузка…</p>
    </main>
  );
}

export function ForbiddenScreen() {
  return (
    <StatusScreen
      title="Нет доступа"
      message="Этот раздел открыт только взрослым."
      actions={
        <>
          <Link to="/">На главную</Link>
          <Link to="/login?as=admin">Войти как родитель</Link>
        </>
      }
    />
  );
}

function LoginRedirect() {
  const location = useLocation();
  const state: LoginRedirectState = { from: location.pathname + location.search };
  return <Navigate to="/login" replace state={state} />;
}

/**
 * Renders an API failure: 401 → the login screen, 403 → «Нет доступа»,
 * anything else → a message with a retry button.
 */
export function QueryErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (isApiError(error) && error.status === 401) {
    return <LoginRedirect />;
  }
  if (isApiError(error) && error.status === 403) {
    return <ForbiddenScreen />;
  }
  const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
  return (
    <StatusScreen
      title="Не получилось загрузить"
      message={message}
      actions={
        onRetry && (
          <button type="button" onClick={onRetry}>
            Повторить
          </button>
        )
      }
    />
  );
}

/** Root gate: until the first admin exists every page leads to `/setup`, and back. */
export function SetupGate() {
  const setup = useSetupStatus();
  const { pathname } = useLocation();
  if (setup.isPending) {
    return <LoadingScreen />;
  }
  if (setup.isError) {
    return <QueryErrorView error={setup.error} onRetry={() => void setup.refetch()} />;
  }
  const onSetup = pathname === '/setup';
  if (setup.data.needed && !onSetup) {
    return <Navigate to="/setup" replace />;
  }
  if (!setup.data.needed && onSetup) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

/**
 * Layout route for pages of one role. No session → login; an admin on a learner page goes to
 * the admin home; a learner on an admin page sees «Нет доступа».
 */
export function RequireRole({ role, children }: { role: UserRole; children?: ReactNode }) {
  const me = useMe();
  if (me.isPending) {
    return <LoadingScreen />;
  }
  if (me.isError) {
    return <QueryErrorView error={me.error} onRetry={() => void me.refetch()} />;
  }
  if (me.data === null) {
    return <LoginRedirect />;
  }
  if (me.data.role !== role) {
    return me.data.role === 'admin' ? (
      <Navigate to={HOME_BY_ROLE.admin} replace />
    ) : (
      <ForbiddenScreen />
    );
  }
  return children ?? <Outlet />;
}

/** The component gallery is open to everyone in development and to admins in production. */
export function canOpenDevTools(me: MeDto | null | undefined, isDev: boolean): boolean {
  return isDev || me?.role === 'admin';
}

export function DevToolsGate() {
  const me = useMe();
  if (import.meta.env.DEV) {
    return <Outlet />;
  }
  if (me.isPending) {
    return <LoadingScreen />;
  }
  if (me.isError) {
    return <QueryErrorView error={me.error} onRetry={() => void me.refetch()} />;
  }
  if (me.data === null) {
    return <LoginRedirect />;
  }
  return canOpenDevTools(me.data, false) ? <Outlet /> : <ForbiddenScreen />;
}
