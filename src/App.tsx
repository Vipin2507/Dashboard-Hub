import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import DealsPage from "@/pages/DealsPage";
import Proposals from "@/pages/Proposals";
import Customers from "@/pages/Customers";
import CustomerProfile from "@/pages/CustomerProfile";
import UsersPage from "@/pages/UsersPage";
import TeamsPage from "@/pages/TeamsPage";
import RegionsPage from "@/pages/RegionsPage";
import EmailLogPage from "@/pages/EmailLogPage";
import MastersPage from "@/pages/MastersPage";
import Inventory from "@/pages/Inventory";
import PaymentsPage from "@/pages/PaymentsPage";
import Automation from "@/pages/Automation";
import DataControlCenterPage from "@/pages/DataControlCenterPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import NotFound from "./pages/NotFound.tsx";
import { useAppStore } from "@/store/useAppStore";
import { apiUrl } from "@/lib/api";

function DataBootstrapper() {
  const setRegions = useAppStore((s) => s.setRegions);
  const setTeams = useAppStore((s) => s.setTeams);
  const setUsers = useAppStore((s) => s.setUsers);
  const setNotifications = useAppStore((s) => s.setNotifications);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [regionsRes, teamsRes, usersRes, notificationsRes] = await Promise.all([
          fetch(apiUrl("/api/regions")),
          fetch(apiUrl("/api/teams")),
          fetch(apiUrl("/api/users")),
          fetch(apiUrl("/api/notifications")),
        ]);
        if (!mounted) return;
        if (regionsRes.ok) setRegions(await regionsRes.json());
        if (teamsRes.ok) setTeams(await teamsRes.json());
        if (usersRes.ok) setUsers(await usersRes.json());
        if (notificationsRes.ok) setNotifications(await notificationsRes.json());
      } catch {
        // Keep local seeded data if backend isn't reachable.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setRegions, setTeams, setUsers, setNotifications]);

  return null;
}

const App = () => (
  <>
    <DataBootstrapper />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/proposals" element={<Proposals />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerProfile />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/regions" element={<RegionsPage />} />
            <Route path="/email-log" element={<EmailLogPage />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/masters" element={<MastersPage />} />
            <Route path="/automation" element={<Automation />} />
            <Route path="/admin/data-control" element={<DataControlCenterPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </>
);

export default App;
