import { ToastProvider, UiLinkProvider, type UiLinkProps } from '@questclass/ui';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { isApiError, isUnauthorized } from '../api/client';
import { authKeys } from '../api/queries/auth';
import { AnimationProvider } from '../features/animation/AnimationManager';
import { SoundProvider } from '../features/sound/useSound';

/** Client errors (4xx) are answers, not glitches: they are never retried. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

/**
 * The app-wide query client. A 401 on any query means the session has ended (admin idle
 * timeout, revoked device…): the cached user is cleared so the guards show the login screen.
 * Mutations are excluded: there a 401 is an answer (wrong password or PIN).
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      // `fetchMe` itself answers 401 with null, so this only reacts to other queries.
      onError: (error) => {
        if (isUnauthorized(error)) {
          client.setQueryData(authKeys.me, null);
        }
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return client;
}

/** Design-system links navigate inside the SPA. */
function RouterLink({ href, ...rest }: UiLinkProps) {
  return <Link to={href} {...rest} />;
}

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <UiLinkProvider component={RouterLink}>
        <AnimationProvider>
          <SoundProvider>
            <ToastProvider>{children}</ToastProvider>
          </SoundProvider>
        </AnimationProvider>
      </UiLinkProvider>
    </QueryClientProvider>
  );
}
