/** Reviewer decisions must be scoped to one application form, not the guild-wide module. */
export interface ApplicationReviewPolicy {
  reviewerUserIds: readonly string[];
  reviewerRoleIds: readonly string[];
}
export function mayReviewApplication(
  form: ApplicationReviewPolicy,
  identity: { userId: string; roleIds: readonly string[]; isGuildManager: boolean },
): boolean {
  if (identity.isGuildManager) return true;
  if (form.reviewerUserIds.includes(identity.userId)) return true;
  return identity.roleIds.some(id => form.reviewerRoleIds.includes(id));
}
