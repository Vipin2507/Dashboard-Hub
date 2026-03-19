import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Topbar } from "@/components/Topbar";
import { useAppStore } from "@/store/useAppStore";
import { getScope, visibleWithScope, can, formatINR } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Building2,
  Pencil,
  Plus,
  Phone,
  Trash2,
  MapPin,
  ExternalLink,
  FileText,
  AlertTriangle,
  Upload,
  MessageSquare,
  Activity,
  Ticket,
  IndianRupee,
} from "lucide-react";
import type { Customer, CustomerStatus } from "@/types";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { ProposalDetailSheet } from "@/components/ProposalDetailSheet";
import { generateProposalPdf } from "@/lib/generateProposalPdf";
import { toast } from "@/components/ui/use-toast";

const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  inactive: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  lead: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  churned: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  blacklisted: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const TICKET_PRIORITY_BADGE: Record<string, string> = {
  low: "bg-muted",
  medium: "bg-blue-500/15 text-blue-700",
  high: "bg-orange-500/15 text-orange-700",
  critical: "bg-red-500/15 text-red-700",
};

const TICKET_STATUS_BADGE: Record<string, string> = {
  open: "bg-yellow-500/15 text-yellow-700",
  in_progress: "bg-blue-500/15 text-blue-700",
  resolved: "bg-green-500/15 text-green-700",
  closed: "bg-muted",
};

