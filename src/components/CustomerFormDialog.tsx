import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
function FormSection({ title }: { title: string }) {
  return (
    <div className="col-span-2 flex items-center gap-3 pt-2">
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
  industry: z.string().optional(),
  website: z
    .string()
    .optional()
    .refine((v) => !v || /^https?:\/\/.+/.test(v), "Enter a valid URL"),
  status: z.enum(["active", "inactive", "lead", "churned", "blacklisted"]),
  tags: z.string().optional(),
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
  contactName: z.string().min(1, "Contact name is required"),
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

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCustomer: Customer | null;
  onSaved: () => void;
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


  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: "",
      industry: "",
      website: "",
      status: "lead",
      tags: "",
      line1: "",
      line2: "",
      city: "",
      state: "",
      pincode: "",
      country: "India",
      gstin: "",
      pan: "",
      contactName: "",
      contactDesignation: "",
      contactEmail: "",
      contactPhone: "",
      regionId: regions[0]?.id ?? "",
      teamId: "",
      assignedTo: me.role === "sales_rep" ? me.id : "",
    },
  });

  const regionId = form.watch("regionId");
  const teamsInRegion = teams.filter((t) => t.regionId === regionId);
  const teamId = form.watch("teamId");
  const usersInTeam = users.filter((u) => u.teamId === teamId);

  useEffect(() => {
    if (!open) return;
    if (editingCustomer) {
      const primary =
        editingCustomer.contacts.find((c) => c.isPrimary) ?? editingCustomer.contacts[0];
      form.reset({
        companyName: editingCustomer.companyName,
        industry: editingCustomer.industry ?? "",
        website: editingCustomer.website ?? "",
        status: editingCustomer.status,
        tags: editingCustomer.tags.join(", "),
        line1: editingCustomer.address?.line1 ?? "",
        line2: editingCustomer.address?.line2 ?? "",
        city: editingCustomer.address?.city ?? "",
        state: editingCustomer.address?.state ?? "",
        pincode: editingCustomer.address?.pincode ?? "",
        country: "India",
        gstin: editingCustomer.gstin ?? "",
        pan: editingCustomer.pan ?? "",
        contactName: primary?.name ?? "",
        contactDesignation: primary?.designation ?? "",
        contactEmail: primary?.email ?? "",
        contactPhone: primary?.phone?.replace(/\D/g, "").slice(-10) ?? "",
        regionId: editingCustomer.regionId,
        teamId: editingCustomer.teamId,
        assignedTo: editingCustomer.assignedTo,
      });
    } else {
      form.reset({
        companyName: "",
        industry: "",
        website: "",
        status: "lead",
        tags: "",
        line1: "",
        line2: "",
        city: "",
        state: "",
        pincode: "",
        country: "India",
        gstin: "",
        pan: "",
        contactName: "",
        contactDesignation: "",
        contactEmail: "",
        contactPhone: "",
        regionId: regions[0]?.id ?? "",
        teamId: teamsInRegion[0]?.id ?? "",
        assignedTo:
          me.role === "sales_rep"
            ? me.id
            : (teamsInRegion[0] ? users.find((u) => u.teamId === teamsInRegion[0]?.id)?.id : undefined) ?? "",
      });
    }
  }, [open, editingCustomer?.id]);

  useEffect(() => {
    if (!regionId) return;
    const firstTeam = teamsInRegion[0];
    if (firstTeam && !form.getValues("teamId")) form.setValue("teamId", firstTeam.id);
  }, [regionId, teamsInRegion]);

  const getNextCustomerNumber = () => {
    const nums = customers
      .map((c) => parseInt(c.customerNumber.replace(/^CUST-0*/, ""), 10))
      .filter((n) => !Number.isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `CUST-${String(next).padStart(4, "0")}`;
  };

  const onSubmit = async (values: FormValues) => {
    const tags = [
      ...(editingCustomer?.tags ?? []),
      ...values.tags
        ?.split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean) ?? [],
    ];
    const uniqueTags = Array.from(new Set(tags));

    const address = {
      line1: values.line1 || undefined,
      line2: values.line2 || undefined,
      city: values.city,
      state: values.state || undefined,
      pincode: values.pincode || undefined,
      country: "India" as const,
    };

    const regionName = regions.find((r) => r.id === values.regionId)?.name ?? "";
    const assignedUser = users.find((u) => u.id === values.assignedTo);

    if (editingCustomer) {
      const primary =
        editingCustomer.contacts.find((c) => c.isPrimary) ?? editingCustomer.contacts[0];
      const updates: Partial<Customer> = {
        companyName: values.companyName,
        industry: values.industry || undefined,
        website: values.website || undefined,
        status: values.status as CustomerStatus,
        address,
        gstin: values.gstin || undefined,
        pan: values.pan || undefined,
        regionId: values.regionId,
        regionName,
        teamId: values.teamId,
        assignedTo: values.assignedTo,
        assignedToName: assignedUser?.name ?? "",
        tags: uniqueTags,
      };
      updateCustomer(editingCustomer.id, updates);
      if (primary) {
        updateContact(editingCustomer.id, primary.id, {
          name: values.contactName,
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
                    name: values.contactName,
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
      toast({ title: "Customer updated", description: `${values.companyName} has been updated.` });
    } else {
      const contactId = "cc-" + makeId();
      const contact: CustomerContact = {
        id: contactId,
        name: values.contactName,
        designation: values.contactDesignation || undefined,
        email: values.contactEmail,
        phone: values.contactPhone ? `+91 ${values.contactPhone}` : undefined,
        isPrimary: true,
      };
      const customerNumber = getNextCustomerNumber();
      const newCustomer: Customer = {
        id: "c" + makeId(),
        customerNumber,
        companyName: values.companyName,
        status: values.status as CustomerStatus,
        industry: values.industry || undefined,
        website: values.website || undefined,
        address,
        gstin: values.gstin || undefined,
        pan: values.pan || undefined,
        contacts: [contact],
        regionId: values.regionId,
        regionName,
        teamId: values.teamId,
        assignedTo: values.assignedTo,
        assignedToName: assignedUser?.name ?? "",
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
      toast({ title: "Customer created", description: `${values.companyName} has been added.` });
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">
            {editingCustomer ? "Edit Customer" : "Add Customer"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Form {...form}>
            <form id="customer-form" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <FormSection title="Company Info" />
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Company Name *</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="Acme Pvt Ltd" {...field} />
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
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue placeholder="Select industry" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDUSTRIES.map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="churned">Churned</SelectItem>
                          <SelectItem value="blacklisted">Blacklisted</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</FormLabel>
                        <FormControl>
                          <Input
                            className="h-10 text-sm"
                            placeholder="Type and press Enter to add (comma-separated)"
                            value={field.value ?? ""}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </div>

                <FormSection title="Address" />
                <div className="col-span-2">
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
                <div className="col-span-2">
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
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDIAN_STATES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {st}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                <div className="col-span-2">
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
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Name *</FormLabel>
                      <FormControl>
                        <Input className="h-10 text-sm" placeholder="Full name" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
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

                <FormSection title="Assignment" />
                <FormField
                  control={form.control}
                  name="regionId"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">Region *</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue("teamId", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {regions.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue("assignedTo", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamsInRegion.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={me.role === "sales_rep"}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {users
                            .filter((u) => u.teamId === form.watch("teamId"))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-950">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" className="bg-blue-600 hover:bg-blue-700 text-white">
            {editingCustomer ? "Save Changes" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
