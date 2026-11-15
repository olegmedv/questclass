// «Мои желания» (spec/02 §2.6): bought tickets with «Хочу использовать» and the history of what
// the parent handed out. The shop opens it right after a ticket is bought.
import { Heading, Stack, Text } from '@questclass/ui';
import { WishInventory } from '../../features/shop/WishInventory';

export function Wishes() {
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Heading level={1} size="xl">
          Мои желания
        </Heading>
        <Text tone="muted">Купленные желания и история полученных подарков.</Text>
      </Stack>
      <WishInventory />
    </Stack>
  );
}
