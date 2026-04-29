import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type TagsInputProps = {
  value: string[];
  onValueChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  className?: string;
};

function normalizeTag(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

export function TagsInput({
  value,
  onValueChange,
  suggestions = [],
  placeholder = "Add tag…",
  disabled,
  className,
  "aria-invalid": ariaInvalid,
}: TagsInputProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selected = React.useMemo(() => value.map(normalizeTag).filter(Boolean), [value]);
  const selectedLower = React.useMemo(() => new Set(selected.map((t) => t.toLowerCase())), [selected]);

  const allSuggestions = React.useMemo(() => {
    const uniq = new Map<string, string>();
    for (const t of suggestions.map(normalizeTag).filter(Boolean)) {
      const key = t.toLowerCase();
      if (!uniq.has(key)) uniq.set(key, t);
    }
    return Array.from(uniq.values()).sort((a, b) => a.localeCompare(b));
  }, [suggestions]);

  const filteredSuggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? allSuggestions.filter((t) => t.toLowerCase().includes(q))
      : allSuggestions;
    return list.filter((t) => !selectedLower.has(t.toLowerCase()));
  }, [allSuggestions, query, selectedLower]);

  const canCreate = React.useMemo(() => {
    const t = normalizeTag(query);
    if (!t) return false;
    if (selectedLower.has(t.toLowerCase())) return false;
    const exists = allSuggestions.some((s) => s.toLowerCase() === t.toLowerCase());
    return !exists;
  }, [allSuggestions, query, selectedLower]);

  const addTag = React.useCallback(
    (raw: string) => {
      const t = normalizeTag(raw);
      if (!t) return;
      if (selectedLower.has(t.toLowerCase())) return;
      onValueChange([...selected, t]);
      setQuery("");
      // keep open for rapid entry
      setOpen(true);
      queueMicrotask(() => inputRef.current?.focus());
    },
    [onValueChange, selected, selectedLower],
  );

  const removeTag = React.useCallback(
    (t: string) => {
      const key = t.toLowerCase();
      onValueChange(selected.filter((x) => x.toLowerCase() !== key));
      queueMicrotask(() => inputRef.current?.focus());
    },
    [onValueChange, selected],
  );

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(query);
      return;
    }
    if (e.key === "Backspace" && !query && selected.length) {
      e.preventDefault();
      removeTag(selected[selected.length - 1]!);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
  };

  return (
    <Popover modal={false} open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            ariaInvalid ? "border-destructive focus-within:ring-destructive" : "",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-text",
            className,
          )}
          onMouseDown={(e) => {
            if (disabled) return;
            // Avoid losing focus to trigger toggle; PopoverAnchor does not toggle on click.
            e.preventDefault();
            inputRef.current?.focus();
            setOpen(true);
          }}
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.map((t) => (
              <span
                key={t.toLowerCase()}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                  "bg-blue-50 text-blue-700 border border-blue-100",
                  "dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900",
                )}
              >
                <span className="max-w-[12rem] truncate">{t}</span>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded-full",
                    "text-blue-700/80 hover:text-blue-900 hover:bg-blue-100",
                    "dark:text-blue-200/80 dark:hover:text-blue-100 dark:hover:bg-blue-900/40",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(t);
                  }}
                  aria-label={`Remove ${t}`}
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              value={query}
              disabled={disabled}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => !disabled && setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={selected.length ? "" : placeholder}
              className={cn(
                "min-w-[8rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground",
                "py-0.5 text-sm",
              )}
            />
          </div>
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheelCapture={(e) => {
          // Prevent the DialogBody from stealing mouse-wheel scroll.
          e.stopPropagation();
        }}
      >
        <div className="max-h-64 overflow-auto p-1">
          {canCreate && (
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start text-sm"
              onClick={() => addTag(query)}
            >
              + Add tag “{normalizeTag(query)}”
            </Button>
          )}
          {filteredSuggestions.length ? (
            filteredSuggestions.map((t) => (
              <Button
                key={t.toLowerCase()}
                type="button"
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => addTag(t)}
              >
                {t}
              </Button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query.trim() ? "No matching tags." : "No tags yet."}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

