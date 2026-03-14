import { create } from 'zustand';
import type { Role, MeContext, Region, Team, User, Customer, Proposal, Deal, Notification, InventoryItem } from '@/types';
import { seedRegions, seedTeams, seedUsers, seedCustomers, seedProposals, seedDeals, seedNotifications, seedInventoryItems } from '@/lib/seed';

interface AppState {
  me: MeContext;
  regions: Region[];
  teams: Team[];
  users: User[];
  customers: Customer[];
  proposals: Proposal[];
  deals: Deal[];
  notifications: Notification[];
  inventoryItems: InventoryItem[];

  // Auth & user management
  login: (email: string, password: string) => void;
  logout: () => void;
  registerUser: (payload: { name: string; email: string; password: string; role: Role; teamId: string; regionId: string }) => void;
  updateUserRole: (userId: string, role: Role) => void;
  updateUserStatus: (userId: string, status: User['status']) => void;
  updatePassword: (userId: string, oldPassword: string | null, newPassword: string) => void;

  // Master data management
  addCustomer: (payload: Omit<Customer, 'id'>) => void;
  bulkAddCustomers: (payloads: Omit<Customer, 'id'>[]) => void;
  addDeal: (payload: Omit<Deal, 'id' | 'locked'>) => void;
  addDealWithId: (deal: Deal) => void;

  // Inventory
  setInventoryItems: (items: InventoryItem[]) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => void;

  // Proposals
  addProposal: (proposal: Proposal) => void;
  updateProposal: (id: string, updates: Partial<Proposal>) => void;
  deleteProposal: (id: string) => void;
  submitForApproval: (id: string) => void;
  approveProposal: (id: string, approverId: string) => void;
  rejectProposal: (id: string, approverId: string, reason: string) => void;
  sendProposal: (id: string) => void;
  createDealFromProposal: (id: string, dealId: string) => void;
  saveNewVersion: (id: string) => void;
  updateProposalFinalValue: (id: string, value: number) => void;

  switchRole: (role: Role) => void;
  resetDemo: () => void;
  pushNotification: (n: Omit<Notification, 'id' | 'at'>) => void;
}

function getUserForRole(role: Role, users: User[]): User {
  return users.find(u => u.role === role) ?? users[0];
}

