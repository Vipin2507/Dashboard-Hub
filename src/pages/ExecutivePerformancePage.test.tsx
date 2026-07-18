import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const storeState = vi.hoisted(() => ({
  authUserId: "admin-1",
  users: [
    {
      id: "admin-1",
      name: "Admin",
      email: "admin@test.com",
      password: "x",
      role: "super_admin" as const,
      teamId: "t1",
      regionId: "r1",
      status: "active" as const,
    },
    {
      id: "rep-1",
      name: "Rep",
      email: "rep@test.com",
      password: "x",
      role: "sales_rep" as const,
      teamId: "t1",
      regionId: "r1",
      status: "active" as const,
    },
  ],
  teams: [{ id: "t1", name: "Team A", regionId: "r1" }],
  regions: [{ id: "r1", name: "Region A" }],
}));

vi.mock("@/store/useAppStore", () => ({
  useAppStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

vi.mock("@/components/Topbar", () => ({
  Topbar: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

vi.mock("@/hooks/useExecutivePerformanceQuery", () => ({
  useExecutivePerformanceQuery: () => ({
    data: undefined,
    isLoading: true,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    error: null,
  }),
}));

import ExecutivePerformancePage from "./ExecutivePerformancePage";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>Dashboard home</div>} />
          <Route path="/admin/executive-performance" element={<ExecutivePerformancePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ExecutivePerformancePage access", () => {
  beforeEach(() => {
    storeState.authUserId = "admin-1";
  });

  it("renders for the logged-in super admin with current-month filters", () => {
    renderAt("/admin/executive-performance");
    expect(screen.getByText("Executive performance")).toBeInTheDocument();
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Jul 2026/)).toBeInTheDocument();
  });

  it("redirects non-super-admin logged-in users to the dashboard", () => {
    storeState.authUserId = "rep-1";
    renderAt("/admin/executive-performance");
    expect(screen.getByText("Dashboard home")).toBeInTheDocument();
    expect(screen.queryByText("Executive performance")).not.toBeInTheDocument();
  });
});
