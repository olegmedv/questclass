import type { AdminInboxDto } from '@questclass/shared/inbox/dto';
import type { AppContext } from '../../app';

/** The services the inbox reads from: each queue keeps its own rules. */
export type InboxDeps = Pick<AppContext, 'chores' | 'attempts' | 'wishes' | 'imports' | 'watch'>;

/** Counters of the admin's queues. Only reads: no row is written. */
export function adminInbox(deps: InboxDeps): AdminInboxDto {
  const groups = deps.wishes.queue('open').flatMap((learner) => learner.groups);
  const asked = groups.filter((group) => group.status === 'requested');
  return {
    choreReviews: deps.chores.reviews({ status: 'pending' }).length,
    retryRequests: deps.attempts.retryRequests('open').length,
    wishRequests: asked.length,
    robuxRequested: asked
      .filter((group) => group.rewardType === 'robux')
      .reduce((sum, group) => sum + group.remaining, 0),
    importRevisions: deps.imports.listRevisions('pending').length,
    watchConfirmations: deps.watch.pendingConfirmations().length,
  };
}
