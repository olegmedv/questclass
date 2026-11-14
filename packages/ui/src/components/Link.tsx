import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type ReactNode,
} from 'react';

/** What the design system needs from a link component (the app plugs in its router link). */
export interface UiLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
  readonly 'aria-current'?: 'page' | undefined;
  readonly 'aria-label'?: string;
  readonly title?: string;
}

function Anchor({ href, ...rest }: UiLinkProps) {
  return <a href={href} {...rest} />;
}

const LinkContext = createContext<ComponentType<UiLinkProps>>(Anchor);

/** Makes every navigation component of the design system use the app's router links. */
export function UiLinkProvider({
  component,
  children,
}: {
  readonly component: ComponentType<UiLinkProps>;
  readonly children: ReactNode;
}) {
  return <LinkContext.Provider value={component}>{children}</LinkContext.Provider>;
}

/** A link rendered by the app's router (plain `<a>` without a provider). */
export function UiLink(props: UiLinkProps) {
  // The component comes from the provider and is stable for the app's lifetime.
  return createElement(useContext(LinkContext), props);
}
