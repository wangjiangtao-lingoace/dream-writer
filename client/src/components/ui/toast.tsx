import { toast, Toaster as SonnerToaster } from "sonner";

export { toast };

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        },
      }}
    />
  );
}
