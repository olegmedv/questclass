import { RouterProvider } from 'react-router/dom';
import { ErrorBoundary } from './ErrorBoundary';
import { createQueryClient, Providers } from './providers';
import { createAppRouter } from './router';

const queryClient = createQueryClient();
const router = createAppRouter();

/** Application shell: query client, router and a last-resort error boundary. */
export function App() {
  return (
    <ErrorBoundary>
      <Providers client={queryClient}>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  );
}
