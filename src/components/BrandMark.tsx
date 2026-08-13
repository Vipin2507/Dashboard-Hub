import { cn } from "@/lib/utils";

export function BrandMark({ className, glow = false }: { className?: string; glow?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground",
        glow && "shadow-brand",
        className,
      )}
      aria-hidden
    >
      B
    </div>
  );
}
