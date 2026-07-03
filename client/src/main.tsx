import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import AppRouter from "./router";
import { AIProvider } from "./contexts/AIContext";
import { Toaster } from "./components/ui/toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AIProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <AppRouter />
            <Toaster />
          </BrowserRouter>
        </ErrorBoundary>
      </AIProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
