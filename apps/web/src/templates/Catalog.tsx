// Template of every collection screen (shop, rewards, wishes): filters, a grid of ItemCards and
// a details dialog.
import {
  Button,
  EmptyState,
  Grid,
  Heading,
  Inline,
  ItemCard,
  Modal,
  Stack,
  Tabs,
  Text,
  type TabItem,
} from '@questclass/ui';
import type { ReactNode } from 'react';

export interface CatalogFilter<F extends string> {
  readonly label: string;
  readonly items: readonly TabItem<F>[];
  readonly value: F;
  readonly onChange: (value: F) => void;
}

export interface CatalogDetails<T> {
  readonly item: T | null;
  readonly title: (item: T) => string;
  readonly render: (item: T) => ReactNode;
  readonly footer?: (item: T) => ReactNode;
  readonly onClose: () => void;
}

export interface CatalogProps<T, F extends string> {
  readonly title: string;
  readonly description?: ReactNode;
  /** Buttons next to the title (e.g. «Мои желания»). */
  readonly actions?: ReactNode;
  readonly filter?: CatalogFilter<F>;
  readonly items: readonly T[];
  readonly itemKey: (item: T) => string;
  /** An ItemCard; `open` shows the details dialog for this item. */
  readonly renderItem: (item: T, open: () => void) => ReactNode;
  readonly details?: CatalogDetails<T>;
  readonly loading?: boolean;
  readonly error?: ReactNode;
  readonly onRetry?: () => void;
  readonly empty: {
    readonly title: string;
    readonly description?: ReactNode;
    readonly action?: ReactNode;
  };
  /** Opens the details of an item (passed to `renderItem`). */
  readonly onOpen?: (item: T) => void;
}

export function Catalog<T, F extends string>({
  title,
  description,
  actions,
  filter,
  items,
  itemKey,
  renderItem,
  details,
  loading = false,
  error,
  onRetry,
  empty,
  onOpen,
}: CatalogProps<T, F>) {
  let body: ReactNode;
  if (error) {
    body = (
      <EmptyState
        tone="error"
        title="Не получилось загрузить"
        description={error}
        actions={onRetry && <Button onClick={onRetry}>Повторить</Button>}
      />
    );
  } else if (loading) {
    body = (
      <Grid as="ul" min="sm" aria-busy="true" aria-label="Загрузка">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <ItemCard title="" loading />
          </li>
        ))}
      </Grid>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState title={empty.title} description={empty.description} actions={empty.action} />
    );
  } else {
    body = (
      <Grid as="ul" min="sm">
        {items.map((item) => (
          <li key={itemKey(item)}>{renderItem(item, () => onOpen?.(item))}</li>
        ))}
      </Grid>
    );
  }
  const selected = details?.item ?? null;
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
      {filter ? (
        <Tabs
          label={filter.label}
          items={filter.items}
          value={filter.value}
          onChange={filter.onChange}
        >
          {body}
        </Tabs>
      ) : (
        body
      )}
      {details && (
        <Modal
          open={selected !== null}
          onClose={details.onClose}
          title={selected === null ? '' : details.title(selected)}
          footer={selected === null ? undefined : details.footer?.(selected)}
        >
          {selected !== null && details.render(selected)}
        </Modal>
      )}
    </Stack>
  );
}
