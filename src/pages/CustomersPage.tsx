import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { useAppStore } from '@/store/useAppStore';
import { getScope } from '@/lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { dialogSmMax2xl } from '@/lib/dialogLayout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { apiUrl } from '@/lib/api';
import { DataTablePagination } from '@/components/DataTablePagination';

export default function CustomersPage() {
  const me = useAppStore(s => s.me);
  const regions = useAppStore(s => s.regions);
  const users = useAppStore(s => s.users);

  const queryClient = useQueryClient();
  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/customers'));
      if (!res.ok) throw new Error('Failed to load customers');
      return res.json() as Promise<import('@/types').Customer[]>;
    },
  });

  const addCustomerMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      state: string;
      gstin: string | null;
      regionId: string;
      city?: string;
      email?: string;
      primaryPhone?: string;
      status?: 'active' | 'inactive';
      salesExecutive?: string;
      accountManager?: string;
      deliveryExecutive?: string;
    }) => {
      const res = await fetch(apiUrl('/api/customers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create customer');
      return res.json();
    },
    onSuccess: (created: import('@/types').Customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({
        title: 'Customer created',
        description: `${created.name} has been added successfully.`,
      });
    },
  });

  const bulkCustomersMutation = useMutation({
    mutationFn: async (items: {
      name: string;
      state: string;
      gstin: string | null;
      regionId: string;
      city?: string;
      email?: string;
      primaryPhone?: string;
      status?: 'active' | 'inactive';
      salesExecutive?: string;
      accountManager?: string;
      deliveryExecutive?: string;
    }[]) => {
      const res = await fetch(apiUrl('/api/customers/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      if (!res.ok) throw new Error('Failed to import customers');
      return res.json();
    },
    onSuccess: (created: import('@/types').Customer[] | unknown) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      const count = Array.isArray(created) ? created.length : undefined;
      toast({
        title: 'Customers imported',
        description: count ? `${count} customers have been added.` : 'Customers have been added.',
      });
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [companyName, setCompanyName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [gst, setGst] = useState('');
  const [regionId, setRegionId] = useState<string | undefined>(regions[0]?.id);
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);

  const salesReps = users.filter(u => u.role === 'sales_rep');
  const [salesExecId, setSalesExecId] = useState<string | undefined>(
    me.role === 'sales_rep' ? me.id : salesReps[0]?.id,
  );

  const [leadFilter, setLeadFilter] = useState('');
  const [salesFilter, setSalesFilter] = useState<string | 'all'>('all');
  const [regionFilter, setRegionFilter] = useState<string | 'all'>('all');
  const [draftLeadFilter, setDraftLeadFilter] = useState('');
  const [draftSalesFilter, setDraftSalesFilter] = useState<string | 'all'>('all');
  const [draftRegionFilter, setDraftRegionFilter] = useState<string | 'all'>('all');

  useEffect(() => {
    setDraftLeadFilter(leadFilter);
    setDraftSalesFilter(salesFilter);
    setDraftRegionFilter(regionFilter);
  }, [leadFilter, salesFilter, regionFilter]);

  const hasPendingFilterChanges =
    draftLeadFilter !== leadFilter || draftSalesFilter !== salesFilter || draftRegionFilter !== regionFilter;

  const applyFilters = () => {
    setLeadFilter(draftLeadFilter);
    setSalesFilter(draftSalesFilter);
    setRegionFilter(draftRegionFilter);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftLeadFilter('');
    setDraftSalesFilter('all');
    setDraftRegionFilter('all');
    setLeadFilter('');
    setSalesFilter('all');
    setRegionFilter('all');
    setPage(1);
  };

  const all = customersQuery.data ?? [];
  const scope = getScope(me.role, 'customers');
  const scoped = scope === 'NONE' ? [] : scope === 'ALL' ? all : all.filter(c => c.regionId === me.regionId);
  const visible = scoped.filter(c => {
    if (leadFilter && !c.leadId?.toLowerCase().includes(leadFilter.toLowerCase())) return false;
    if (salesFilter !== 'all' && c.salesExecutive !== salesFilter) return false;
    if (regionFilter !== 'all' && c.regionId !== regionFilter) return false;
    return true;
  });

  const totalCustomers = visible.length;
  const activeCustomers = visible.filter(c => c.status !== 'inactive').length;
  const inactiveCustomers = totalCustomers - activeCustomers;
  const now = Date.now();
  const newThisMonth = visible.filter(c => {
    if (!c.createdAt) return false;
    const created = Date.parse(c.createdAt);
    return !Number.isNaN(created) && now - created <= 30 * 24 * 60 * 60 * 1000;
  }).length;

  const topCities = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of visible) {
      const city = c.city || c.state || 'Unknown';
      counts[city] = (counts[city] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [visible]);

  const topSalesExecutives = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of visible) {
      if (!c.salesExecutive) continue;
      counts[c.salesExecutive] = (counts[c.salesExecutive] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [visible]);

  const latestCustomers = [...visible]
    .filter(c => c.createdAt)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 4);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageItems = visible.slice(startIndex, endIndex);

  return (
    <>
      <Topbar title="Leads" subtitle="Capture and qualify inbound buyer & seller interest" />
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Total Leads</p>
              <p className="text-2xl font-bold">{totalCustomers}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Active Leads</p>
              <p className="text-2xl font-bold text-green-600">{activeCustomers}</p>
              <p className="text-[11px] text-muted-foreground">
                {totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 0}% of total
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Inactive Customers</p>
              <p className="text-2xl font-bold text-amber-600">{inactiveCustomers}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border border-border">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">New This Month</p>
              <p className="text-2xl font-bold text-primary">{newThisMonth}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          <Card className="flex-1 bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-2">Top Cities</p>
              {topCities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No city data available</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {topCities.map(([city, count]) => (
                    <li key={city} className="flex justify-between">
                      <span>{city}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="flex-1 bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-2">Top Sales Executives</p>
              {topSalesExecutives.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sales executive data available</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {topSalesExecutives.map(([name, count]) => (
                    <li key={name} className="flex justify-between">
                      <span>{name}</span>
                      <span className="text-muted-foreground">{count} customers</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="flex-1 bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-2">Latest Leads</p>
              {latestCustomers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recent leads</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {latestCustomers.map(c => (
                    <li key={c.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">{c.city ?? c.state}</p>
                      </div>
                      <span className="text-[11px] text-primary">
                        {c.status === 'inactive' ? 'inactive' : 'active'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center pt-2">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Lead Directory</h3>
            <p className="text-xs text-muted-foreground">Add individual leads or upload them in bulk.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <div className="flex flex-wrap gap-2 items-center mr-2">
              <Input
                className="h-8 text-xs w-32"
                placeholder="Lead ID"
                value={draftLeadFilter}
                onChange={e => setDraftLeadFilter(e.target.value)}
              />
              <Select
                value={draftSalesFilter}
                onValueChange={v => setDraftSalesFilter(v as typeof salesFilter)}
              >
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue placeholder="Sales exec" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All executives</SelectItem>
                  {Array.from(new Set(scoped.map(c => c.salesExecutive).filter(Boolean))).map(name => (
                    <SelectItem key={name as string} value={name as string}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={draftRegionFilter}
                onValueChange={v => setDraftRegionFilter(v as typeof regionFilter)}
              >
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All regions</SelectItem>
                  {regions.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                disabled={!hasPendingFilterChanges}
                onClick={clearFilters}
              >
                Clear
              </Button>
              <Button
                size="sm"
                className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!hasPendingFilterChanges}
                onClick={applyFilters}
              >
                Apply
              </Button>
            </div>
            <div className="flex rounded-md border border-border bg-muted text-xs overflow-hidden">
              <button
                type="button"
                className={`px-3 py-1.5 ${viewMode === 'cards' ? 'bg-background font-medium' : 'text-muted-foreground'}`}
                onClick={() => setViewMode('cards')}
              >
                Cards
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 ${viewMode === 'table' ? 'bg-background font-medium' : 'text-muted-foreground'}`}
                onClick={() => setViewMode('table')}
              >
                Table
              </button>
            </div>
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setBulkOpen(true)}>
              Bulk Upload Leads
            </Button>
            <Button size="sm" className="text-xs h-8" onClick={() => setAddOpen(true)}>
              + Add Lead
            </Button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <Card className="bg-card border border-border">
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">All Leads</h3>
                <p className="text-[11px] text-muted-foreground">
                  Showing {visible.length === 0 ? 0 : startIndex + 1}–{Math.min(endIndex, visible.length)} of {visible.length}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Company Name</TableHead>
                    <TableHead className="text-xs">Lead ID</TableHead>
                    <TableHead className="text-xs">Sales Executive</TableHead>
                    <TableHead className="text-xs">Region</TableHead>
                    <TableHead className="text-xs">City</TableHead>
                    <TableHead className="text-xs">GSTIN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customersQuery.isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-12">
                        Loading leads...
                      </TableCell>
                    </TableRow>
                  )}
                  {!customersQuery.isLoading && pageItems.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.leadId}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.salesExecutive ?? '—'}</TableCell>
                      <TableCell className="text-sm">{regions.find(r => r.id === c.regionId)?.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.city ?? c.state}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.gstin ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!customersQuery.isLoading && visible.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-12">No leads in scope</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {visible.length > pageSize && (
                <DataTablePagination
                  page={currentPage}
                  totalPages={totalPages}
                  total={visible.length}
                  perPage={pageSize}
                  onPageChange={setPage}
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border border-border">
            <CardContent className="p-4">
              {customersQuery.isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading leads...</p>
              ) : visible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No leads in scope</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pageItems.map(c => (
                    <Card key={c.id} className="border border-border bg-background">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{c.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {c.city ?? c.state} · {regions.find(r => r.id === c.regionId)?.name}
                            </p>
                          </div>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full border ${
                              c.status === 'inactive'
                                ? 'border-amber-500 text-amber-600'
                                : 'border-emerald-500 text-emerald-600'
                            }`}
                          >
                            {c.status === 'inactive' ? 'inactive' : 'active'}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          {c.email && <p>{c.email}</p>}
                          {c.primaryPhone && <p>{c.primaryPhone}</p>}
                          {c.salesExecutive && <p>Sales: {c.salesExecutive}</p>}
                          {c.deliveryExecutive && <p>Delivery: {c.deliveryExecutive}</p>}
                        </div>
                        <Button variant="outline" size="sm" className="mt-2 h-8 text-[11px] w-full">
                          View Customer 360
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className={dialogSmMax2xl}>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Paridhi Group" />
            </div>
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Vaibhav Agrawal (optional)" />
            </div>
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Primary Phone</Label>
              <Input value={primaryPhone} onChange={e => setPrimaryPhone(e.target.value)} placeholder="+91-99999 99999" />
            </div>
            <div className="space-y-2">
              <Label>Sales Executive</Label>
              <Select
                value={salesExecId}
                onValueChange={setSalesExecId}
                disabled={me.role === 'sales_rep'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sales person" />
                </SelectTrigger>
                <SelectContent>
                  {salesReps.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {me.role === 'sales_rep'
                  ? 'As a Sales Rep, you will be set as the sales executive for this customer.'
                  : 'Optionally assign a sales executive; you can change this later.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>City / State</Label>
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Mumbai, Maharashtra" />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Business St, Area" />
            </div>
            <div className="space-y-2">
              <Label>GST Number</Label>
              <Input value={gst} onChange={e => setGst(e.target.value)} placeholder="GST123456789" />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={regionId} onValueChange={setRegionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!companyName || !regionId) return;
                const chosenSalesExecId = me.role === 'sales_rep' ? me.id : salesExecId;
                const chosenSalesExecName =
                  users.find(u => u.id === chosenSalesExecId)?.name ?? undefined;
                addCustomerMutation.mutate({
                  name: companyName || customerName,
                  customerName: customerName || null,
                  companyName: companyName || null,
                  state: city || 'Unknown',
                  gstin: gst || null,
                  regionId,
                  city,
                  email,
                  primaryPhone,
                  status: 'active',
                  salesExecutive: chosenSalesExecName,
                });
                setCompanyName('');
                setCustomerName('');
                setEmail('');
                setPrimaryPhone('');
                setCity('');
                setAddress('');
                setGst('');
                setRegionId(regions[0]?.id);
                 setSalesExecId(me.role === 'sales_rep' ? me.id : salesReps[0]?.id);
                setAddOpen(false);
              }}
            >
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Upload Customers</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Paste CSV data with columns: <strong>Company Name, State, GSTIN, Region Name</strong>. One customer per line.
          </p>
          <div className="space-y-2">
            <Label>CSV Rows</Label>
            <textarea
              className="w-full h-40 text-xs rounded-md border border-border bg-background p-2 font-mono"
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={"Acme Corp,Maharashtra,GST1234,West\nAnother Co,Gujarat,,West"}
            />
          </div>
          {bulkError && <p className="text-xs text-destructive">{bulkError}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) {
                  setBulkError('Please enter at least one row.');
                  return;
                }
                const payloads: {
                  name: string;
                  state: string;
                  gstin: string | null;
                  regionId: string;
                  city?: string;
                  email?: string;
                  primaryPhone?: string;
                  status?: 'active' | 'inactive';
                  salesExecutive?: string;
                  accountManager?: string;
                  deliveryExecutive?: string;
                }[] = [];
                for (const line of lines) {
                  const [name, state, gstin, regionName, cityCsv] = line.split(',').map(s => s.trim());
                  const region = regions.find(r => r.name.toLowerCase() === (regionName ?? '').toLowerCase()) ?? regions[0];
                  if (!name || !region) continue;
                  payloads.push({
                    name,
                    state: state || 'Unknown',
                    gstin: gstin || null,
                    regionId: region.id,
                    city: cityCsv || state || undefined,
                  });
                }
                if (payloads.length === 0) {
                  setBulkError('No valid rows found. Check the format.');
                  return;
                }
                bulkCustomersMutation.mutate(payloads);
                setBulkText('');
                setBulkError(null);
                setBulkOpen(false);
              }}
            >
              Import Customers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
