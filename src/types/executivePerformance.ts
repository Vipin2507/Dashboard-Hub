/** Filters sent to `/api/analytics/executive-performance`. */
export type ExecutivePerformanceFilters = {
  from: string;
  to: string;
  executiveId?: string;
  teamId?: string;
  regionId?: string;
  /** JS weekday: 0=Sun … 6=Sat. Omit for all days. */
  weekday?: number;
  reasonType?: "loss" | "rejection";
  reason?: string;
  detailType?: ExecutiveDetailType;
  detailPage?: number;
  detailPageSize?: number;
  actorRole: string;
  actorUserId?: string;
  actorUserName?: string;
};

export type ExecutiveDetailType =
  | "proposals_created"
  | "proposals_sent"
  | "proposals_approved"
  | "proposals_rejected"
  | "deals_created"
  | "deals_won"
  | "deals_lost"
  | "pipeline"
  | "customers_new"
  | "payments_collected"
  | "loss_reason"
  | "rejection_reason";

export type MetricCoverage =
  | "exact"
  | "legacy_fallback"
  | "approximate_customer_assignment"
  | "partial";

export type ExecutivePerformanceSummary = {
  proposalsCreated: number;
  proposalsSent: number;
  proposalsApproved: number;
  proposalsRejected: number;
  dealsCreated: number;
  dealsWon: number;
  dealsLost: number;
  winRate: number;
  wonValue: number;
  avgWonDealSize: number;
  pipelineValue: number;
  pipelineCount: number;
  customersNew: number;
  collectedRevenue: number;
  collectedPaymentCount: number;
};

export type ExecutiveTrendPoint = {
  date: string;
  proposalsCreated: number;
  dealsWon: number;
  wonValue: number;
  collectedRevenue: number;
};

export type ExecutiveRow = {
  userId: string;
  name: string;
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  proposalsCreated: number;
  proposalsApproved: number;
  proposalsRejected: number;
  dealsCreated: number;
  dealsWon: number;
  dealsLost: number;
  winRate: number;
  wonValue: number;
  avgWonDealSize: number;
  pipelineValue: number;
  customersNew: number;
  collectedRevenue: number;
};

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  value: number;
};

export type WeekdayPerformancePoint = {
  weekday: number;
  label: string;
  dealsWon: number;
  dealsLost: number;
  wonValue: number;
  proposalsCreated: number;
};

export type ReasonBucket = {
  reason: string;
  count: number;
  value: number;
};

export type ExecutiveDetailRecord = {
  id: string;
  type: "proposal" | "deal" | "customer" | "payment";
  title: string;
  subtitle?: string;
  executiveId?: string;
  executiveName?: string;
  amount?: number;
  status?: string;
  reason?: string;
  at: string;
  href?: string;
  coverage?: MetricCoverage;
};

/** One calendar day of activity for the expandable row table. */
export type ExecutiveDailyBreakdownRow = {
  date: string;
  weekday: number;
  weekdayLabel: string;
  proposalsCreated: number;
  dealsCreated: number;
  dealsWon: number;
  dealsLost: number;
  customersNew: number;
  paymentsCollected: number;
  wonValue: number;
  collectedRevenue: number;
  /** Underlying records for that day (shown when the row is expanded). */
  items: ExecutiveDetailRecord[];
};

export type ExecutivePerformanceCoverage = {
  wonLostDates: MetricCoverage;
  customerAssignment: MetricCoverage;
  collectedRevenue: MetricCoverage;
  notes: string[];
};

export type ExecutivePerformanceResponse = {
  filters: {
    from: string;
    to: string;
    executiveId: string | null;
    teamId: string | null;
    regionId: string | null;
    weekday: number | null;
    reasonType: "loss" | "rejection" | null;
    reason: string | null;
  };
  summary: ExecutivePerformanceSummary;
  trend: ExecutiveTrendPoint[];
  executives: ExecutiveRow[];
  funnel: FunnelStep[];
  weekdayPerformance: WeekdayPerformancePoint[];
  lossReasons: ReasonBucket[];
  rejectionReasons: ReasonBucket[];
  /** Day-by-day counts + expandable detail items for the filtered range. */
  dailyBreakdown: ExecutiveDailyBreakdownRow[];
  details: {
    type: ExecutiveDetailType | null;
    page: number;
    pageSize: number;
    total: number;
    rows: ExecutiveDetailRecord[];
  };
  coverage: ExecutivePerformanceCoverage;
  generatedAt: string;
};
