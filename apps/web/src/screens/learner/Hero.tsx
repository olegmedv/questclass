// «Герой» — the fitting room (spec/02 §2.8): the 3:2 room with the hero on its foot point, the
// wardrobe «Обычные / Живые / Комнаты» where one tap wears a look or puts up a room, the dressing
// puff, and «Настройки героя».
import type { CharacterDto, OwnedItemDto } from '@questclass/shared/character/dto';
import {
  AnimatedHero,
  Button,
  ButtonLink,
  EmptyState,
  FittingRoom,
  HeroRibbon,
  HeroScene,
  House,
  IconButton,
  Inline,
  Notice,
  Play,
  Settings,
  Shirt,
  ShoppingBag,
  Skeleton,
  Spinner,
  SpriteImage,
  Square,
  Text,
  usePrefersReducedMotion,
  useToast,
  type RibbonCard,
  type TabItem,
} from '@questclass/ui';
import { useRef, useState } from 'react';
import { useHeroAnimation } from '../../features/animation/AnimationManager';
import { HeroSettings, useHeroPreferences } from '../../features/character/HeroSettings';
import {
  lookArt,
  roomOf,
  useCharacter,
  useDressing,
  useEquipLook,
  useEquipRoom,
} from '../../features/character/useCharacter';

type WardrobeTab = 'ordinary' | 'live' | 'rooms';

const TABS: readonly TabItem<WardrobeTab>[] = [
  { id: 'ordinary', label: 'Обычные', icon: <Shirt aria-hidden="true" /> },
  { id: 'live', label: 'Живые', icon: <Play aria-hidden="true" /> },
  { id: 'rooms', label: 'Комнаты', icon: <House aria-hidden="true" /> },
];

const LIST_LABELS: Record<WardrobeTab, string> = {
  ordinary: 'Твои обычные персонажи',
  live: 'Твои живые персонажи',
  rooms: 'Мои комнаты',
};

const isLive = (look: OwnedItemDto) => Boolean(look.animation);

function lookCard(look: OwnedItemDto, worn: boolean): RibbonCard {
  const art = lookArt(look);
  const live = isLive(look);
  return {
    id: String(look.itemId),
    title: look.title,
    picture: art ? <SpriteImage src={art.poster} sprite={art.sprite} alt="" /> : null,
    current: worn,
    live,
    label: `${look.title}${live ? ', живой' : ''}${worn ? ', надет' : ''}`,
  };
}

function roomCard(room: OwnedItemDto, chosen: boolean): RibbonCard {
  const art = roomOf(room);
  return {
    id: String(room.itemId),
    title: room.title,
    picture: art ? <SpriteImage src={art.thumb} alt="" /> : null,
    wide: true,
    current: chosen,
    live: room.animated,
    label: `${room.title}${room.animated ? ', анимированный фон' : ''}${chosen ? ', выбрана' : ''}`,
  };
}

