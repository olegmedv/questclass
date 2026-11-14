import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

export interface StatusScreenProps {
  readonly title: string;
  readonly message?: string;
  readonly actions?: ReactNode;
}

/** A full-screen message (error, no access, nothing here). */
export function StatusScreen({ title, message, actions }: StatusScreenProps) {
  return (
    <main className="qc-status-screen">
      <h1>{title}</h1>
      {message && <p>{message}</p>}
      {actions && <div className="qc-status-screen__actions">{actions}</div>}
    </main>
  );
}

const reload = () => window.location.reload();

export function CrashScreen() {
  return (
    <StatusScreen
      title="Что-то пошло не так"
      message="Обновите страницу. Если ошибка повторится, расскажите родителю."
      actions={
        <button type="button" onClick={reload}>
          Обновить страницу
        </button>
      }
    />
  );
}

interface BoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface BoundaryState {
  readonly error: unknown;
}

/** Catches render errors below it so one broken widget never blanks the whole app. */
export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error ?? new Error('Unknown render error') };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback ?? <CrashScreen />;
    }
    return this.props.children;
  }
}

/** `errorElement` of the router: loader errors, lazy-chunk failures and render errors. */
export function RouteErrorScreen() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <StatusScreen title="Такой страницы нет" actions={<a href="/">На главную</a>} />;
  }
  console.error('Route error', error);
  return <CrashScreen />;
}
