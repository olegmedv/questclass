import { Button, ButtonLink, Container, EmptyState } from '@questclass/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

export interface StatusScreenProps {
  readonly title: string;
  readonly message?: string;
  readonly actions?: ReactNode;
}

/** A full-screen message (error, no access, nothing here) outside the shells. */
export function StatusScreen({ title, message, actions }: StatusScreenProps) {
  return (
    <main>
      <Container padded>
        <EmptyState headingLevel={1} plain title={title} description={message} actions={actions} />
      </Container>
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
        <Button variant="primary" onClick={reload}>
          Обновить страницу
        </Button>
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
    return (
      <StatusScreen
        title="Такой страницы нет"
        actions={<ButtonLink href="/">На главную</ButtonLink>}
      />
    );
  }
  console.error('Route error', error);
  return <CrashScreen />;
}
