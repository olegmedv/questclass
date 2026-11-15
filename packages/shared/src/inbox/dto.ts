/**
 * «Что нужно сделать?» — the admin home (`GET /api/admin/inbox`): how much waits in every queue
 * of the parent. Read-only counters; each queue has its own screen.
 */
export interface AdminInboxDto {
  /** Chores reported «Я сделал», waiting for approval. */
  readonly choreReviews: number;
  /** Learners asking for another try at a failed test. */
  readonly retryRequests: number;
  /** Wish and Robux tickets the learners asked to use («Хочу использовать»). */
  readonly wishRequests: number;
  /** Robux in those requests (what is left to hand out). */
  readonly robuxRequested: number;
  /** Import revisions of published lessons waiting for «Принять» / «Отклонить». */
  readonly importRevisions: number;
  /** Lessons in «подтверждает родитель» mode whose video a learner opened. */
  readonly watchConfirmations: number;
}
