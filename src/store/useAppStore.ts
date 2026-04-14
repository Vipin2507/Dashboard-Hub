import { create } from 'zustand';
import { triggerAutomation } from '@/lib/automationService';
import type {
  Role,
  MeContext,
  Region,
  Team,
  User,
  Customer,
  CustomerContact,
  CustomerNote,
  CustomerSupportTicket,
  CustomerActivityLog,
  CustomerPayment,
  CustomerInvoice,
  CustomerProductLine,
  Proposal,
  ProposalLineItem,
  Deal,
  Notification,
  InventoryItem,
  AutomationTemplate,
  AutomationLog,
  AutomationSettings,
} from '@/types';
import {
  seedRegions,
  seedTeams,
  seedUsers,
  seedCustomers,
  seedProposals,
  seedDeals,
  seedNotifications,
  seedInventoryItems,
  seedAutomationTemplates,
} from '@/lib/seed';
import { apiUrl } from '@/lib/api';

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

  // Automation
  automationTemplates: AutomationTemplate[];
  automationLogs: AutomationLog[];
  automationSettings: AutomationSettings;

  // Auth & user management
  setRegions: (regions: Region[]) => void;
  setTeams: (teams: Team[]) => void;
  setUsers: (users: User[]) => void;
  setNotifications: (notifications: Notification[]) => void;
  login: (email: string, password: string) => void;
  logout: () => void;
  registerUser: (payload: { name: string; email: string; password: string; role: Role; teamId: string; regionId: string }) => void;
  updateUserRole: (userId: string, role: Role) => void;
  updateUserStatus: (userId: string, status: User['status']) => void;
  updatePassword: (userId: string, oldPassword: string | null, newPassword: string) => void;

  // Customers
  setCustomers: (customers: Customer[]) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addContact: (customerId: string, contact: CustomerContact) => void;
  updateContact: (customerId: string, contactId: string, updates: Partial<CustomerContact>) => void;
  deleteContact: (customerId: string, contactId: string) => void;
  setPrimaryContact: (customerId: string, contactId: string) => void;
  addNote: (customerId: string, note: CustomerNote) => void;
  updateNote: (customerId: string, noteId: string, content: string) => void;
  deleteNote: (customerId: string, noteId: string) => void;
  addSupportTicket: (customerId: string, ticket: CustomerSupportTicket) => void;
  updateSupportTicket: (customerId: string, ticketId: string, updates: Partial<CustomerSupportTicket>) => void;
  appendActivityLog: (customerId: string, entry: CustomerActivityLog) => void;
  addPayment: (customerId: string, payment: CustomerPayment) => void;
  addInvoice: (customerId: string, invoice: CustomerInvoice) => void;
  updateInvoiceStatus: (customerId: string, invoiceId: string, status: CustomerInvoice['status']) => void;
  addProductLine: (customerId: string, line: CustomerProductLine) => void;

  setDeals: (deals: Deal[]) => void;
  addDeal: (payload: Omit<Deal, 'id' | 'locked'>) => void;
  addDealWithId: (deal: Deal) => void;
  updateDeal: (id: string, updates: Partial<Deal>) => void;
  deleteDeal: (id: string) => void;

  // Inventory
  setInventoryItems: (items: InventoryItem[]) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteInventoryItem: (id: string) => void;

  // Proposals
  setProposals: (proposals: Proposal[]) => void;
  addProposal: (proposal: Proposal) => void;
  updateProposal: (id: string, updates: Partial<Proposal>) => void;
  deleteProposal: (id: string) => void;
  submitForApproval: (id: string) => void;
  approveProposal: (id: string, approverId: string) => void;
  rejectProposal: (id: string, approverId: string, reason: string) => void;
  sendProposal: (id: string) => void;
  /** Create deal from approved proposal (API assigns DEAL-… id). */
  createDeal: (proposalId: string) => void;
  createDealFromProposal: (id: string, dealId: string) => void;
  saveNewVersion: (id: string) => void;
  updateProposalFinalValue: (id: string, value: number) => void;

  switchRole: (role: Role) => void;
  switchUser: (userId: string) => void;
  resetDemo: () => void;
  pushNotification: (n: Omit<Notification, 'id' | 'at'>) => void;

  // Automation actions
  setAutomationTemplates: (items: AutomationTemplate[]) => void;
  setAutomationLogs: (items: AutomationLog[]) => void;
  setAutomationSettings: (settings: AutomationSettings) => void;
  addAutomationTemplate: (t: AutomationTemplate) => void;
  updateAutomationTemplate: (id: string, updates: Partial<AutomationTemplate>) => void;
  deleteAutomationTemplate: (id: string) => void;
  toggleAutomationTemplate: (id: string) => void;
  appendAutomationLog: (log: AutomationLog) => void;
  updateAutomationSettings: (settings: Partial<AutomationSettings>) => void;
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

