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
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          fontSize: "var(--text-sm)",
        },
      }}
    />
  );
}
