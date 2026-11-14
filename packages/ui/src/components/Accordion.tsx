import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import './Accordion.css';

export interface AccordionItem {
  readonly id: string;
  readonly title: ReactNode;
  readonly content: ReactNode;
  readonly disabled?: boolean;
}

export interface AccordionProps {
  readonly items: readonly AccordionItem[];
  /** Several sections may be open at once. */
  readonly multiple?: boolean;
  readonly defaultOpen?: readonly string[];
}

/** Collapsible sections («Серия занятий», «Помощь», settings groups). */
export function Accordion({ items, multiple = false, defaultOpen = [] }: AccordionProps) {
  const base = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(defaultOpen));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(multiple ? current : []);
      if (current.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="qc-accordion">
      {items.map((item) => {
        const expanded = open.has(item.id);
        const buttonId = `${base}-${item.id}-button`;
        const panelId = `${base}-${item.id}-panel`;
        return (
          <div key={item.id} className="qc-accordion-item" data-open={expanded || undefined}>
            <h3 className="qc-accordion-heading">
              <button
                type="button"
                id={buttonId}
                className="qc-accordion-trigger"
                aria-expanded={expanded}
                aria-controls={panelId}
                disabled={item.disabled}
                onClick={() => toggle(item.id)}
              >
                <span className="qc-accordion-title">{item.title}</span>
                <ChevronDown className="qc-accordion-chevron" aria-hidden="true" />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="qc-accordion-panel"
              hidden={!expanded}
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
