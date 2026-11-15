// Template of progress screens (learner and admin): totals, the streak, highlights and history.
import {
  Card,
  DataTable,
  Grid,
  Heading,
  Inline,
  Stack,
  StatChip,
  Text,
  type DataTableProps,
  type StatKind,
} from '@questclass/ui';
import type { ReactNode } from 'react';

export interface ProgressTotal {
  readonly id: string;
  readonly label: string;
  readonly value: string | number;
  readonly kind: StatKind;
  readonly hint?: ReactNode;
}

export interface ProgressViewProps<Row> {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly totals: readonly ProgressTotal[];
  readonly totalsLoading?: boolean;
  /** The streak block (filled by the streak feature). */
  readonly streak?: ReactNode;
  /** Extra sections between totals and history (passed tasks, achievements…). */
  readonly children?: ReactNode;
  readonly history: DataTableProps<Row>;
  /** Under the history: «Показать ещё». */
  readonly historyFooter?: ReactNode;
}

export function ProgressView<Row>({
  title,
  description,
  actions,
  totals,
  totalsLoading = false,
  streak,
  children,
  history,
  historyFooter,
}: ProgressViewProps<Row>) {
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
      <Grid as="ul" min="sm" gap="sm" aria-label="Итоги">
        {totals.map((total) => (
          <li key={total.id}>
            <Card padding="md" tone="raised">
              <Stack gap="xs">
                <StatChip
                  kind={total.kind}
                  label={total.label}
                  value={total.value}
                  loading={totalsLoading}
                />
                <Text size="sm" tone="muted" aria-hidden="true">
                  {total.label}
                </Text>
                {total.hint && (
                  <Text size="xs" tone="subtle">
                    {total.hint}
                  </Text>
                )}
              </Stack>
            </Card>
          </li>
        ))}
      </Grid>
      {streak}
      {children}
      <DataTable {...history} />
      {historyFooter}
    </Stack>
  );
}