const initialUser = seedUsers.find(u => u.id === 'u2')!;

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

    automationTemplates: structuredClone(seedAutomationTemplates),
    automationLogs: [],
    automationSettings: {
      n8nWebhookBase: 'http://72.60.200.185:5678/webhook',
      wahaApiUrl: 'http://72.60.200.185:3000',
      wahaApiKey: 'MySecretWAHAKey',
      wahaSession: 'first',
      wahaFromNumber: '',
      emailFromAddress: 'noreply@buildesk.in',
      emailFromName: 'Buildesk CRM',
      isWahaConnected: false,
      isN8nConnected: false,
    },
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  ...getInitialState(),

  setRegions: (regions) => set({ regions }),
  setTeams: (teams) => set({ teams }),
  setUsers: (users) => set({ users }),
  setNotifications: (notifications) => set({ notifications }),

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
    void fetch(apiUrl('/api/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    }).catch(() => undefined);
  },

  updateUserRole: (userId, role) => {
    set(s => ({
      users: s.users.map(u => (u.id === userId ? { ...u, role } : u)),
      me: s.me.id === userId ? { ...s.me, role } : s.me,
    }));
    const user = get().users.find(u => u.id === userId);
    if (user) {
      void fetch(apiUrl(`/api/users/${userId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      }).catch(() => undefined);
    }
  },

  updateUserStatus: (userId, status) => {
    set(s => ({
      users: s.users.map(u => (u.id === userId ? { ...u, status } : u)),
    }));
    const user = get().users.find(u => u.id === userId);
    if (user) {
      void fetch(apiUrl(`/api/users/${userId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      }).catch(() => undefined);
    }
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
    const user = get().users.find(u => u.id === userId);
    if (user) {
      void fetch(apiUrl(`/api/users/${userId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      }).catch(() => undefined);
    }
  },

  setCustomers: (customers) => {
    set({ customers });
  },

  addCustomer: (customer) => {
    set(s => ({ customers: [customer, ...s.customers] }));
  },

  updateCustomer: (id, updates) => {
    const now = new Date().toISOString();
    set(s => ({
      customers: s.customers.map(c =>
        c.id === id ? { ...c, ...updates, updatedAt: now } : c
      ),
    }));
  },

  deleteCustomer: (id) => {
    set(s => ({ customers: s.customers.filter(c => c.id !== id) }));
  },

  addContact: (customerId, contact) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, contacts: [...c.contacts, contact] } : c
      ),
    }));
  },

  updateContact: (customerId, contactId, updates) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId
          ? { ...c, contacts: c.contacts.map(co => (co.id === contactId ? { ...co, ...updates } : co)) }
          : c
      ),
    }));
  },

  deleteContact: (customerId, contactId) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, contacts: c.contacts.filter(co => co.id !== contactId) } : c
      ),
    }));
  },

  setPrimaryContact: (customerId, contactId) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId
          ? { ...c, contacts: c.contacts.map(co => ({ ...co, isPrimary: co.id === contactId })) }
          : c
      ),
    }));
  },

  addNote: (customerId, note) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, notes: [note, ...c.notes] } : c
      ),
    }));
  },

  updateNote: (customerId, noteId, content) => {
    const now = new Date().toISOString();
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId
          ? { ...c, notes: c.notes.map(n => (n.id === noteId ? { ...n, content, updatedAt: now } : n)) }
          : c
      ),
    }));
  },

  deleteNote: (customerId, noteId) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, notes: c.notes.filter(n => n.id !== noteId) } : c
      ),
    }));
  },

  addSupportTicket: (customerId, ticket) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, supportTickets: [ticket, ...c.supportTickets] } : c
      ),
    }));
  },

  updateSupportTicket: (customerId, ticketId, updates) => {
    const now = new Date().toISOString();
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId
          ? {
              ...c,
              supportTickets: c.supportTickets.map(t =>
                t.id === ticketId ? { ...t, ...updates, updatedAt: now } : t
              ),
            }
          : c
      ),
    }));
  },

  appendActivityLog: (customerId, entry) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, activityLog: [entry, ...c.activityLog] } : c
      ),
    }));
  },

  addPayment: (customerId, payment) => {
    set(s => ({
      customers: s.customers.map(c => {
        if (c.id !== customerId) return c;
        const totalRevenue = c.totalRevenue + payment.amount;
        return { ...c, payments: [payment, ...c.payments], totalRevenue };
      }),
    }));
  },

  addInvoice: (customerId, invoice) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, invoices: [invoice, ...c.invoices] } : c
      ),
    }));
  },

  updateInvoiceStatus: (customerId, invoiceId, status) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId
          ? { ...c, invoices: c.invoices.map(inv => (inv.id === invoiceId ? { ...inv, status } : inv)) }
          : c
      ),
    }));
  },

  addProductLine: (customerId, line) => {
    set(s => ({
      customers: s.customers.map(c =>
        c.id === customerId ? { ...c, productLines: [line, ...c.productLines] } : c
      ),
    }));
  },

  setDeals: (deals) => {
    set({ deals });
  },

  addDeal: (payload) => {
    const me = get().me;
    const body = {
      ...payload,
      locked: false,
      changedByUserId: me.id,
      changedByName: me.name,
      createdByUserId: me.id,
      createdByName: me.name,
      actorRole: me.role,
    };
    void fetch(apiUrl('/api/deals'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((created: Deal | null) => {
        if (created) set(s => ({ deals: [...s.deals, created] }));
      })
      .catch(() => undefined);
  },

  addDealWithId: (deal) => {
    const me = get().me;
    const { id: _clientId, ...rest } = deal;
    void fetch(apiUrl('/api/deals'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        changedByUserId: me.id,
        changedByName: me.name,
        createdByUserId: me.id,
        createdByName: me.name,
        actorRole: me.role,
      }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((created: Deal | null) => {
        if (created) set(s => ({ deals: [...s.deals, created] }));
      })
      .catch(() => undefined);
  },

  updateDeal: (id, updates) => {
    set(s => ({
      deals: s.deals.map(d => (d.id === id ? { ...d, ...updates } : d)),
    }));
    const deal = get().deals.find(d => d.id === id);
    const me = get().me;
    if (deal) {
      void fetch(apiUrl(`/api/deals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...deal,
          actorRole: me.role,
          changedByUserId: me.id,
          changedByName: me.name,
        }),
      }).catch(() => undefined);
    }
  },

  deleteDeal: (id) => {
    const me = get().me;
    void fetch(apiUrl(`/api/deals/${id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorRole: me.role,
        deletedByUserId: me.id,
        deletedByName: me.name,
      }),
    }).catch(() => undefined);
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

  setProposals: (proposals) => {
    set({ proposals });
  },

  addProposal: (proposal) => {
    set(s => ({ proposals: [proposal, ...s.proposals] }));
    const me = get().me;
    const customer = get().customers.find(c => c.id === proposal.customerId);
    if (customer) {
      get().updateCustomer(proposal.customerId, {
        activeProposalsCount: customer.activeProposalsCount + 1,
      });
      get().appendActivityLog(proposal.customerId, {
        id: 'cal-' + makeId(),
        action: 'Proposal created',
        description: `Proposal ${proposal.proposalNumber} created: ${proposal.title}.`,
        performedBy: me.id,
        performedByName: me.name,
        timestamp: new Date().toISOString(),
        entityType: 'proposal',
        entityId: proposal.id,
      });
    }
    void fetch(apiUrl('/api/proposals'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proposal),
    }).catch(() => undefined);
  },

  updateProposal: (id, updates) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, ...updates, updatedAt: now } : p
      ),
    }));
    const proposal = get().proposals.find(p => p.id === id);
    if (proposal) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal),
      }).catch(() => undefined);
    }
  },

  deleteProposal: (id) => {
    set(s => ({ proposals: s.proposals.filter(p => p.id !== id) }));
    void fetch(apiUrl(`/api/proposals/${id}`), {
      method: 'DELETE',
    }).catch(() => undefined);
  },

  submitForApproval: (id) => {
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'approval_pending' as const, updatedAt: new Date().toISOString() } : p
      ),
    }));
    const proposal = get().proposals.find(p => p.id === id);
    if (proposal) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal),
      }).catch(() => undefined);
    }
    get().pushNotification({ type: 'INTERNAL_EMAIL', to: 'manager@buildesk.com', subject: 'Proposal submitted for approval', entityId: id });
  },

  approveProposal: (id, approverId) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'approved' as const, approvedBy: approverId, approvedAt: now, updatedAt: now } : p
      ),
    }));
    const proposalPersist = get().proposals.find(p => p.id === id);
    if (proposalPersist) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalPersist),
      }).catch(() => undefined);
    }
    get().pushNotification({ type: 'INTERNAL_EMAIL', to: 'admin@buildesk.com', subject: 'Proposal approved', entityId: id });

    const proposal = get().proposals.find(p => p.id === id);
    const customer = proposal ? get().customers.find(c => c.id === proposal.customerId) : null;
    const primaryContact = customer?.contacts?.find((c) => c.isPrimary) ?? customer?.contacts?.[0];
    const rep = proposal ? get().users.find(u => u.id === proposal.assignedTo) : null;
    const approver = get().users.find(u => u.id === approverId);
    void triggerAutomation('proposal_approved', {
      proposalId: proposal?.id,
      proposalNumber: proposal?.proposalNumber,
      proposalTitle: proposal?.title,
      grandTotal: proposal?.finalQuoteValue ?? proposal?.grandTotal,
      customerId: customer?.id,
      customerName: customer?.companyName,
      approvedBy: approver?.name ?? '',
      salesRepId: rep?.id,
      salesRepName: rep?.name,
      salesRepPhone: (rep as { phone?: string } | null)?.phone,
    });
    void triggerAutomation('proposal_approved_customer_notify', {
      proposalId: proposal?.id,
      proposalNumber: proposal?.proposalNumber,
      proposalTitle: proposal?.title,
      grandTotal: proposal?.finalQuoteValue ?? proposal?.grandTotal,
      customerId: customer?.id,
      customerName: customer?.companyName,
      customerPhone: primaryContact?.phone,
      customerEmail: primaryContact?.email,
      approvedBy: approver?.name ?? '',
      salesRepId: rep?.id,
      salesRepName: rep?.name,
      salesRepPhone: (rep as { phone?: string } | null)?.phone,
      companyName: 'Cravingcode Technologies Pvt. Ltd.',
    });
  },

  rejectProposal: (id, approverId, reason) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'rejected' as const, rejectionReason: reason, updatedAt: now } : p
      ),
    }));
    const proposalPersist = get().proposals.find(p => p.id === id);
    if (proposalPersist) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalPersist),
      }).catch(() => undefined);
    }
    get().pushNotification({ type: 'INTERNAL_EMAIL', to: 'admin@buildesk.com', subject: 'Proposal rejected', entityId: id });

    const proposal = get().proposals.find(p => p.id === id);
    const customer = proposal ? get().customers.find(c => c.id === proposal.customerId) : null;
    const rep = proposal ? get().users.find(u => u.id === proposal.assignedTo) : null;
    void triggerAutomation('proposal_rejected', {
      proposalId: proposal?.id,
      proposalNumber: proposal?.proposalNumber,
      proposalTitle: proposal?.title,
      customerId: customer?.id,
      customerName: customer?.companyName,
      rejectionReason: reason,
      salesRepId: rep?.id,
      salesRepName: rep?.name,
      salesRepPhone: (rep as { phone?: string } | null)?.phone,
    });
  },

  sendProposal: (id) => {
    const now = new Date().toISOString();
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'sent' as const, sentAt: now, updatedAt: now } : p
      ),
    }));
    const proposalPersist = get().proposals.find(p => p.id === id);
    if (proposalPersist) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalPersist),
      }).catch(() => undefined);
    }
    const proposal = get().proposals.find(p => p.id === id);
    const customer = proposal ? get().customers.find(c => c.id === proposal.customerId) : null;
    const primaryContact = customer?.contacts?.find(c => c.isPrimary) ?? customer?.contacts?.[0];
    const to = primaryContact?.email ?? 'customer@example.com';
    get().pushNotification({ type: 'CUSTOMER_EMAIL', to, subject: `Proposal ${proposal?.proposalNumber ?? id} sent`, entityId: id });

    const rep = proposal ? get().users.find(u => u.id === proposal.assignedTo) : null;
    void triggerAutomation('proposal_sent', {
      proposalId: proposal?.id,
      proposalNumber: proposal?.proposalNumber,
      proposalTitle: proposal?.title,
      grandTotal: proposal?.finalQuoteValue ?? proposal?.grandTotal,
      validUntil: proposal?.validUntil,
      customerId: customer?.id,
      customerName: customer?.companyName,
      customerPhone: primaryContact?.phone,
      customerEmail: primaryContact?.email,
      salesRepId: rep?.id,
      salesRepName: rep?.name,
      salesRepPhone: (rep as { phone?: string } | null)?.phone,
      companyName: 'Cravingcode Technologies Pvt. Ltd.',
    });
  },

  createDeal: (proposalId) => {
    const proposal = get().proposals.find(p => p.id === proposalId);
    const me = get().me;
    if (!proposal || proposal.dealId) return;
    const value = proposal.finalQuoteValue ?? proposal.grandTotal ?? 0;
    if (!Number.isFinite(value) || value <= 0) return;
    const body = {
      name: `Deal — ${proposal.title}`,
      customerId: proposal.customerId,
      ownerUserId: proposal.assignedTo,
      teamId: proposal.teamId,
      regionId: proposal.regionId,
      stage: 'Qualified',
      value,
      locked: true,
      proposalId,
      dealStatus: 'Active',
      dealSource: 'Direct',
      expectedCloseDate: null,
      priority: 'Medium',
      nextFollowUpDate: null,
      lossReason: null,
      changedByUserId: me.id,
      changedByName: me.name,
      createdByUserId: me.id,
      createdByName: me.name,
      actorRole: me.role,
    };
    void fetch(apiUrl('/api/deals'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((created: Deal | null) => {
        if (!created) return;
        set(s => ({ deals: [...s.deals, created] }));
        get().createDealFromProposal(proposalId, created.id);
      })
      .catch(() => undefined);
  },

  createDealFromProposal: (id, dealId) => {
    const proposal = get().proposals.find(p => p.id === id);
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, status: 'deal_created' as const, dealId, updatedAt: new Date().toISOString() } : p
      ),
    }));
    const proposalPersist = get().proposals.find(p => p.id === id);
    if (proposalPersist) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalPersist),
      }).catch(() => undefined);
    }
    if (proposal?.customerId) {
      const customer = get().customers.find(c => c.id === proposal.customerId);
      if (customer) {
        get().updateCustomer(proposal.customerId, {
          activeProposalsCount: Math.max(0, customer.activeProposalsCount - 1),
          activeDealsCount: customer.activeDealsCount + 1,
        });
        const deal = get().deals.find(d => d.id === dealId);
        const purchasedAt = new Date().toISOString().slice(0, 10);
        const invItems = get().inventoryItems;
        proposal.lineItems.forEach((li: ProposalLineItem) => {
          const inv = invItems.find((x) => x.id === li.inventoryItemId);
          get().addProductLine(proposal.customerId, {
            id: 'cpl-' + makeId(),
            inventoryItemId: li.inventoryItemId,
            itemName: li.name,
            sku: li.sku,
            itemType: inv?.itemType ?? 'product',
            qty: li.qty,
            unitPrice: li.unitPrice,
            taxRate: li.taxRate,
            purchasedAt,
            status: 'active',
            dealId,
          });
        });
        get().appendActivityLog(proposal.customerId, {
          id: 'cal-' + makeId(),
          action: 'Deal closed',
          description: `Deal created from proposal ${proposal.proposalNumber}. Value ₹${(proposal.finalQuoteValue ?? proposal.grandTotal).toLocaleString('en-IN')}.`,
          performedBy: get().me.id,
          performedByName: get().me.name,
          timestamp: new Date().toISOString(),
          entityType: 'deal',
          entityId: dealId,
        });

        const rep = get().users.find(u => u.id === proposal.assignedTo);
        void triggerAutomation('deal_created', {
          dealId,
          dealTitle: deal?.name ?? proposal.title,
          dealValue: deal?.value ?? (proposal.finalQuoteValue ?? proposal.grandTotal),
          customerId: customer.id,
          customerName: customer.companyName,
          salesRepId: rep?.id,
          salesRepName: rep?.name,
          salesRepPhone: (rep as { phone?: string } | null)?.phone,
          companyName: 'Cravingcode Technologies Pvt. Ltd.',
        });
      }
    }
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
        setupDeploymentCharges: Number((p as unknown as { setupDeploymentCharges?: number }).setupDeploymentCharges) || 0,
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
    const proposalPersist = get().proposals.find(p => p.id === id);
    if (proposalPersist) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalPersist),
      }).catch(() => undefined);
    }
  },

  updateProposalFinalValue: (id, value) => {
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === id ? { ...p, finalQuoteValue: value, updatedAt: new Date().toISOString() } : p
      ),
    }));
    const proposal = get().proposals.find(p => p.id === id);
    if (proposal) {
      void fetch(apiUrl(`/api/proposals/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposal),
      }).catch(() => undefined);
    }
  },

  switchRole: (role) => {
    const user = getUserForRole(role, get().users);
    set({ me: meFromUser(user) });
  },

  switchUser: (userId) => {
    const user = get().users.find((u) => u.id === userId);
    if (!user) return;
    set({ me: meFromUser(user) });
  },

  resetDemo: () => {
    set(getInitialState());
  },

  pushNotification: (n) => {
    const notif: Notification = { ...n, id: makeId(), at: new Date().toISOString() };
    set(s => ({ notifications: [notif, ...s.notifications] }));
    void fetch(apiUrl('/api/notifications'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notif),
    }).catch(() => undefined);
  },

  // ─── Automation ──────────────────────────────────────────────────────────
  setAutomationTemplates: (items) => {
    set({ automationTemplates: items });
  },

  setAutomationLogs: (items) => {
    set({ automationLogs: items });
  },

  setAutomationSettings: (settings) => {
    set({ automationSettings: settings });
  },

  addAutomationTemplate: (t) => {
    set(s => ({ automationTemplates: [t, ...s.automationTemplates] }));
    void fetch(apiUrl('/api/automation/templates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }).catch(() => undefined);
  },

  updateAutomationTemplate: (id, updates) => {
    const now = new Date().toISOString();
    set(s => ({
      automationTemplates: s.automationTemplates.map(t =>
        t.id === id ? { ...t, ...updates, updatedAt: now } : t
      ),
    }));
    const template = get().automationTemplates.find(t => t.id === id);
    if (template) {
      void fetch(apiUrl(`/api/automation/templates/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      }).catch(() => undefined);
    }
  },

  deleteAutomationTemplate: (id) => {
    set(s => ({ automationTemplates: s.automationTemplates.filter(t => t.id !== id) }));
    void fetch(apiUrl(`/api/automation/templates/${id}`), { method: 'DELETE' }).catch(() => undefined);
  },

  toggleAutomationTemplate: (id) => {
    const now = new Date().toISOString();
    set(s => ({
      automationTemplates: s.automationTemplates.map(t =>
        t.id === id ? { ...t, isActive: !t.isActive, updatedAt: now } : t
      ),
    }));
    const template = get().automationTemplates.find(t => t.id === id);
    if (template) {
      void fetch(apiUrl(`/api/automation/templates/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      }).catch(() => undefined);
    }
  },

  appendAutomationLog: (log) => {
    set(s => ({ automationLogs: [log, ...s.automationLogs] }));
    void fetch(apiUrl('/api/automation/logs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log),
    }).catch(() => undefined);
  },

  updateAutomationSettings: (settings) => {
    set(s => ({ automationSettings: { ...s.automationSettings, ...settings } }));
    const merged = get().automationSettings;
    void fetch(apiUrl('/api/automation/settings'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    }).catch(() => undefined);
  },

}));
