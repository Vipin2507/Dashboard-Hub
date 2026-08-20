export type SalesTargetValues = {
  proposalsSentTarget: number;
  proposalsWonTarget: number;
  revenueExclGstTarget: number;
};

export type SalesTargetsExecutive = SalesTargetValues & {
  userId: string;
  name: string;
  role: string;
};

export type SalesTargetsResponse = {
  month: string;
  org: SalesTargetValues;
  executives: SalesTargetsExecutive[];
};
