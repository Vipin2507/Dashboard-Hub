import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAppStore } from "@/store/useAppStore";
import type { AutomationChannel, AutomationTemplate } from "@/types";
import type { Deal } from "@/types";
import { sendAutomationTemplateById } from "@/lib/automationService";

export function SendEstimateDialog({
  open,
  onClose,
  deal,
  channel,
  defaultEmail,
  defaultPhone,
  defaultCustomerName,
}: {
  open: boolean;
  onClose: () => void;
  deal: Deal;
  channel: Extract<AutomationChannel, "email" | "whatsapp">;
  defaultEmail?: string;
  defaultPhone?: string;
  defaultCustomerName?: string;
}) {
  const users = useAppStore((s) => s.users);
  const templates = useAppStore((s) => s.automationTemplates);

  const eligible = useMemo(
    () =>
      templates.filter(
        (t) => t.isActive && t.trigger === "estimate_shared" && t.channel === channel,
      ),
    [templates, channel],
  );

  const [templateId, setTemplateId] = useState("");
  const template: AutomationTemplate | undefined = useMemo(
    () => eligible.find((t) => t.id === templateId),
    [eligible, templateId],
  );

  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail ?? "");
    setPhone(defaultPhone ?? "");
    setTemplateId(eligible[0]?.id ?? "");
  }, [open, defaultEmail, defaultPhone, eligible]);

  const preview = useMemo(() => {
    if (!template) return { subject: "", body: "" };
    // Preview uses the same variable resolver used at send time
    // (sendAutomationTemplateById does the resolution).
    return { subject: template.subject ?? "", body: template.body ?? "" };
  }, [template]);

  const title = channel === "email" ? "Send Estimate via Email" : "Send Estimate via WhatsApp";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {eligible.length === 0 && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No active templates found for <strong>estimate_shared</strong> ({channel}). Create one in Automation → Templates.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId} disabled={eligible.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {channel === "email" ? (
              <div className="space-y-2">
                <Label>To (Email)</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>To (WhatsApp)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
              </div>
            )}
          </div>

          {channel === "email" && (
            <div className="space-y-2">
              <Label>Subject (preview)</Label>
              <Input value={preview.subject} readOnly />
            </div>
          )}

          <div className="space-y-2">
            <Label>Message (preview)</Label>
            <Textarea value={preview.body} readOnly rows={6} />
            <p className="text-xs text-muted-foreground">
              Variables are resolved when you click Send.
            </p>
          </div>
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={sending || !templateId || (channel === "email" ? !email.trim() : !phone.trim())}
            onClick={async () => {
              if (!templateId) return;
              if (channel === "email" && !email.trim()) return toast.error("Email is required");
              if (channel === "whatsapp" && !phone.trim()) return toast.error("Phone is required");
              setSending(true);
              try {
                await sendAutomationTemplateById(templateId, {
                  dealId: deal.id,
                  dealTitle: deal.name,
                  dealValue: deal.value,
                  estimateNumber: deal.estimateNumber ?? undefined,
                  estimateJson: deal.estimateJson ?? undefined,
                  customerId: deal.customerId,
                  customerName: defaultCustomerName,
                  customerEmail: channel === "email" ? email.trim() : undefined,
                  customerPhone: channel === "whatsapp" ? phone.trim() : undefined,
                  salesRepId: deal.ownerUserId,
                    salesRepName: users.find((u) => u.id === deal.ownerUserId)?.name,
                  companyName: "CRAVINGCODE TECHNOLOGIES PVT. LTD.",
                });
                toast.success("Sent");
                onClose();
              } catch (e: any) {
                toast.error(e?.message || "Failed to send");
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

