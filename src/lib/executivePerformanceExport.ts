import * as XLSX from "xlsx";
import { formatINR } from "@/lib/rbac";
import type { ExecutivePerformanceResponse } from "@/types/executivePerformance";

export function exportExecutivePerformanceXlsx(data: ExecutivePerformanceResponse) {
  const wb = XLSX.utils.book_new();
  const s = data.summary;

  const summaryRows = [
    { Metric: "From", Value: data.filters.from },
    { Metric: "To", Value: data.filters.to },
    { Metric: "Proposals created", Value: s.proposalsCreated },
    { Metric: "Proposals sent", Value: s.proposalsSent },
    { Metric: "Proposals approved", Value: s.proposalsApproved },
    { Metric: "Proposals rejected", Value: s.proposalsRejected },
    { Metric: "Deals created", Value: s.dealsCreated },
    { Metric: "Deals won", Value: s.dealsWon },
    { Metric: "Deals lost", Value: s.dealsLost },
    { Metric: "Win rate %", Value: s.winRate },
    { Metric: "Won value", Value: s.wonValue },
    { Metric: "Avg won deal size", Value: s.avgWonDealSize },
    { Metric: "Pipeline value", Value: s.pipelineValue },
    { Metric: "Pipeline count", Value: s.pipelineCount },
    { Metric: "New customers", Value: s.customersNew },
    { Metric: "Collected revenue", Value: s.collectedRevenue },
    { Metric: "Collected payments", Value: s.collectedPaymentCount },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");

  const execRows = data.executives.map((e) => ({
    Executive: e.name,
    Team: e.teamName,
    Region: e.regionName,
    "Proposals created": e.proposalsCreated,
    "Proposals approved": e.proposalsApproved,
    "Proposals rejected": e.proposalsRejected,
    "Deals created": e.dealsCreated,
    "Deals won": e.dealsWon,
    "Deals lost": e.dealsLost,
    "Win rate %": e.winRate,
    "Won value": e.wonValue,
    "Avg won deal": e.avgWonDealSize,
    "Pipeline value": e.pipelineValue,
    "New customers": e.customersNew,
    "Collected revenue": e.collectedRevenue,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execRows), "Employees");

  const reasonRows = [
    ...data.lossReasons.map((r) => ({
      Type: "Deal loss",
      Reason: r.reason,
      Count: r.count,
      Value: r.value,
      "Value (INR)": formatINR(r.value),
    })),
    ...data.rejectionReasons.map((r) => ({
      Type: "Proposal rejection",
      Reason: r.reason,
      Count: r.count,
      Value: r.value,
      "Value (INR)": formatINR(r.value),
    })),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reasonRows), "Reasons");

  const detailRows = data.details.rows.map((r) => ({
    Type: r.type,
    Title: r.title,
    Subtitle: r.subtitle ?? "",
    Executive: r.executiveName ?? "",
    Amount: r.amount ?? "",
    Status: r.status ?? "",
    Reason: r.reason ?? "",
    At: r.at,
    Link: r.href ?? "",
    Coverage: r.coverage ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Details");

  const dailyRows = (data.dailyBreakdown ?? []).map((d) => ({
    Date: d.date,
    Weekday: d.weekdayLabel,
    Proposals: d.proposalsCreated,
    "Deals created": d.dealsCreated,
    "Deals won": d.dealsWon,
    "Deals lost": d.dealsLost,
    Customers: d.customersNew,
    Payments: d.paymentsCollected,
    "Won value": d.wonValue,
    "Collected revenue": d.collectedRevenue,
    "Detail rows": d.items.length,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyRows), "Daily");

  const stamp = data.filters.from + "_" + data.filters.to;
  XLSX.writeFile(wb, `executive_performance_${stamp}.xlsx`);
}