const INVOICE_STATUS_BADGE: Record<string, string> = {
  paid: "bg-green-500/15 text-green-700",
  unpaid: "bg-yellow-500/15 text-yellow-700",
  overdue: "bg-red-500/15 text-red-700",
  cancelled: "bg-muted",
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const proposals = useAppStore((s) => s.proposals);
  const deals = useAppStore((s) => s.deals);
  const users = useAppStore((s) => s.users);
  const regions = useAppStore((s) => s.regions);
  const teams = useAppStore((s) => s.teams);

  const scope = getScope(me.role, "customers");
  const visibleCustomers = visibleWithScope(scope, me, customers);
  const customer = id ? (visibleCustomers.find((c) => c.id === id) ?? null) : null;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [proposalDetailId, setProposalDetailId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addTicketOpen, setAddTicketOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [addProductLineOpen, setAddProductLineOpen] = useState(false);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const canUpdate = can(me.role, "customers", "update");
  const canDelete = can(me.role, "customers", "delete");
  const canManageTickets = can(me.role, "customers", "manage_tickets");
  const canUpdateCustomer = customer && (scope === "ALL" || customer.assignedTo === me.id);

  const customerProposals = customer
    ? proposals.filter((p) => p.customerId === customer.id)
    : [];
  const customerDeals = customer ? deals.filter((d) => d.customerId === customer.id) : [];

  const openTicketsCount = customer?.supportTickets.filter(
    (t) => t.status === "open" || t.status === "in_progress"
  ).length ?? 0;

  if (!customer) {
    return (
      <>
        <Topbar title="Customer" subtitle="Not found" />
        <div className="p-6 max-w-[1400px] mx-auto">
          <p className="text-muted-foreground">Customer not found or you don&apos;t have access.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/customers")}>
            Back to Customers
          </Button>
        </div>
      </>
    );
  }

  const primaryContact = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
  const assignedUser = users.find((u) => u.id === customer.assignedTo);
  const detailProposal = proposalDetailId
    ? proposals.find((p) => p.id === proposalDetailId)
    : null;

  const addressLines = [
    customer.address?.line1,
    customer.address?.line2,
    [customer.address?.city, customer.address?.state, customer.address?.pincode]
      .filter(Boolean)
      .join(", "),
    customer.address?.country,
  ].filter(Boolean);

  return (
    <>
      <Topbar
        title={customer.companyName}
        subtitle={customer.customerNumber}
      />
      <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1400px] mx-auto">
        {/* Left Sidebar */}
        <aside className="w-full lg:w-[280px] flex-shrink-0 lg:sticky lg:top-4 lg:self-start space-y-5">
          <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
            <CardContent className="p-5">
              {/* Header block */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-snug break-words flex-1">
                    {customer.companyName}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize flex-shrink-0",
                      STATUS_PILL[customer.status] ?? STATUS_PILL.inactive
                    )}
                  >
                    {customer.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono">{customer.customerNumber}</p>
                {customer.industry && (
                  <p className="text-xs text-gray-500">{customer.industry}</p>
                )}
                {customer.website && (
                  <a
                    href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {customer.website} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <Separator className="bg-gray-100 dark:bg-gray-800 my-4" />

              {/* Primary contact */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Primary Contact</p>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {primaryContact?.name}
                  </p>
                  {primaryContact?.designation && (
                    <p className="text-xs text-gray-500">{primaryContact.designation}</p>
                  )}
                  {primaryContact?.email && (
                    <a
                      href={`mailto:${primaryContact.email}`}
                      className="text-xs text-blue-600 hover:underline block"
                    >
                      {primaryContact.email}
                    </a>
                  )}
                  {primaryContact?.phone && (
                    <p className="text-xs text-gray-500">{primaryContact.phone}</p>
                  )}
                </div>
              </div>

              <Separator className="bg-gray-100 dark:bg-gray-800 my-4" />

              {/* Assignment */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Assigned To</p>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {customer.assignedToName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                      {customer.assignedToName.replace(/\s*\(.*?\)\s*/g, "").trim()}
                    </p>
                    <p className="text-xs text-gray-400">
                      {regions.find((r) => r.id === customer.regionId)?.name} · {teams.find((t) => t.id === customer.teamId)?.name}
                    </p>
                  </div>
                </div>
              </div>

              {customer.tags.length > 0 && (
                <>
                  <Separator className="bg-gray-100 dark:bg-gray-800 my-4" />
                  <div className="flex flex-wrap gap-1.5">
                    {customer.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <Separator className="bg-gray-100 dark:bg-gray-800 my-4" />

              {/* Stats */}
              <div className="border border-gray-100 dark:border-gray-800 rounded-lg p-4 space-y-3">
                {[
                  {
                    label: "Total Revenue",
                    value: `₹${customer.totalRevenue.toLocaleString("en-IN")}`,
                    valueClass: "text-emerald-600 font-semibold",
                  },
                  {
                    label: "Deal Value",
                    value: `₹${customer.totalDealValue.toLocaleString("en-IN")}`,
                    valueClass: "font-medium",
                  },
                  {
                    label: "Active Proposals",
                    value: String(customer.activeProposalsCount),
                    valueClass: "font-medium",
                  },
                  {
                    label: "Active Deals",
                    value: String(customer.activeDealsCount),
                    valueClass: "font-medium",
                  },
                  {
                    label: "Open Tickets",
                    value: String(openTicketsCount),
                    valueClass: openTicketsCount > 0 ? "text-orange-600 font-medium" : "font-medium",
                  },
                ].map(({ label, value, valueClass }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                    <span className={cn("text-sm text-gray-900 dark:text-gray-100", valueClass)}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              <Separator className="bg-gray-100 dark:bg-gray-800 my-4" />

              <p className="text-xs text-gray-400">
                Created{" "}
                {new Date(customer.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>

              {/* Quick actions */}
              <div className="flex gap-2 pt-1">
                {canUpdate && canUpdateCustomer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => navigate(`/proposals?customer=${customer.id}`)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Proposal
                </Button>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => setLogActivityOpen(true)}>
                  <Activity className="h-3.5 w-3.5 mr-1.5" /> Log Activity
                </Button>
                {canDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8 text-destructive"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Main content - Tabs */}
        <div className="flex-1 min-w-0 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col">
            <div className="border-b border-gray-200 dark:border-gray-800 mb-6">
              <div className="flex overflow-x-auto scrollbar-none -mb-px">
                {[
                  { key: "overview", label: "Overview" },
                  { key: "transactions", label: "Transaction History" },
                  { key: "productline", label: "Product Line" },
                  { key: "notes", label: "Notes & Attachments" },
                  { key: "tickets", label: "Support Tickets" },
                  { key: "activity", label: "Activity Log" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                      activeTab === tab.key
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <TabsContent value="overview" className="mt-0 space-y-6 flex-1">
              <Card className="border border-gray-200 dark:border-gray-800 shadow-none">
                <CardHeader className="pb-3 pt-5 px-6">
                  <CardTitle className="text-base font-semibold">Company Details</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Address</p>
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        {[
                          customer.address?.line1,
                          customer.address?.line2,
                          customer.address?.city,
                          customer.address?.state,
                          customer.address?.pincode,
                          customer.address?.country,
                        ].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                    {customer.gstin && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">GSTIN</p>
                        <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{customer.gstin}</p>
                      </div>
                    )}
                    {customer.pan && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">PAN</p>
                        <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{customer.pan}</p>
                      </div>
                    )}
                    {customer.website && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Website</p>
                        <a
                          href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {customer.website}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {customer.industry && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Industry</p>
                        <p className="text-sm text-gray-800 dark:text-gray-200">{customer.industry}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-200 dark:border-gray-800 shadow-none overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                  <CardTitle className="text-base font-semibold">Contacts</CardTitle>
                  {canUpdate && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddContactOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Contact
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid gap-4">
                    {customer.contacts.map((c) => (
                      <Card key={c.id} className="bg-muted/30 border border-gray-200 dark:border-gray-800 shadow-none overflow-hidden">
                        <CardContent className="p-4 flex flex-row items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{c.name}</span>
                              {c.isPrimary && (
                                <Badge variant="secondary" className="text-[10px]">Primary</Badge>
                              )}
                            </div>
                            {c.designation && <p className="text-xs text-muted-foreground">{c.designation}</p>}
                            <p className="text-xs text-primary">{c.email}</p>
                            {c.phone && <p className="text-xs">{c.phone}</p>}
                          </div>
                          {canUpdate && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                title="Delete"
                                disabled={customer.contacts.length <= 1}
                              />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-200 dark:border-gray-800 border-dashed shadow-none overflow-hidden">
                <CardContent className="p-6 flex items-center gap-4 bg-muted/20">
                  <MapPin className="w-8 h-8 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Address Map</p>
                    <p className="text-xs text-muted-foreground">
                      {addressLines.length ? addressLines.join(", ") : "No address"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transactions" className="mt-6 space-y-4">
              <Accordion type="multiple" defaultValue={["proposals", "deals", "payments", "invoices"]} className="border border-border rounded-lg overflow-hidden">
                <AccordionItem value="proposals" className="border-b border-border px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Proposals</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Proposal #</TableHead>
                          <TableHead className="text-xs">Title</TableHead>
                          <TableHead className="text-xs text-right">Value</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Created</TableHead>
                          <TableHead className="text-xs">Valid Until</TableHead>
                          <TableHead className="text-xs w-[80px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerProposals
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                          .map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-mono text-xs">{p.proposalNumber}</TableCell>
                              <TableCell className="text-sm">{p.title}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatINR(p.finalQuoteValue ?? p.grandTotal)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px]">
                                  {p.status.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {p.createdAt.slice(0, 10)}
                              </TableCell>
                              <TableCell className="text-xs">{p.validUntil}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" className="h-7" onClick={() => setProposalDetailId(p.id)}>
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        {customerProposals.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                              No proposals
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="deals" className="border-b border-border px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Deals</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Deal #</TableHead>
                          <TableHead className="text-xs">Title</TableHead>
                          <TableHead className="text-xs text-right">Value</TableHead>
                          <TableHead className="text-xs">Stage</TableHead>
                          <TableHead className="text-xs">Created</TableHead>
                          <TableHead className="text-xs w-[80px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerDeals.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-xs">{d.id}</TableCell>
                            <TableCell className="text-sm">{d.name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatINR(d.value)}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{d.stage}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">—</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-7" onClick={() => navigate("/deals")}>
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {customerDeals.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                              No deals
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="payments" className="border-b border-border px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Payments</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    {(can(me.role, "customers", "view") && (me.role === "finance" || me.role === "super_admin")) && (
                      <Button size="sm" variant="outline" className="mb-4" onClick={() => setRecordPaymentOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Record Payment
                      </Button>
                    )}
                    <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Deal</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Mode</TableHead>
                          <TableHead className="text-xs">Reference</TableHead>
                          <TableHead className="text-xs">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customer.payments.map((pay) => (
                          <TableRow key={pay.id}>
                            <TableCell className="text-xs">{pay.paidOn}</TableCell>
                            <TableCell className="text-sm">{pay.dealTitle}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatINR(pay.amount)}</TableCell>
                            <TableCell className="text-xs">{pay.mode}</TableCell>
                            <TableCell className="text-xs font-mono">{pay.reference}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{pay.notes ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {customer.payments.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                              No payments recorded
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    </div>
                    {customer.payments.length > 0 && (
                      <p className="text-sm font-medium mt-4">
                        Total Paid: {formatINR(customer.payments.reduce((s, p) => s + p.amount, 0))}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="invoices" className="px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">Invoices</AccordionTrigger>
                  <AccordionContent className="pb-4 pt-0">
                    {(me.role === "finance" || me.role === "super_admin") && (
                      <Button size="sm" variant="outline" className="mb-4" onClick={() => setCreateInvoiceOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Create Invoice
                      </Button>
                    )}
                    <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Invoice #</TableHead>
                          <TableHead className="text-xs">Deal</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs text-right">Tax</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs">Issued</TableHead>
                          <TableHead className="text-xs">Due</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customer.invoices.map((inv) => {
                          const isOverdue =
                            inv.status === "unpaid" &&
                            new Date(inv.dueDate) < new Date();
                          return (
                            <TableRow
                              key={inv.id}
                              className={isOverdue ? "bg-red-500/10" : undefined}
                            >
                              <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                              <TableCell className="text-sm">{inv.dealTitle}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatINR(inv.amount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatINR(inv.taxAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatINR(inv.totalAmount)}</TableCell>
                              <TableCell className="text-xs">{inv.issuedOn}</TableCell>
                              <TableCell className="text-xs">{inv.dueDate}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={INVOICE_STATUS_BADGE[inv.status] ?? "bg-muted"}>
                                  {inv.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {customer.invoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                              No invoices
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="productline" className="mt-6 space-y-6">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Active Products & Services</CardTitle>
                  {(me.role === "super_admin" || me.role === "sales_manager") && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddProductLineOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Product Line
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Unit Price</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Purchased</TableHead>
                    <TableHead className="text-xs">Renewal</TableHead>
                    <TableHead className="text-xs">Expiry</TableHead>
                    <TableHead className="text-xs">Usage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.productLines.map((pl) => {
                    const renewalDate = pl.renewalDate ? new Date(pl.renewalDate) : null;
                    const expiryDate = pl.expiryDate ? new Date(pl.expiryDate) : null;
                    const now = new Date();
                    const daysToExpiry = expiryDate
                      ? Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
                      : null;
                    const expiringSoon = daysToExpiry !== null && daysToExpiry <= 30;
                    const expiringVerySoon = daysToExpiry !== null && daysToExpiry <= 7;
                    return (
                      <TableRow
                        key={pl.id}
                        className={
                          expiringVerySoon
                            ? "bg-red-500/10"
                            : expiringSoon
                            ? "bg-amber-500/10"
                            : undefined
                        }
                      >
                        <TableCell className="text-sm font-medium">
                          <span className="flex items-center gap-1">
                            {expiringSoon && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                            {pl.itemName}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{pl.sku}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{pl.itemType}</Badge></TableCell>
                        <TableCell className="text-right">{pl.qty}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatINR(pl.unitPrice)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              pl.status === "active"
                                ? "bg-green-500/15"
                                : pl.status === "expired"
                                ? "bg-orange-500/15"
                                : "bg-muted"
                            }
                          >
                            {pl.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{pl.purchasedAt.slice(0, 10)}</TableCell>
                        <TableCell className="text-xs">{pl.renewalDate ?? "—"}</TableCell>
                        <TableCell className="text-xs">{pl.expiryDate ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{pl.usageDetails ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {customer.productLines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                        No product lines
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
                </div>
                </CardContent>
              </Card>

              {customer.productLines.some(
                (pl) => pl.itemType === "subscription" && pl.status === "active"
              ) && (
                <Card className="border border-border overflow-hidden">
                  <CardHeader className="px-6 py-4 border-b border-border">
                    <CardTitle className="text-base font-semibold">Subscription Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 text-sm space-y-2">
                    <p>
                      Total active subscriptions:{" "}
                      {customer.productLines.filter(
                        (pl) => pl.itemType === "subscription" && pl.status === "active"
                      ).length}
                    </p>
                    <p className="text-muted-foreground">
                      Next renewal:{" "}
                      {(() => {
                        const subs = customer.productLines.filter(
                          (pl) => pl.itemType === "subscription" && pl.status === "active" && pl.renewalDate
                        );
                        const next = subs.sort(
                          (a, b) => (a.renewalDate ?? "").localeCompare(b.renewalDate ?? "")
                        )[0];
                        return next ? `${next.renewalDate} — ${next.itemName}` : "—";
                      })()}
                    </p>
                    <p>
                      Annual subscription value:{" "}
                      {formatINR(
                        customer.productLines
                          .filter((pl) => pl.itemType === "subscription" && pl.status === "active")
                          .reduce((s, pl) => s + pl.qty * pl.unitPrice * 12, 0)
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="notes" className="mt-6 space-y-6">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 shrink-0" /> Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {!noteExpanded ? (
                    <Button variant="outline" size="sm" onClick={() => setNoteExpanded(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Note
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a note..."
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!noteInput.trim()) return;
                            useAppStore.getState().addNote(customer.id, {
                              id: "cn-" + makeId(),
                              content: noteInput.trim(),
                              createdBy: me.id,
                              createdByName: me.name,
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                            });
                            toast({ title: "Note added" });
                            setNoteInput("");
                            setNoteExpanded(false);
                          }}
                        >
                          Save
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setNoteExpanded(false); setNoteInput(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {customer.notes.length === 0 && (
                      <p className="text-sm text-muted-foreground">No notes yet. Add the first note.</p>
                    )}
                    {customer.notes
                      .slice()
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((note) => (
                        <Card key={note.id} className="bg-muted/30 border border-border">
                          <CardContent className="p-4">
                            {editingNoteId === note.id ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editingNoteContent}
                                  onChange={(e) => setEditingNoteContent(e.target.value)}
                                  rows={3}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      useAppStore.getState().updateNote(customer.id, note.id, editingNoteContent);
                                      setEditingNoteId(null);
                                      setEditingNoteContent("");
                                      toast({ title: "Note updated" });
                                    }}
                                  >
                                    Save
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => { setEditingNoteId(null); setEditingNoteContent(""); }}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  {note.createdByName} · {formatDate(note.createdAt)}
                                </p>
                                {canUpdate && (me.role === "super_admin" || note.createdBy === me.id) && (
                                  <div className="flex gap-1 mt-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setEditingNoteId(note.id);
                                        setEditingNoteContent(note.content);
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs text-destructive"
                                      onClick={() => {
                                        useAppStore.getState().deleteNote(customer.id, note.id);
                                        toast({ title: "Note deleted" });
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border overflow-hidden">
                <CardHeader className="px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Attachments</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <Button variant="outline" size="sm" className="mb-3" asChild>
                    <label>
                      <input type="file" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          useAppStore.getState().updateCustomer(customer.id, {
                            attachments: [
                              ...customer.attachments,
                              {
                                id: "ca-" + makeId(),
                                fileName: file.name,
                                fileType: file.type,
                                fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
                                uploadedBy: me.id,
                                uploadedAt: new Date().toISOString(),
                              },
                            ],
                          });
                          toast({ title: "Attachment added (demo)" });
                        }
                      }} />
                      <Upload className="w-4 h-4 mr-1" /> Upload Attachment
                    </label>
                  </Button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {customer.attachments.map((att) => (
                      <Card key={att.id} className="bg-muted/30 border border-border">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{att.fileName}</p>
                              <p className="text-xs text-muted-foreground">{att.fileSize} · {formatDate(att.uploadedAt)}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive flex-shrink-0"
                            onClick={() => {
                              useAppStore.getState().updateCustomer(customer.id, {
                                attachments: customer.attachments.filter((a) => a.id !== att.id),
                              });
                              toast({ title: "Attachment removed" });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                    {customer.attachments.length === 0 && (
                      <p className="text-sm text-muted-foreground col-span-2">No attachments</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tickets" className="mt-6 space-y-4">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Support Tickets</CardTitle>
                  {canManageTickets && (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAddTicketOpen(true)}>
                      <Plus className="w-4 h-4 mr-1" /> New Ticket
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-6">
              <div className="text-xs text-muted-foreground mb-4 px-1">
                Open: {customer.supportTickets.filter((t) => t.status === "open").length} · In Progress:{" "}
                {customer.supportTickets.filter((t) => t.status === "in_progress").length} · Resolved:{" "}
                {customer.supportTickets.filter((t) => t.status === "resolved").length} · Avg Resolution: — days
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Ticket #</TableHead>
                    <TableHead className="text-xs">Subject</TableHead>
                    <TableHead className="text-xs">Priority</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Assigned To</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                    <TableHead className="text-xs">Updated</TableHead>
                    <TableHead className="text-xs w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.supportTickets.map((t) => (
                    <>
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedTicketId(expandedTicketId === t.id ? null : t.id)}
                      >
                        <TableCell className="font-mono text-xs">{t.ticketNumber}</TableCell>
                        <TableCell className="text-sm">{t.subject}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TICKET_PRIORITY_BADGE[t.priority] ?? "bg-muted"}>
                            {t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TICKET_STATUS_BADGE[t.status] ?? "bg-muted"}>
                            {t.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{t.assignedToName ?? "—"}</TableCell>
                        <TableCell className="text-xs">{t.createdAt.slice(0, 10)}</TableCell>
                        <TableCell className="text-xs">{t.updatedAt.slice(0, 10)}</TableCell>
                        <TableCell>
                          {canManageTickets && (
                            <Button variant="ghost" size="sm" className="h-7" onClick={(e) => e.stopPropagation()}>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {expandedTicketId === t.id && (
                        <TableRow key={`${t.id}-detail`}>
                          <TableCell colSpan={8} className="bg-muted/30">
                            <div className="p-3 space-y-2 text-sm">
                              <p><strong>Description:</strong></p>
                              <p className="text-muted-foreground whitespace-pre-wrap">{t.description}</p>
                              {t.resolvedAt && (
                                <p className="text-xs text-muted-foreground">Resolved: {formatDate(t.resolvedAt)}</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {customer.supportTickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No support tickets
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-6 space-y-4">
              <Card className="border border-border overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-border">
                  <CardTitle className="text-base font-semibold">Activity Log</CardTitle>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setLogActivityOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Log Activity
                  </Button>
                </CardHeader>
                <CardContent className="p-6">
              <div className="space-y-3">
                {customer.activityLog.slice(0, 20).map((entry) => (
                  <div key={entry.id} className="flex gap-3 items-start">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-primary"
                      style={{
                        backgroundColor:
                          entry.entityType === "proposal"
                            ? "var(--color-blue-500)"
                            : entry.entityType === "deal"
                            ? "var(--color-purple-500)"
                            : entry.entityType === "payment"
                            ? "var(--color-green-500)"
                            : entry.entityType === "ticket"
                            ? "var(--color-orange-500)"
                            : entry.entityType === "note"
                            ? "var(--color-gray-500)"
                            : "var(--color-teal-500)",
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{entry.action}</p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        by {entry.performedByName} · {formatDate(entry.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                {customer.activityLog.length === 0 && (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                )}
              </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingCustomer={customer}
        onSaved={() => setEditOpen(false)}
      />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {customer.companyName} and all related data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                useAppStore.getState().deleteCustomer(customer.id);
                toast({ title: "Customer deleted" });
                setDeleteConfirm(false);
                navigate("/customers");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProposalDetailSheet
        proposal={detailProposal ?? null}
        open={!!proposalDetailId}
        onOpenChange={(open) => !open && setProposalDetailId(null)}
        onEdit={() => proposalDetailId && navigate("/proposals", { state: { editId: proposalDetailId } })}
        onApprove={() => {}}
        onReject={() => {}}
        onSend={() => {}}
        onCreateDeal={() => {}}
        onDownloadPdf={async () => {
          if (!detailProposal) return;
          setPdfLoading(true);
          toast({ title: "Generating PDF...", description: "Please wait" });
          try {
            await new Promise((r) => setTimeout(r, 100));
            await generateProposalPdf(detailProposal);
            toast({ title: "PDF Downloaded", description: `Proposal-${detailProposal.proposalNumber}.pdf` });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to generate PDF";
            toast({ title: "PDF generation failed", description: message, variant: "destructive" });
          } finally {
            setPdfLoading(false);
          }
        }}
        isPdfLoading={pdfLoading}
      />

      {/* Placeholder dialogs - can be expanded with full forms */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Add contact form (Name, Email, Phone, Set as Primary).</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContactOpen(false)}>Cancel</Button>
            <Button onClick={() => setAddContactOpen(false)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addTicketOpen} onOpenChange={setAddTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Ticket</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Subject, Description, Priority, Assigned To.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTicketOpen(false)}>Cancel</Button>
            <Button onClick={() => setAddTicketOpen(false)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deal, Amount, Paid On, Mode, Reference, Notes.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPaymentOpen(false)}>Cancel</Button>
            <Button onClick={() => setRecordPaymentOpen(false)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deal, Amount, Tax, Due Date.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateInvoiceOpen(false)}>Cancel</Button>
            <Button onClick={() => setCreateInvoiceOpen(false)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addProductLineOpen} onOpenChange={setAddProductLineOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Product Line</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Select from Inventory, Qty, Unit Price, Dates, Usage, Status.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProductLineOpen(false)}>Cancel</Button>
            <Button onClick={() => setAddProductLineOpen(false)}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={logActivityOpen} onOpenChange={setLogActivityOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Action, Description, Entity Type.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogActivityOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                useAppStore.getState().appendActivityLog(customer.id, {
                  id: "cal-" + makeId(),
                  action: "Activity logged",
                  description: "Manual activity entry",
                  performedBy: me.id,
                  performedByName: me.name,
                  timestamp: new Date().toISOString(),
                });
                toast({ title: "Activity logged" });
                setLogActivityOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
