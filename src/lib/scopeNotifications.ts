import type { Deal, MeContext, Notification, Proposal, User } from "@/types";

/**
 * Super admin sees every notification.
 * Everyone else only sees notifications scoped to them:
 * - `userId` matches current user, or
 * - legacy rows without `userId` whose entity they own / `to` matches their email or id.
 */
export function scopeNotificationsForUser(
  me: MeContext,
  notifications: Notification[],
  opts?: {
    proposals?: Proposal[];
    deals?: Deal[];
    users?: User[];
  },
): Notification[] {
  if (me.role === "super_admin") return notifications;

  const proposals = opts?.proposals ?? [];
  const deals = opts?.deals ?? [];
  const meUser = opts?.users?.find((u) => u.id === me.id);
  const email = (meUser?.email || "").trim().toLowerCase();

  const ownedEntityIds = new Set<string>();
  for (const p of proposals) {
    if (p.assignedTo === me.id) ownedEntityIds.add(p.id);
  }
  for (const d of deals) {
    if (d.ownerUserId === me.id) ownedEntityIds.add(d.id);
  }

  return notifications.filter((n) => {
    const scopedTo = (n.userId || "").trim();
    if (scopedTo) return scopedTo === me.id;

    if (email && (n.to || "").trim().toLowerCase() === email) return true;
    if (n.to === me.id) return true;
    if (n.entityId && ownedEntityIds.has(n.entityId)) return true;
    return false;
  });
}
