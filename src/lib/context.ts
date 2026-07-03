import { getActiveGroupId, getCurrentUser } from "./auth";
import { getGroupsForUser } from "./repo";
import type { GroupWithRole, User } from "./types";

export interface SessionContext {
  user: User | null;
  groups: GroupWithRole[];
  activeGroup: GroupWithRole | null;
}

/**
 * Resolves the signed-in user, their clubs, and the currently active club.
 * Falls back to the first club when no active group cookie is set.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const user = await getCurrentUser();
  if (!user) return { user: null, groups: [], activeGroup: null };

  const groups = getGroupsForUser(user.id);
  const activeId = await getActiveGroupId();
  const activeGroup = groups.find((g) => g.id === activeId) ?? groups[0] ?? null;

  return { user, groups, activeGroup };
}
