import { createBrowserRouter, type RouteObject } from 'react-router';
import { RouteErrorScreen, StatusScreen } from './ErrorBoundary';
import { DevToolsGate, RequireRole, SetupGate } from './guards';

/** Temporary content of a route whose screen arrives in a later plan item. */
function ScreenStub({ title }: { title: string }) {
  return <StatusScreen title={title} message="Этот экран появится в следующих версиях." />;
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
              { path: '/', element: <ScreenStub title="Учёба" /> },
              { path: '/tasks/:id', element: <ScreenStub title="Задание" /> },
              { path: '/hero', element: <ScreenStub title="Герой" /> },
              { path: '/shop', element: <ScreenStub title="Магазин" /> },
              { path: '/rewards', element: <ScreenStub title="Мои награды" /> },
            ],
          },
          {
            path: '/admin',
            element: <RequireRole role="admin" />,
            children: [
              { index: true, element: <ScreenStub title="Кабинет родителя" /> },
              { path: '*', element: notFound },
            ],
          },
        ],
      },
      {
        path: '/dev/ui',
        element: <DevToolsGate />,
        children: [{ index: true, element: <ScreenStub title="Галерея компонентов" /> }],
      },
      { path: '*', element: notFound },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
