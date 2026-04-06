import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  "aria-invalid"?: boolean;
};

/**
 * Combobox-style select with typeahead — use for long option lists in forms.
 * Uses `modal={false}` on Popover so it works inside Dialogs without focus issues.
 */
export const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(
  (
    {
      value,
      onValueChange,
      options,
      placeholder = "Select…",
      searchPlaceholder = "Search…",
      emptyText = "No results found.",
      disabled,
      className,
      triggerClassName,
      "aria-invalid": ariaInvalid,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const selected = options.find((o) => o.value === value);

    return (
      <Popover modal={false} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={ariaInvalid}
            disabled={disabled}
            className={cn("h-10 w-full justify-between font-normal px-3", triggerClassName, className)}
          >
            <span className="truncate text-left">
              {selected ? (
                selected.label
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    disabled={opt.disabled}
                    onSelect={() => {
                      onValueChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === opt.value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);
SearchableSelect.displayName = "SearchableSelect";