const message = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function Fitting({ character }: { readonly character: CharacterDto }) {
  const prefs = useHeroPreferences();
  const reduced = usePrefersReducedMotion();
  const toast = useToast();
  const equipLook = useEquipLook();
  const equipRoom = useEquipRoom();
  const [tab, setTab] = useState<WardrobeTab>(() =>
    character.look && isLive(character.look) ? 'live' : 'ordinary',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dressing = useDressing(character.look, { motion: prefs.characterMotion && !reduced });
  const shown = dressing.shown;
  const art = shown ? lookArt(shown) : null;
  const room = roomOf(character.room);
  const idle = dressing.phase === 'idle';

  const heroRef = useRef<HTMLElement>(null);
  const playback = useHeroAnimation(
    heroRef,
    prefs.characterMotion ? 'autoplay' : 'on-demand',
    Boolean(art?.live) && idle && !settingsOpen,
  );

  const busy = !idle || equipRoom.isPending;
  const wear = (itemId: number) => {
    if (busy || itemId === character.look?.itemId) return;
    setError(null);
    dressing
      .dress(() => equipLook.mutateAsync(itemId))
      .then(() => toast.show('Персонаж надет!', { tone: 'success' }))
      .catch((failure: unknown) =>
        setError(message(failure, 'Не получилось переодеться. Попробуй ещё раз.')),
      );
  };
  const chooseRoom = (itemId: number) => {
    if (busy || itemId === character.room?.itemId) return;
    setError(null);
    equipRoom.mutate(itemId, {
      onSuccess: () => toast.show('Комната выбрана!', { tone: 'success' }),
      onError: (failure) =>
        setError(message(failure, 'Не получилось выбрать комнату. Попробуй ещё раз.')),
    });
  };

  const looks = character.looks.filter((look) => isLive(look) === (tab === 'live'));
  const cards =
    tab === 'rooms'
      ? character.rooms.map((r) => roomCard(r, r.itemId === character.room?.itemId))
      : looks.map((look) => lookCard(look, look.itemId === character.look?.itemId));

  let status = null;
  if (equipRoom.isPending) status = 'Сохраняем комнату…';
  else if (dressing.phase === 'saving') status = 'Сохраняем костюм…';
  else if (!idle) status = 'Переодеваемся…';

  return (
    <>
      <FittingRoom
        title="Примерка"
        tools={
          <>
            {art?.live && (
              <IconButton
                label={playback.playing ? 'Остановить героя' : 'Оживить героя'}
                icon={playback.playing ? <Square /> : <Play />}
                pressed={playback.playing}
                disabled={!idle}
                onClick={playback.toggle}
              />
            )}
            <IconButton
              label="Настройки героя"
              icon={<Settings />}
              disabled={busy}
              onClick={() => setSettingsOpen(true)}
            />
          </>
        }
        scene={
          <HeroScene
            room={room}
            footOffset={art?.footOffset}
            phase={dressing.phase}
            hero={
              art && (
                <AnimatedHero
                  ref={heroRef}
                  poster={art.poster}
                  sprite={art.sprite}
                  src={art.src}
                  motion={art.motion}
                  alt={art.alt}
                  playing={playback.playing}
                  onLoaded={playback.onLoaded}
                  onError={playback.onError}
                />
              )
            }
          />
        }
        caption={tab === 'rooms' ? character.room?.title : shown?.title}
        wardrobe={
          <HeroRibbon
            label="Персонажи и комнаты"
            tabs={TABS}
            tab={tab}
            onTabChange={(next) => {
              setTab(next);
              setError(null);
            }}
            listLabel={LIST_LABELS[tab]}
            cards={cards}
            disabled={busy}
            onChoose={(id) => (tab === 'rooms' ? chooseRoom(Number(id)) : wear(Number(id)))}
            empty={
              <>
                <Text>Живые скины можно получить в магазине.</Text>
                <ButtonLink href="/shop" size="sm" icon={<ShoppingBag aria-hidden="true" />}>
                  В магазин
                </ButtonLink>
              </>
            }
          />
        }
        status={
          <>
            {error && <Notice tone="danger">{error}</Notice>}
            {status && (
              <Inline gap="sm">
                <Spinner size="sm" label="" />
                <Text size="sm" role="status">
                  {status}
                </Text>
              </Inline>
            )}
          </>
        }
      />
      {settingsOpen && (
        <HeroSettings open onClose={() => setSettingsOpen(false)} character={character} />
      )}
    </>
  );
}

export function Hero() {
  const character = useCharacter();
  if (character.isError) {
    return (
      <EmptyState
        headingLevel={1}
        tone="error"
        title="Не получилось открыть примерочную"
        description={character.error.message}
        actions={
          <Button variant="primary" onClick={() => void character.refetch()}>
            Повторить
          </Button>
        }
      />
    );
  }
  if (!character.data) {
    return (
      <FittingRoom
        title="Примерка"
        scene={<HeroScene room={null} />}
        wardrobe={<Skeleton lines={3} />}
      />
    );
  }
  return <Fitting character={character.data} />;
}
