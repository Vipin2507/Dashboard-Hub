import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { dialogSmMax2xl } from "@/lib/dialogLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAppStore } from "@/store/useAppStore";
import { toast } from "@/components/ui/use-toast";
import type { Customer, CustomerContact, CustomerStatus } from "@/types";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TagsInput } from "@/components/ui/tags-input";

type PostalApiResponse = Array<{
  Status?: string;
  PostOffice?: Array<{
    Name?: string;
    District?: string;
    State?: string;
    Pincode?: string;
  }> | null;
}>;

function norm(s: unknown) {
  return String(s ?? "").trim();
}

function isSixDigitPincode(s: string) {
  return /^\d{6}$/.test(s);
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function FormSection({ title }: { title: string }) {
  return (
    <div className="col-span-1 sm:col-span-2 flex items-center gap-3 pt-1">
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest whitespace-nowrap">
        {title}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

const INDUSTRIES = [
  "Technology",
  "Manufacturing",
  "Healthcare",
  "Finance",
  "Retail",
  "Education",
  "Real Estate",
  "Other",
] as const;

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Chandigarh",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry",
];

const schema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  customerName: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[A-Za-z][A-Za-z\s.'-]*$/.test(v.trim()),
      "Customer name must be text only",
    ),
  industry: z.string().optional(),
  website: z
    .string()
    .optional()
    .refine((v) => !v || /^https?:\/\/.+/.test(v), "Enter a valid URL"),
  status: z.enum(["active", "inactive", "lead", "churned", "blacklisted"]),
  tags: z.array(z.string()).optional(),
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().optional(),
  pincode: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{6}$/.test(v), "Pincode must be 6 digits"),
  country: z.literal("India"),
  gstin: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
      "Invalid GSTIN (15 characters)"
    ),
  pan: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v), "Invalid PAN (10 characters)"),
  contactDesignation: z.string().optional(),
  contactEmail: z.string().min(1, "Email is required").email("Invalid email"),
  contactPhone: z
    .string()
    .optional()
    .refine((v) => !v || /^[6-9]\d{9}$/.test(v.replace(/\s+/g, "")), "Invalid 10-digit phone"),
  regionId: z.string().min(1, "Region is required"),
  teamId: z.string().min(1, "Team is required"),
  assignedTo: z.string().min(1, "Assigned to is required"),
});

type FormValues = z.infer<typeof schema>;

const STATUS_OPTIONS: { value: CustomerStatus; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "churned", label: "Churned" },
  { value: "blacklisted", label: "Blacklisted" },
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_TAG_SUGGESTIONS = [
  "VIP",
  "New Customer",
  "Hot Lead",
  "Follow Up",
  "Enterprise",
  "SMB",
  "Renewal",
  "At Risk",
];

function normalizeExistingTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((t) => String(t)).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCustomer: Customer | null;
  onSaved: (customer: Customer, mode: "create" | "update") => void;
  onPersist?: (customer: Customer, mode: "create" | "update") => Promise<void> | void;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  editingCustomer,
  onSaved,
  onPersist,
}: CustomerFormDialogProps) {
  const me = useAppStore((s) => s.me);
  const customers = useAppStore((s) => s.customers);
  const regions = useAppStore((s) => s.regions);
  const teams = useAppStore((s) => s.teams);
  const users = useAppStore((s) => s.users);
  const addCustomer = useAppStore((s) => s.addCustomer);
  const updateCustomer = useAppStore((s) => s.updateCustomer);
  const updateContact = useAppStore((s) => s.updateContact);
  const appendActivityLog = useAppStore((s) => s.appendActivityLog);

  const assignmentVisible = me.role === "super_admin";

  const tagSuggestions = Array.from(
    new Set([...DEFAULT_TAG_SUGGESTIONS, ...customers.flatMap((c) => normalizeExistingTags((c as Customer).tags))]),
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: "",
      customerName: "",
      industry: "",
      website: "",
      status: "lead",
      tags: [],
      line1: "",
      line2: "",
      city: "",
      state: "",
      pincode: "",
      country: "India",
      gstin: "",
      pan: "",
      contactDesignation: "",
      contactEmail: "",
      contactPhone: "",
      regionId: assignmentVisible ? (regions[0]?.id ?? "") : (me.regionId || regions[0]?.id ?? ""),
      teamId: assignmentVisible ? "" : (me.teamId ?? ""),
      assignedTo: assignmentVisible ? "" : me.id,
    },
  });

  const regionId = form.watch("regionId");
  const teamsInRegion = teams.filter((t) => t.regionId === regionId);
  const teamId = form.watch("teamId");
  const usersInTeam = users.filter((u) => u.teamId === teamId);

  const pincode = form.watch("pincode");
  const city = form.watch("city");
  const lastAutofillRef = useRef<{ pincode?: string; city?: string } | null>(null);
  const [pinLookupBusy, setPinLookupBusy] = useState(false);
  const [cityLookupBusy, setCityLookupBusy] = useState(false);
  const [lookupHint, setLookupHint] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (editingCustomer) {
      const primary =
        editingCustomer.contacts.find((c) => c.isPrimary) ?? editingCustomer.contacts[0];
      form.reset({
        companyName: editingCustomer.companyName ?? "",
        customerName: editingCustomer.customerName ?? "",
        industry: editingCustomer.industry ?? "",
        website: editingCustomer.website ?? "",
        status: editingCustomer.status,
        tags: normalizeExistingTags((editingCustomer as Customer).tags),
        line1: editingCustomer.address?.line1 ?? "",
        line2: editingCustomer.address?.line2 ?? "",
        city: editingCustomer.address?.city ?? "",
        state: editingCustomer.address?.state ?? "",
        pincode: editingCustomer.address?.pincode ?? "",
        country: "India",
        gstin: editingCustomer.gstin ?? "",
        pan: editingCustomer.pan ?? "",
        contactDesignation: primary?.designation ?? "",
        contactEmail: primary?.email ?? "",
        contactPhone: primary?.phone?.replace(/\D/g, "").slice(-10) ?? "",
        regionId: editingCustomer.regionId,
        teamId: editingCustomer.teamId,
        assignedTo: editingCustomer.assignedTo,
      });
    } else {
      const defaultRegion = assignmentVisible ? (regions[0]?.id ?? "") : (me.regionId || regions[0]?.id ?? "");
      const teamsForMeRegion = teams.filter((t) => t.regionId === defaultRegion);
      const defaultTeam = assignmentVisible
        ? teamsForMeRegion[0]?.id ?? ""
        : (me.teamId && teamsForMeRegion.some((t) => t.id === me.teamId) ? me.teamId : teamsForMeRegion[0]?.id ?? me.teamId ?? "");
      const defaultAssignee = assignmentVisible
        ? (defaultTeam ? users.find((u) => u.teamId === defaultTeam)?.id : undefined) ?? ""
        : me.id;
      form.reset({
        companyName: "",
        customerName: "",
        industry: "",
        website: "",
        status: "lead",
        tags: [],
        line1: "",
        line2: "",
        city: "",
        state: "",
        pincode: "",
        country: "India",
        gstin: "",
        pan: "",
        contactDesignation: "",
        contactEmail: "",
        contactPhone: "",
        regionId: defaultRegion,
        teamId: defaultTeam,
        assignedTo: defaultAssignee,
      });
    }
  }, [open, editingCustomer?.id]);

  useEffect(() => {
    if (!regionId) return;
    const firstTeam = teamsInRegion[0];
    if (firstTeam && !form.getValues("teamId")) form.setValue("teamId", firstTeam.id);
  }, [regionId, teamsInRegion]);

  useEffect(() => {
    if (!open) return;
    const v = norm(pincode);
    if (!isSixDigitPincode(v)) return;
    if (lastAutofillRef.current?.pincode === v) return;

    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setPinLookupBusy(true);
      setLookupHint("");
      void fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(v)}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: PostalApiResponse | null) => {
          const po = data?.[0]?.PostOffice?.[0] ?? null;
          const fetchedCity = norm(po?.District) || norm(po?.Name);
          const fetchedState = norm(po?.State);
          if (!fetchedCity && !fetchedState) {
            setLookupHint("No address found for this pincode.");
            return;
          }
          if (fetchedCity) form.setValue("city", titleCase(fetchedCity), { shouldDirty: true });
          if (fetchedState) form.setValue("state", fetchedState, { shouldDirty: true });
          form.setValue("country", "India");
          lastAutofillRef.current = { ...(lastAutofillRef.current ?? {}), pincode: v };
        })
        .catch(() => undefined)
        .finally(() => setPinLookupBusy(false));
    }, 400);

    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [open, pincode]);

  useEffect(() => {
    if (!open) return;
    const c = norm(city);
    if (c.length < 3) return;
    if (lastAutofillRef.current?.city === c.toLowerCase()) return;

    const currentPin = norm(form.getValues("pincode"));
    if (isSixDigitPincode(currentPin)) return;

    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setCityLookupBusy(true);
      setLookupHint("");
      void fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(c)}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: PostalApiResponse | null) => {
          const po = data?.[0]?.PostOffice?.find((x) => norm(x?.Pincode)) ?? data?.[0]?.PostOffice?.[0] ?? null;
          const fetchedPin = norm(po?.Pincode);
          const fetchedState = norm(po?.State);
          if (!fetchedPin && !fetchedState) {
            setLookupHint("No pincodes found for this city.");
            return;
          }
          if (fetchedPin && isSixDigitPincode(fetchedPin)) {
            form.setValue("pincode", fetchedPin, { shouldDirty: true });
          }
          if (fetchedState) form.setValue("state", fetchedState, { shouldDirty: true });
          form.setValue("country", "India");
          lastAutofillRef.current = { ...(lastAutofillRef.current ?? {}), city: c.toLowerCase() };
        })
        .catch(() => undefined)
        .finally(() => setCityLookupBusy(false));
    }, 500);

    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [open, city, form]);

  const getNextCustomerNumber = () => {
    const nums = customers
      .map((c) => parseInt(c.customerNumber.replace(/^CUST-0*/, ""), 10))
      .filter((n) => !Number.isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `CUST-${String(next).padStart(4, "0")}`;
  };

  const onSubmit = async (values: FormValues) => {
    const uniqueTags = Array.from(
      new Set(normalizeExistingTags(values.tags).map((t) => t.trim()).filter(Boolean)),
    );
    const companyName = values.companyName.trim();
    const customerName = (values.customerName ?? "").trim();
    const safeCustomerName = customerName || companyName;

    let regionId = values.regionId;
    let teamId = values.teamId;
    let assignedTo = values.assignedTo;
    if (!assignmentVisible) {
      if (editingCustomer) {
        regionId = editingCustomer.regionId;
        teamId = editingCustomer.teamId;
        assignedTo = editingCustomer.assignedTo;
      } else {
        const r = me.regionId || regions[0]?.id ?? "";
        const teamsForR = teams.filter((t) => t.regionId === r);
        const t =
          me.teamId && teamsForR.some((x) => x.id === me.teamId) ? me.teamId : teamsForR[0]?.id ?? me.teamId ?? "";
        regionId = r;
        teamId = t;
        assignedTo = me.id;
      }
    }

    const address = {
      line1: values.line1 || undefined,
      line2: values.line2 || undefined,
      city: values.city,
      state: values.state || undefined,
      pincode: values.pincode || undefined,
      country: "India" as const,
    };

    const regionName = regions.find((r) => r.id === regionId)?.name ?? "";
    const assignedUser = users.find((u) => u.id === assignedTo);

    if (editingCustomer) {
      const primary =
        editingCustomer.contacts.find((c) => c.isPrimary) ?? editingCustomer.contacts[0];
      const updates: Partial<Customer> = {
        companyName,
        customerName: customerName || undefined,
        industry: values.industry || undefined,
        website: values.website || undefined,
        status: values.status as CustomerStatus,
        address,
        gstin: values.gstin || undefined,
        pan: values.pan || undefined,
        regionId,
        regionName,
        teamId,
        assignedTo,
        assignedToName: assignedUser?.name ?? "",
        tags: uniqueTags,
      };
      updateCustomer(editingCustomer.id, updates);
      if (primary) {
        updateContact(editingCustomer.id, primary.id, {
          name: safeCustomerName,
          designation: values.contactDesignation || undefined,
          email: values.contactEmail,
          phone: values.contactPhone ? `+91 ${values.contactPhone}` : undefined,
        });
      }
      const updatedCustomer: Customer = {
        ...editingCustomer,
        ...updates,
        contacts: primary
          ? editingCustomer.contacts.map((c) =>
              c.id === primary.id
                ? {
                    ...c,
                    name: safeCustomerName,
                    designation: values.contactDesignation || undefined,
                    email: values.contactEmail,
                    phone: values.contactPhone ? `+91 ${values.contactPhone}` : undefined,
                  }
                : c
            )
          : editingCustomer.contacts,
        updatedAt: new Date().toISOString(),
      };
      await onPersist?.(updatedCustomer, "update");
      toast({ title: "Customer updated", description: `${companyName} has been updated.` });
      onSaved(updatedCustomer, "update");
    } else {
      const contactId = "cc-" + makeId();
      const contact: CustomerContact = {
        id: contactId,
        name: safeCustomerName,
        designation: values.contactDesignation || undefined,
        email: values.contactEmail,
        phone: values.contactPhone ? `+91 ${values.contactPhone}` : undefined,
        isPrimary: true,
      };
      const customerNumber = getNextCustomerNumber();
      const newCustomer: Customer = {
        id: "c" + makeId(),
        customerNumber,
        companyName,
        customerName: customerName || undefined,
        status: values.status as CustomerStatus,
        industry: values.industry || undefined,
        website: values.website || undefined,
        address,
        gstin: values.gstin || undefined,
        pan: values.pan || undefined,
        contacts: [contact],
        regionId,
        regionName,
        teamId,
        assignedTo,
        assignedToName: assignedUser?.name ?? me.name,
        tags: uniqueTags,
        notes: [],
        attachments: [],
        productLines: [],
        payments: [],
        invoices: [],
        supportTickets: [],
        activityLog: [],
        totalRevenue: 0,
        totalDealValue: 0,
        activeProposalsCount: 0,
        activeDealsCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: me.id,
      };
      addCustomer(newCustomer);
      await onPersist?.(newCustomer, "create");
      appendActivityLog(newCustomer.id, {
        id: "cal-" + makeId(),
        action: "Customer created",
        description: `Customer created by ${me.name}`,
        performedBy: me.id,
        performedByName: me.name,
        timestamp: new Date().toISOString(),
        entityType: "contact",
        entityId: newCustomer.id,
      });
      toast({ title: "Customer created", description: `${companyName} has been added.` });
      onSaved(newCustomer, "create");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogSmMax2xl}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {editingCustomer ? "Edit Customer" : "Add Customer"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          <Form {...form}>
            <form id="customer-form" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormSection title="Company Info" />
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Company Name *</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="Paridhi Group" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Customer Name</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="Vaibhav Agrawal (optional)" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Industry</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          options={INDUSTRIES.map((ind) => ({ value: ind, label: ind }))}
                          placeholder="Select industry"
                          triggerClassName="h-10 text-sm"
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Website</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="https://example.com" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={field.value}
                          onValueChange={field.onChange}
                          options={STATUS_OPTIONS}
                          placeholder="Select status"
                          triggerClassName="h-10 text-sm"
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <div className="col-span-1 sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</FormLabel>
                        <FormControl>
                          <TagsInput
                            value={normalizeExistingTags(field.value)}
                            onValueChange={(next) => field.onChange(next)}
                            suggestions={tagSuggestions}
                            placeholder="Type to search or add…"
                            aria-invalid={!!form.formState.errors.tags}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormSection title="Address" />
                <div className="col-span-1 sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="line1"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Address Line 1</FormLabel>
                        <FormControl>
                          <Input className="h-10 text-sm" placeholder="Street, building" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="line2"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Address Line 2</FormLabel>
                        <FormControl>
                          <Input className="h-10 text-sm" placeholder="Area, landmark" {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">City *</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="Mumbai" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">State</FormLabel>
                      <FormControl>
                        <SearchableSelect
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          options={INDIAN_STATES.map((st) => ({ value: st, label: st }))}
                          placeholder="Select state"
                          triggerClassName="h-10 text-sm"
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pincode"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Pincode</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="400001" maxLength={6} {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <div className="col-span-1 sm:col-span-2">
                  {(pinLookupBusy || cityLookupBusy || lookupHint) && (
                    <p className="text-[11px] text-muted-foreground">
                      {pinLookupBusy
                        ? "Fetching address from pincode…"
                        : cityLookupBusy
                          ? "Fetching pincode from city…"
                          : lookupHint}
                    </p>
                  )}
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Country</FormLabel>
                        <FormControl>
                          <Input className="h-10 text-sm" readOnly {...field} />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormSection title="GST & Legal" />
                <FormField
                  control={form.control}
                  name="gstin"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">GSTIN</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="15-character GSTIN" maxLength={15} {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pan"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">PAN</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="10-character PAN" maxLength={10} {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormSection title="Primary Contact" />
                <div className="space-y-1.5">
                  <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Name</FormLabel>
                  <div className="h-10 rounded-md border border-input bg-muted/40 px-3 text-sm flex items-center text-gray-700 dark:text-gray-200">
                    {form.watch("customerName") || form.watch("companyName") || "—"}
                  </div>
                </div>
                <FormField
                  control={form.control}
                  name="contactDesignation"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Designation</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="e.g. CTO" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Email *</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" type="email" placeholder="email@company.com" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone (10 digits)</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="9876543210" maxLength={10} {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                {assignmentVisible && (
                  <>
                    <FormSection title="Assignment" />
                    <FormField
                      control={form.control}
                      name="regionId"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Region *</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              value={field.value}
                              onValueChange={(v) => {
                                field.onChange(v);
                                form.setValue("teamId", "");
                                form.setValue("assignedTo", "");
                              }}
                              options={regions.map((r) => ({ value: r.id, label: r.name }))}
                              placeholder="Select region"
                              triggerClassName="h-10 text-sm"
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="teamId"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Team *</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              value={field.value}
                              onValueChange={(v) => {
                                field.onChange(v);
                                form.setValue("assignedTo", "");
                              }}
                              options={teamsInRegion.map((t) => ({ value: t.id, label: t.name }))}
                              placeholder="Select team"
                              emptyText="No teams in this region."
                              triggerClassName="h-10 text-sm"
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="assignedTo"
                      render={({ field }) => (
                        <FormItem className="space-y-1.5">
                          <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Assigned To *</FormLabel>
                          <FormControl>
                            <SearchableSelect
                              value={field.value}
                              onValueChange={field.onChange}
                              options={usersInTeam.map((u) => ({ value: u.id, label: u.name }))}
                              placeholder="Select user"
                              emptyText="No users in this team."
                              disabled={me.role === "sales_rep"}
                              triggerClassName="h-10 text-sm"
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </div>
            </form>
          </Form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" className="bg-blue-600 hover:bg-blue-700 text-white">
            {editingCustomer ? "Save Changes" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
