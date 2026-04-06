import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { toast } from "@/hooks/use-toast";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      onError: (error: unknown) => {
        toast({
          title: "Something went wrong",
          description: error instanceof Error ? error.message : "Please try again",
          variant: "destructive",
        });
      },
    },
  },
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    "<p style=\"font-family:system-ui;padding:2rem\">Missing #root element. Check index.html.</p>";
} else {
  createRoot(rootEl).render(
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </RootErrorBoundary>,
  );
}
