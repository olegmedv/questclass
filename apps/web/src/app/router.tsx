import { EmptyState } from '@questclass/ui';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { Login } from '../screens/auth/Login';
import { Setup } from '../screens/auth/Setup';
import { Home } from '../screens/learner/Home';
import { TaskScreen } from '../screens/learner/TaskScreen';
import { TrustDevice } from '../screens/auth/TrustDevice';
import { AdminPage } from '../templates/AdminShell';
import { RouteErrorScreen, StatusScreen } from './ErrorBoundary';
import { DevToolsGate, RequireRole, SetupGate } from './guards';
import { AdminLayout, LearnerLayout } from './layouts';

const LATER = 'Этот экран появится в следующих версиях.';

/** Temporary content of a learner route whose screen arrives in a later plan item. */
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
          { path: '/setup', element: <Setup /> },
          { path: '/login', element: <Login /> },
          {
            element: <RequireRole role="learner" />,
            children: [
              {
                element: <LearnerLayout />,
                children: [
                  { path: '/', element: <Home /> },
                  { path: '/hero', element: <LearnerStub title="Герой" /> },
                  { path: '/shop', element: <LearnerStub title="Магазин" /> },
                  { path: '/rewards', element: <LearnerStub title="Мои награды" /> },
                  { path: '/wishes', element: <LearnerStub title="Мои желания" /> },
                ],
              },
              { path: '/tasks/:id', element: <TaskScreen /> },
            ],
          },
          // Admin screens are loaded on demand: a learner's tablet never downloads them.
          {
            path: '/admin',
            element: <RequireRole role="admin" />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { index: true, element: <AdminStub title="Кабинет родителя" /> },
                  { path: 'device', element: <TrustDevice /> },
                  {
                    path: 'users',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Users')).Users,
                    }),
                  },
                  {
                    path: 'settings',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Settings')).Settings,
                    }),
                  },
                  {
                    path: 'settings/secrets',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Secrets')).Secrets,
                    }),
                  },
                  {
                    path: 'settings/import-tokens',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/ImportTokens')).ImportTokens,
                    }),
                  },
                  {
                    path: 'subjects',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Subjects')).Subjects,
                    }),
                  },
                  {
                    path: 'tasks',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Tasks')).Tasks,
                    }),
                  },
                  {
                    path: 'tasks/revisions',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/TaskRevisions')).TaskRevisions,
                    }),
                  },
                  {
                    path: 'tasks/revisions/:id',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/TaskRevisions')).TaskRevision,
                    }),
                  },
                  {
                    path: 'tasks/:id',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/TaskEdit')).TaskEdit,
                    }),
                  },
                  {
                    path: 'progress',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/LearnerProgress')).LearnerProgress,
                    }),
                  },
                  {
                    path: 'progress/:learnerId',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/LearnerProgress')).LearnerProgress,
                    }),
                  },
                  {
                    path: 'attempts/:id',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/AttemptDetails')).AttemptDetails,
                    }),
                  },
                  {
                    path: 'reviews',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Reviews')).Reviews,
                    }),
                  },
                  {
                    path: 'awards',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Awards')).Awards,
                    }),
                  },
                  {
                    path: 'awards/reasons',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/RewardReasons')).RewardReasons,
                    }),
                  },
                  {
                    path: 'awards/:learnerId',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/Awards')).Awards,
                    }),
                  },
                  {
                    path: 'shop',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/ShopItems')).ShopItems,
                    }),
                  },
                  {
                    path: 'shop/:id',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/ShopItemEdit')).ShopItemEdit,
                    }),
                  },
                  {
                    path: 'wishes',
                    lazy: async () => ({
                      Component: (await import('../screens/admin/WishFulfillment')).WishFulfillment,
                    }),
                  },
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
