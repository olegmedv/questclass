import { EmptyState } from '@questclass/ui';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AdminPage } from '../templates/AdminShell';
import { TaskPlayer } from '../templates/TaskPlayer';
import { RouteErrorScreen, StatusScreen } from './ErrorBoundary';
import { DevToolsGate, RequireRole, SetupGate } from './guards';
import { AdminLayout, LearnerLayout } from './layouts';

const LATER = 'Этот экран появится в следующих версиях.';

/** Temporary content of a route whose screen arrives in a later plan item. */
function ScreenStub({ title }: { title: string }) {
  return <StatusScreen title={title} message={LATER} />;
}

/** The same inside the learner shell. */
function LearnerStub({ title }: { title: string }) {
  return <EmptyState headingLevel={1} plain title={title} description={LATER} />;
}

/** The same inside the admin shell. */
function AdminStub({ title }: { title: string }) {
  return (
    <AdminPage title={title}>
      <EmptyState title="Раздел в разработке" description={LATER} />
    </AdminPage>
  );
}

const notFound = <StatusScreen title="Такой страницы нет" />;

/**
 * Every page of the SPA. Each screen adds its line here.
 * `/setup` and `/login` are public; learner and admin pages are guarded by role.
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorScreen />,
    children: [
      {
        element: <SetupGate />,
        children: [
          { path: '/setup', element: <ScreenStub title="Первый запуск" /> },
          { path: '/login', element: <ScreenStub title="Вход" /> },
          {
            element: <RequireRole role="learner" />,
            children: [
              {
                element: <LearnerLayout />,
                children: [
                  { path: '/', element: <LearnerStub title="Учёба" /> },
                  { path: '/hero', element: <LearnerStub title="Герой" /> },
                  { path: '/shop', element: <LearnerStub title="Магазин" /> },
                  { path: '/rewards', element: <LearnerStub title="Мои награды" /> },
                  { path: '/wishes', element: <LearnerStub title="Мои желания" /> },
                ],
              },
              {
                path: '/tasks/:id',
                element: (
                  <TaskPlayer title="Задание" backHref="/">
                    <EmptyState title="Задание скоро откроется" description={LATER} />
                  </TaskPlayer>
                ),
              },
            ],
          },
          {
            path: '/admin',
            element: <RequireRole role="admin" />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { index: true, element: <AdminStub title="Кабинет родителя" /> },
                  { path: '*', element: <AdminStub title="Такой страницы нет" /> },
                ],
              },
            ],
          },
        ],
      },
      {
        path: '/dev',
        element: <DevToolsGate />,
        children: [
          {
            path: 'ui',
            lazy: async () => ({ Component: (await import('../screens/dev/UiGallery')).UiGallery }),
          },
          {
            path: 'templates/:name',
            lazy: async () => ({
              Component: (await import('../screens/dev/TemplateDemos')).TemplateDemos,
            }),
          },
        ],
      },
      { path: '*', element: notFound },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
