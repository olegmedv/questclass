// Query keys of «Оформление»: the shop and the subjects refresh the admin list after a change
// (what an item or a subject shows decides where a built-in file is used).
export const appearanceKeys = {
  current: ['appearance'] as const,
  admin: ['admin', 'appearance'] as const,
};