function meFromUser(u: User): MeContext {
  return { id: u.id, name: u.name, role: u.role, teamId: u.teamId, regionId: u.regionId };
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const initialUser = seedUsers.find(u => u.id === 'u4')!;

function getInitialState() {
  return {
    me: meFromUser(initialUser),
    regions: structuredClone(seedRegions),
    teams: structuredClone(seedTeams),
    users: structuredClone(seedUsers),
    customers: structuredClone(seedCustomers),
    proposals: structuredClone(seedProposals),
    deals: structuredClone(seedDeals),
    notifications: structuredClone(seedNotifications),
    inventoryItems: structuredClone(seedInventoryItems),
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  ...getInitialState(),

  login: (email, password) => {
    const user = get().users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error('User not found');
    }
    if (user.status !== 'active') {
      throw new Error('Account is disabled');
    }
    if (user.password !== password) {
      throw new Error('Invalid password');
    }
    set({ me: meFromUser(user) });
  },

  logout: () => {
    const fallbackUser = seedUsers[0] ?? get().users[0];
    if (fallbackUser) {
      set({ me: meFromUser(fallbackUser) });
    }
  },

  registerUser: ({ name, email, password, role, teamId, regionId }) => {
    const exists = get().users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      throw new Error('Email already registered');
    }
    const id = makeId();
    const user: User = {
      id,
      name,
      email,
      password,
      role,
      teamId,
      regionId,
      status: 'active',
    };
    set(s => ({ users: [...s.users, user] }));
  },

  updateUserRole: (userId, role) => {
    set(s => ({
      users: s.users.map(u => (u.id === userId ? { ...u, role } : u)),
      me: s.me.id === userId ? { ...s.me, role } : s.me,
    }));
  },

  updateUserStatus: (userId, status) => {
    set(s => ({
      users: s.users.map(u => (u.id === userId ? { ...u, status } : u)),
    }));
    const { me } = get();
    if (me.id === userId && status !== 'active') {
      const fallbackUser = seedUsers.find(u => u.status === 'active' && u.id !== userId) ?? seedUsers[0];
      if (fallbackUser) {
        set({ me: meFromUser(fallbackUser) });
      }
    }
  },

  updatePassword: (userId, oldPassword, newPassword) => {
    set(s => {
      const target = s.users.find(u => u.id === userId);
      if (!target) return s;
      if (oldPassword !== null && target.password !== oldPassword) {
        throw new Error('Current password is incorrect');
      }
      return {
        ...s,
        users: s.users.map(u => (u.id === userId ? { ...u, password: newPassword } : u)),
      };
    });
  },

  addCustomer: (payload) => {
    const id = 'c' + makeId();
    const customer: Customer = { id, ...payload };
    set(s => ({ customers: [...s.customers, customer] }));
  },

  bulkAddCustomers: (payloads) => {
    if (payloads.length === 0) return;
    const created: Customer[] = payloads.map(p => ({
      id: 'c' + makeId(),
      ...p,
    }));
    set(s => ({ customers: [...s.customers, ...created] }));
  },

  addDeal: (payload) => {
    const id = 'd' + makeId();
    const deal: Deal = {
      id,
      locked: false,
      ...payload,
    };
    set(s => ({ deals: [...s.deals, deal] }));
  },

  addDealWithId: (deal) => {
    set(s => ({ deals: [...s.deals, deal] }));
  },

  setInventoryItems: (items) => {
    set({ inventoryItems: items });
  },

  addInventoryItem: (item) => {
    const now = new Date().toISOString();
    const id = 'inv' + makeId();
    const newItem: InventoryItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
    };
    set(s => ({ inventoryItems: [newItem, ...s.inventoryItems] }));
  },

  updateInventoryItem: (id, updates) => {
    const now = new Date().toISOString();
    set(s => ({
      inventoryItems: s.inventoryItems.map(it =>
        it.id === id ? { ...it, ...updates, updatedAt: now } : it
      ),
    }));
  },

  deleteInventoryItem: (id) => {
    set(s => ({
      inventoryItems: s.inventoryItems.filter(it => it.id !== id),
    }));
  },

  addProposal: (proposal) => {
    set(s => ({ proposals: [proposal, ...s.proposals] }));
  },

  updateProposal: (id, updates) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, ...updates, updatedAt: now } : p
      ),
    }));
  },

  deleteProposal: (id) => {
    set(s => ({ proposals: s.proposals.filter(p => p.id !== id) }));
  },

  submitForApproval: (id) => {
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'approval_pending' as const, updatedAt: new Date().toISOString() } : p
      ),
    }));
    get().pushNotification({ type: 'INTERNAL_EMAIL', to: 'manager@buildesk.com', subject: 'Proposal submitted for approval', entityId: id });
  },

  approveProposal: (id, approverId) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'approved' as const, approvedBy: approverId, approvedAt: now, updatedAt: now } : p
      ),
    }));
    get().pushNotification({ type: 'INTERNAL_EMAIL', to: 'admin@buildesk.com', subject: 'Proposal approved', entityId: id });
  },

  rejectProposal: (id, approverId, reason) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'rejected' as const, rejectionReason: reason, updatedAt: now } : p
      ),
    }));
    get().pushNotification({ type: 'INTERNAL_EMAIL', to: 'admin@buildesk.com', subject: 'Proposal rejected', entityId: id });
  },

  sendProposal: (id) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'sent' as const, sentAt: now, updatedAt: now } : p
      ),
    }));
    const proposal = get().proposals.find(p => p.id === id);
    const customer = proposal ? get().customers.find(c => c.id === proposal.customerId) : null;
    const to = customer?.email ?? 'customer@example.com';
    get().pushNotification({ type: 'CUSTOMER_EMAIL', to, subject: `Proposal ${proposal?.proposalNumber ?? id} sent`, entityId: id });
  },

  createDealFromProposal: (id, dealId) => {
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'deal_created' as const, dealId, updatedAt: new Date().toISOString() } : p
      ),
    }));
    get().pushNotification({ type: 'INTERNAL_EMAIL', to: 'admin@buildesk.com', subject: 'Deal created from proposal', entityId: id });
  },

  saveNewVersion: (id) => {
    const now = new Date().toISOString();
    const me = get().me;
    set(s => {
      const p = s.proposals.find(x => x.id === id);
      if (!p) return s;
      const newVersion = {
        version: p.currentVersion + 1,
        createdAt: now,
        createdBy: me.id,
        lineItems: p.lineItems,
        subtotal: p.subtotal,
        totalDiscount: p.totalDiscount,
        totalTax: p.totalTax,
        grandTotal: p.grandTotal,
      };
      return {
        proposals: s.proposals.map(prop =>
          prop.id === id
            ? { ...prop, currentVersion: prop.currentVersion + 1, versionHistory: [...prop.versionHistory, newVersion], updatedAt: now }
            : prop
        ),
      };
    });
  },

  updateProposalFinalValue: (id, value) => {
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, finalQuoteValue: value, updatedAt: new Date().toISOString() } : p
      ),
    }));
  },

  switchRole: (role) => {
    const user = getUserForRole(role, get().users);
    set({ me: meFromUser(user) });
  },

  resetDemo: () => {
    set(getInitialState());
  },

  pushNotification: (n) => {
    const notif: Notification = { ...n, id: makeId(), at: new Date().toISOString() };
    set(s => ({ notifications: [notif, ...s.notifications] }));
  },

}));
