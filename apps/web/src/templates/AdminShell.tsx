// Template of the admin area: sections on the side, a page header, then a list, a table or an
// editor form. Every admin section is built the same way.
import {
  AppFrame,
  Brand,
  Heading,
  Inline,
  LogOut,
  Menu,
  SideNav,
  Stack,
  Text,
  TopBar,
  UserRound,
} from '@questclass/ui';
import type { ReactNode } from 'react';
import { LOGO_URL } from '../features/tasks/assets';

export interface AdminSection {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon?: ReactNode;
}

export interface AdminShellProps {
  readonly sections: readonly AdminSection[];
  /** Id of the current section. */
  readonly active: string | null;
  readonly adminName: string;
  readonly onLogout: () => void;
  readonly children: ReactNode;
}

export function AdminShell({ sections, active, adminName, onLogout, children }: AdminShellProps) {
  return (
    <AppFrame
      width="admin"
      header={
        <TopBar
          width="admin"
          brand={<Brand logo={LOGO_URL} caption="Кабинет родителя" href="/admin" />}
          actions={
            <Menu
              label="Профиль родителя"
              trigger={<UserRound aria-hidden="true" />}
              heading={adminName}
              items={[
                {
                  id: 'logout',
                  label: 'Выйти',
                  icon: <LogOut aria-hidden="true" />,
                  onSelect: onLogout,
                },
              ]}
            />
          }
        />
      }
      aside={
        <SideNav
          label="Разделы кабинета"
          items={sections.map((section) => ({ ...section, active: section.id === active }))}
        />
      }
    >
      {children}
    </AppFrame>
  );
}

export interface AdminPageProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Buttons of the page («Добавить», «Сохранить»). */
  readonly actions?: ReactNode;
  /** List, table or editor form. */
  readonly children?: ReactNode;
}

/** Content of one admin section: title, description, actions, then the body. */
export function AdminPage({ title, description, actions, children }: AdminPageProps) {
  return (
    <Stack gap="lg">
      <Inline justify="between" align="start">
        <Stack gap="xs">
          <Heading level={1} size="xl">
            {title}
          </Heading>
          {description && <Text tone="muted">{description}</Text>}
        </Stack>
        {actions && <Inline>{actions}</Inline>}
      </Inline>
      {children}
    </Stack>
  );
}
