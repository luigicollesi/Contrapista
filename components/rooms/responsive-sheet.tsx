import type { ReactNode } from "react";

type ResponsiveSheetProps = {
  ariaLabelledBy?: string;
  backdropClassName?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  role?: "dialog" | "alertdialog";
  zIndexClassName?: string;
};

export function ResponsiveSheet({
  ariaLabelledBy,
  backdropClassName = "bg-black/70",
  children,
  className = "",
  contentClassName = "",
  role = "dialog",
  zIndexClassName = "z-50",
}: ResponsiveSheetProps) {
  return (
    <div
      aria-labelledby={ariaLabelledBy}
      aria-modal="true"
      className={`fixed inset-0 ${zIndexClassName} flex min-h-dvh items-end justify-center px-0 pt-6 sm:items-center sm:px-4 sm:py-6 ${backdropClassName} ${className}`}
      role={role}
    >
      <section
        className={`max-h-[calc(100dvh-1rem)] w-full overflow-y-auto rounded-t-lg pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-lg sm:pb-0 ${contentClassName}`}
      >
        {children}
      </section>
    </div>
  );
}
