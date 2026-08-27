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

/** Prefer executive/user display name over raw email for notification UI. */
export function notificationAudienceLabel(
  n: Notification,
  opts: {
    users: User[];
    proposals?: Proposal[];
    deals?: Deal[];
  },
): string {
  const users = opts.users ?? [];
  const uid = (n.userId || "").trim();
  if (uid) {
    const byId = users.find((u) => u.id === uid);
    if (byId?.name?.trim()) return byId.name.trim();
  }

  const to = (n.to || "").trim();
  if (to) {
    const byEmail = users.find((u) => (u.email || "").trim().toLowerCase() === to.toLowerCase());
    if (byEmail?.name?.trim()) return byEmail.name.trim();
    const byId = users.find((u) => u.id === to);
    if (byId?.name?.trim()) return byId.name.trim();
  }

  const proposal = opts.proposals?.find((p) => p.id === n.entityId);
  if (proposal?.assignedToName?.trim()) return proposal.assignedToName.trim();
  if (proposal?.assignedTo) {
    const owner = users.find((u) => u.id === proposal.assignedTo);
    if (owner?.name?.trim()) return owner.name.trim();
  }

  const deal = opts.deals?.find((d) => d.id === n.entityId);
  if (deal?.ownerUserId) {
    const owner = users.find((u) => u.id === deal.ownerUserId);
    if (owner?.name?.trim()) return owner.name.trim();
  }

  // Generic system addresses — don't present as a person
  if (/@(buildesk\.com|example\.com)$/i.test(to) || to === "system") {
    return "System";
  }

  return to || "—";
}
