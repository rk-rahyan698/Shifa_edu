"use client";

/**
 * `Toast` (T-051) — the confirmation surface for admin writes.
 *
 * §A-5.1's write pipeline ends with "200 + toast", so this is the last stage of
 * every mutation the admin panel performs. Two properties follow from that and
 * shape the implementation:
 *
 * **It must be announced, not merely displayed.** The viewport is an ARIA live
 * region, so a save confirmed only visually still reaches a screen-reader user.
 * Errors use `role="alert"` and `aria-live="assertive"` because a failed save
 * must interrupt; successes are `polite` and wait for a pause in speech.
 *
 * **An error toast does not disappear on its own.** Success messages
 * auto-dismiss because the admin already knows what they did; a failure is
 * information they have not seen yet, and a message that vanishes after four
 * seconds is a message that will be missed by anyone who looked away. Errors
 * stay until dismissed.
 *
 * Colour never carries the meaning alone (design-system.md §9): each variant has
 * a text label and an icon glyph as well as its border tint. Success Green is
 * 4.02:1 and is restricted to the border and icon, never to the message text.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info";

export type Toast = {
  id: string;
  variant: ToastVariant;
  message: string;
};

/** How long a self-dismissing toast lives. Errors ignore this — see the header. */
const AUTO_DISMISS_MS = 4000;

type ToastContextValue = {
  toasts: readonly Toast[];
  show: (variant: ToastVariant, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === null) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  // Timers are tracked so a manual dismiss cancels the pending auto-dismiss
  // rather than leaving it to fire against an id that no longer exists.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (variant: ToastVariant, message: string) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      setToasts((current) => [...current, { id, variant, message }]);

      if (variant !== "error") {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
        );
      }
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      show,
      dismiss,
      success: (message: string) => show("success", message),
      error: (message: string) => show("error", message),
    }),
    [toasts, show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

const VARIANT_STYLES: Readonly<Record<ToastVariant, string>> = {
  success: "border-l-success",
  error: "border-l-danger",
  info: "border-l-teal",
};

const VARIANT_GLYPHS: Readonly<Record<ToastVariant, string>> = {
  success: "✓",
  error: "!",
  info: "i",
};

/**
 * The live region. Rendered once by the provider.
 *
 * Two regions rather than one: `assertive` and `polite` cannot be mixed in a
 * single container, and an error that waits politely behind a queue of success
 * messages is an error the admin acts too late on.
 */
function ToastViewport() {
  const { toasts, dismiss } = useToast();

  const polite = toasts.filter((toast) => toast.variant !== "error");
  const assertive = toasts.filter((toast) => toast.variant === "error");

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
      <div aria-live="assertive" role="alert" className="contents">
        {assertive.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
      <div aria-live="polite" className="contents">
        {polite.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      data-variant={toast.variant}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-border border-l-4 bg-surface p-4 shadow-card ${VARIANT_STYLES[toast.variant]}`}
    >
      <span aria-hidden="true" className="font-semibold text-ink-muted">
        {VARIANT_GLYPHS[toast.variant]}
      </span>
      {/* Charcoal Ink, not the variant colour — §9 keeps message text at AA. */}
      <p className="flex-1 text-control text-ink">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded-btn px-2 text-ink-muted hover:text-ink"
        aria-label="Dismiss"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
