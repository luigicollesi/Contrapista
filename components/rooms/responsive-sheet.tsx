import type { ReactNode } from "react";

type ResponsiveSheetProps = {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  backdropClassName?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  role?: "dialog" | "alertdialog";
  side?: "center" | "right";
  zIndexClassName?: string;
};

export function ResponsiveSheet({
  ariaLabel,
  ariaLabelledBy,
  backdropClassName = "bg-black/70",
  children,
  className = "",
  contentClassName = "",
  role = "dialog",
  side = "center",
  zIndexClassName = "z-50",
}: ResponsiveSheetProps) {
  return (
    <div
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-modal="true"
      className={`fixed inset-0 ${zIndexClassName} flex min-h-dvh items-end px-0 pt-6 sm:px-4 sm:py-6 ${side === "right" ? "justify-end sm:items-stretch sm:pr-0 sm:py-0" : "justify-center sm:items-center"} ${backdropClassName} ${className}`}
      role={role}
    >
      <section
        className={`max-h-[calc(100dvh-1rem)] w-full overscroll-contain overflow-y-auto rounded-t-lg pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl ${side === "right" ? "sm:max-h-dvh sm:h-dvh sm:rounded-none sm:pb-0" : "sm:rounded-lg sm:pb-0"} ${contentClassName}`}
      >
        {children}
      </section>
    </div>
  );
}
