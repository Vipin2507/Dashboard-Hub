export type AutomationTrigger =
  | "proposal_sent"
  | "proposal_follow_up"
  | "proposal_approved"
  | "proposal_rejected"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "deal_follow_up"
  | "payment_due"
  | "payment_received"
  | "invoice_overdue"
  | "subscription_expiring"
  | "subscription_renewal_30d"
  | "subscription_expiry_day"
  | "subscription_overdue"
  | "subscription_renewed_confirm";

export type AutomationChannel = "whatsapp" | "email" | "sms" | "in_app";

export type AutomationRecipient =
  | "customer"
  | "sales_rep"
  | "sales_manager"
  | "finance"
  | "super_admin";

export interface AutomationTemplate {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  channel: AutomationChannel;
  recipients: AutomationRecipient[];
  subject?: string; // for email only
  body: string; // supports {{variables}}
  isActive: boolean;
  delayHours?: number; // for follow-up: send after X hours
  repeatEveryHours?: number; // repeat interval (0 = send once)
  maxRepeats?: number; // max times to repeat
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLog {
  id: string;
  templateId: string;
  templateName: string;
  trigger: AutomationTrigger;
  channel: AutomationChannel;
  recipient: string; // phone/email/userId
  recipientName: string;
  entityType: "proposal" | "deal" | "customer" | "invoice";
  entityId: string;
  entityName: string;
  status: "sent" | "failed" | "pending" | "skipped";
  errorMessage?: string;
  sentAt: string;
  n8nExecutionId?: string;
}

export interface AutomationSettings {
  n8nWebhookBase: string; // e.g. "http://72.60.200.185:5678/webhook"
  wahaApiUrl: string; // e.g. "http://72.60.200.185:3000"
  wahaApiKey: string;
  wahaSession: string; // WAHA session name, default "default"
  wahaFromNumber: string; // WhatsApp number linked in WAHA
  emailFromAddress: string;
  emailFromName: string;
  isWahaConnected: boolean;
  isN8nConnected: boolean;
}

export const TEMPLATE_VARIABLES: Record<AutomationTrigger, string[]> = {
  proposal_sent: [
    "{{customer_name}}",
    "{{proposal_number}}",
    "{{proposal_title}}",
    "{{grand_total}}",
    "{{valid_until}}",
    "{{sales_rep_name}}",
    "{{sales_rep_phone}}",
    "{{company_name}}",
  ],
  proposal_follow_up: [
    "{{customer_name}}",
    "{{proposal_number}}",
    "{{proposal_title}}",
    "{{grand_total}}",
    "{{days_since_sent}}",
    "{{valid_until}}",
    "{{sales_rep_name}}",
    "{{sales_rep_phone}}",
  ],
  proposal_approved: [
    "{{customer_name}}",
    "{{proposal_number}}",
    "{{proposal_title}}",
    "{{approved_by}}",
    "{{grand_total}}",
    "{{plan_name}}",
    "{{next_due_date}}",
    "{{sales_rep_name}}",
  ],
  proposal_rejected: [
    "{{customer_name}}",
    "{{proposal_number}}",
    "{{rejection_reason}}",
    "{{sales_rep_name}}",
  ],
  deal_created: [
    "{{deal_id}}",
    "{{deal_title}}",
    "{{deal_value}}",
    "{{customer_name}}",
    "{{sales_rep_name}}",
    "{{company_name}}",
  ],
  deal_won: [
    "{{customer_name}}",
    "{{deal_title}}",
    "{{deal_value}}",
    "{{sales_rep_name}}",
    "{{company_name}}",
  ],
  deal_lost: [
    "{{customer_name}}",
    "{{deal_title}}",
    "{{deal_value}}",
    "{{loss_reason}}",
    "{{sales_rep_name}}",
  ],
  deal_follow_up: [
    "{{customer_name}}",
    "{{deal_title}}",
    "{{next_follow_up_date}}",
    "{{deal_value}}",
    "{{sales_rep_name}}",
  ],
  payment_due: [
    "{{customer_name}}",
    "{{invoice_number}}",
    "{{amount_due}}",
    "{{due_date}}",
    "{{days_until_due}}",
    "{{sales_rep_name}}",
  ],
  payment_received: [
    "{{customer_name}}",
    "{{customer_id}}",
    "{{amount_paid}}",
    "{{payment_date}}",
    "{{invoice_number}}",
    "{{receipt_number}}",
    "{{plan_name}}",
    "{{payments_made_count}}",
    "{{payments_remaining_count}}",
    "{{next_due_date}}",
    "{{plan_details}}",
    "{{sales_rep_name}}",
  ],
  invoice_overdue: [
    "{{customer_name}}",
    "{{invoice_number}}",
    "{{amount_due}}",
    "{{due_date}}",
    "{{days_overdue}}",
    "{{sales_rep_name}}",
  ],
  subscription_expiring: [
    "{{customer_name}}",
    "{{product_name}}",
    "{{expiry_date}}",
    "{{days_until_expiry}}",
    "{{sales_rep_name}}",
  ],
  subscription_renewal_30d: [
    "{{customer_name}}",
    "{{plan_name}}",
    "{{expiry_date}}",
    "{{renewal_amount}}",
    "{{renewal_link}}",
    "{{sales_rep_name}}",
  ],
  subscription_expiry_day: [
    "{{customer_name}}",
    "{{plan_name}}",
    "{{expiry_date}}",
    "{{renewal_amount}}",
    "{{renewal_link}}",
    "{{sales_rep_name}}",
  ],
  subscription_overdue: [
    "{{customer_name}}",
    "{{plan_name}}",
    "{{expiry_date}}",
    "{{renewal_amount}}",
    "{{renewal_link}}",
    "{{days_overdue}}",
    "{{sales_rep_name}}",
  ],
  subscription_renewed_confirm: [
    "{{customer_name}}",
    "{{plan_name}}",
    "{{plan_start_date}}",
    "{{expiry_date}}",
    "{{sales_rep_name}}",
  ],
};

