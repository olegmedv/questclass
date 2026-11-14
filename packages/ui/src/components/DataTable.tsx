import { useId, type ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import './DataTable.css';

export interface Column<T> {
  readonly key: string;
  readonly header: ReactNode;
  /** Cell content; by default `row[key]`. */
  readonly render?: (row: T) => ReactNode;
  readonly align?: 'start' | 'end' | 'center';
  /** Hidden on narrow screens. */
  readonly secondary?: boolean;
}

export interface DataTableProps<T> {
  /** Name of the table (visible caption unless `captionHidden`). */
  readonly caption: string;
  readonly captionHidden?: boolean;
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string | number;
  readonly loading?: boolean;
  /** Error message instead of the rows. */
  readonly error?: ReactNode;
  /** Shown when there are no rows. */
  readonly empty?: ReactNode;
}

function cell<T>(row: T, column: Column<T>): ReactNode {
  if (column.render) return column.render(row);
  const value = (row as Record<string, unknown>)[column.key];
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return value === null || value === undefined ? '—' : JSON.stringify(value);
}

/** Admin lists: users, devices, history. Scrolls inside its own frame, never the page. */
export function DataTable<T>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  empty = 'Здесь пока пусто',
}: DataTableProps<T>) {
  const captionId = useId();
  if (error) {
    return <EmptyState tone="error" title="Не получилось загрузить" description={error} />;
  }
  return (
    <div
      className="qc-table-wrap"
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      aria-busy={loading || undefined}
    >
      <table className="qc-table">
        <caption
          id={captionId}
          className={captionHidden ? 'qc-visually-hidden' : 'qc-table-caption'}
        >
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                data-align={column.align}
                data-secondary={column.secondary || undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 3 }, (_, i) => (
                <tr key={`loading-${i}`}>
                  {columns.map((column) => (
                    <td key={column.key} data-secondary={column.secondary || undefined}>
                      <Skeleton />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-align={column.align}
                      data-secondary={column.secondary || undefined}
                    >
                      {cell(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="qc-table-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
