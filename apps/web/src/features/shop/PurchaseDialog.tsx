// «Забираем персонажа?»: the confirmation of a purchase with the big picture, the description and
// «Потратишь N монет. Останется M.». The request id is created when the dialog opens, so a
// repeated tap or a retry after a lost answer returns the same purchase.
import type { PurchaseOutcomeDto, ShopItemDto } from '@questclass/shared/shop/dto';
import { Button, Modal, Notice, ShopPreview, Stack, Text } from '@questclass/ui';
import { isApiError } from '../../api/client';
import { confirmTitle, spendText } from './model';
import { usePurchase } from './queries';
import { ShopItemMedia } from './ShopItemMedia';

export interface PurchaseIntent {
  readonly item: ShopItemDto;
  readonly requestId: string;
}

export interface PurchaseDialogProps {
  readonly intent: PurchaseIntent | null;
  readonly coins: number;
  readonly onClose: () => void;
  readonly onBought: (outcome: PurchaseOutcomeDto, item: ShopItemDto) => void;
}

export function PurchaseDialog({ intent, coins, onClose, onBought }: PurchaseDialogProps) {
  const purchase = usePurchase();
  const item = intent?.item ?? null;
  // A refusal (changed item, not enough coins…) needs a fresh shop; a lost connection may retry.
  const refused = isApiError(purchase.error) && purchase.error.status === 409;
  const close = () => {
    if (purchase.isPending) return;
    purchase.reset();
    onClose();
  };
  const confirm = () => {
    if (!intent) return;
    purchase.mutate(
      { itemId: intent.item.id, version: intent.item.version, requestId: intent.requestId },
      {
        onSuccess: (outcome) => {
          purchase.reset();
          onBought(outcome, intent.item);
        },
      },
    );
  };
  return (
    <Modal
      open={item !== null}
      onClose={close}
      dismissible={!purchase.isPending}
      title={item ? confirmTitle(item) : ''}
      footer={
        item && (
          <>
            <Button
              variant="primary"
              loading={purchase.isPending}
              disabled={refused}
              onClick={confirm}
            >
              Подтвердить покупку
            </Button>
            <Button onClick={close} disabled={purchase.isPending}>
              Пока не покупать
            </Button>
          </>
        )
      }
    >
      {item && (
        <Stack gap="md">
          <ShopPreview shape={item.kind === 'room' ? 'wide' : 'square'}>
            <ShopItemMedia item={item} controls={false} />
          </ShopPreview>
          <Text weight="bold" size="lg">
            {item.title}
          </Text>
          {item.description && <Text tone="muted">{item.description}</Text>}
          <Text>{spendText(item.price, coins)}</Text>
          {purchase.isError && <Notice tone="danger">{purchase.error.message}</Notice>}
        </Stack>
      )}
    </Modal>
  );
}
