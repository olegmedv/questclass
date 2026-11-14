import { Check, Play } from 'lucide-react';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Tabs, type TabItem } from '../components/Tabs';
import './Ribbon.css';

export interface RibbonCard {
  readonly id: string;
  readonly title: string;
  /** A still picture: hero poster or room thumbnail. */
  readonly picture: ReactNode;
  /** A 3:2 room thumbnail instead of a square hero. */
  readonly wide?: boolean;
  /** Worn now (or the chosen room): «Надет». */
  readonly current?: boolean;
  /** A live hero or a room that moves: «Живой». */
  readonly live?: boolean;
  /** Full accessible name («Вампир, живой, надет»). */
  readonly label: string;
}

export interface HeroRibbonProps<T extends string> {
  /** Name of the tab list («Персонажи и комнаты»). */
  readonly label: string;
  readonly tabs: readonly TabItem<T>[];
  readonly tab: T;
  readonly onTabChange: (tab: T) => void;
  /** Name of the card list («Твои живые персонажи»). */
  readonly listLabel: string;
  readonly cards: readonly RibbonCard[];
  /** One tap wears the hero or puts up the room. */
  readonly onChoose: (id: string) => void;
  /** While a choice is being saved. */
  readonly disabled?: boolean;
  /** Shown instead of the list when it is empty. */
  readonly empty?: ReactNode;
}

/**
 * The wardrobe under the scene: tabs «Обычные / Живые / Комнаты» and a ribbon of cards; one tap
 * on a card wears it. Arrows move between cards.
 */
export function HeroRibbon<T extends string>({
  label,
  tabs,
  tab,
  onTabChange,
  listLabel,
  cards,
  onChoose,
  disabled = false,
  empty,
}: HeroRibbonProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0 || cards.length === 0) return;
    event.preventDefault();
    refs.current[(index + delta + cards.length) % cards.length]?.focus();
  };
  return (
    <div className="qc-ribbon-wardrobe">
      <Tabs label={label} items={tabs} value={tab} onChange={onTabChange}>
        {cards.length === 0 ? (
          <div className="qc-ribbon-empty">{empty}</div>
        ) : (
          <ul className="qc-ribbon" aria-label={listLabel}>
            {cards.map((card, index) => (
              <li key={card.id} className="qc-ribbon-item" data-wide={card.wide || undefined}>
                <button
                  ref={(el) => {
                    refs.current[index] = el;
                  }}
                  type="button"
                  className="qc-ribbon-card"
                  data-live={card.live || undefined}
                  aria-pressed={card.current ?? false}
                  aria-label={card.label}
                  disabled={disabled}
                  onClick={() => onChoose(card.id)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                >
                  <span className="qc-ribbon-picture" aria-hidden="true">
                    {card.picture}
                  </span>
                  <span className="qc-ribbon-title" aria-hidden="true">
                    {card.title}
                  </span>
                  {card.current ? (
                    <span className="qc-ribbon-mark" data-kind="current" aria-hidden="true">
                      <Check />
                    </span>
                  ) : card.live ? (
                    <span className="qc-ribbon-mark" data-kind="live" aria-hidden="true">
                      <Play />
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Tabs>
    </div>
  );
}
