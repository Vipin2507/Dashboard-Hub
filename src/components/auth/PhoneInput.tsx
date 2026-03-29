import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { countries } from "@/constants/countries";

interface PhoneInputProps {
  value: string; // The full phone number including +code
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PhoneInput({ value, onChange, disabled }: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);
  
  // Find initial country based on value or default to India (+91)
  const initialCountry = countries.find(c => value.startsWith(c.code)) || countries.find(c => c.iso === "IN")!;
  const [selectedCountry, setSelectedCountry] = React.useState(initialCountry);
  
  // The local number part (total value minus the country code)
  const [localNumber, setLocalNumber] = React.useState(
    value.startsWith(selectedCountry.code) ? value.slice(selectedCountry.code.length) : ""
  );

  React.useEffect(() => {
    // Update the full number whenever code or local number changes
    onChange(`${selectedCountry.code}${localNumber}`);
  }, [selectedCountry, localNumber, onChange]);

  const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, ""); // Only digits
    setLocalNumber(val);
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 min-h-[44px] w-[100px] justify-between border-zinc-200 bg-white text-base text-zinc-900 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 dark:hover:text-white"
            disabled={disabled}
          >
            {selectedCountry.iso} ({selectedCountry.code})
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0 bg-zinc-900 border-zinc-800">
          <Command className="bg-zinc-900 text-white">
            <CommandInput placeholder="Search country..." className="h-9 border-none focus:ring-0" />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {countries.map((country) => (
                  <CommandItem
                    key={country.iso}
                    value={`${country.name} ${country.code}`}
                    onSelect={() => {
                      setSelectedCountry(country);
                      setOpen(false);
                    }}
                    className="flex justify-between items-center text-zinc-100 hover:bg-zinc-800 cursor-pointer"
                  >
                    <span>{country.name}</span>
                    <span className="text-zinc-400">{country.code}</span>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        selectedCountry.iso === country.iso ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        type="tel"
        placeholder="+91 Enter phone number"
        value={localNumber}
        onChange={handleLocalNumberChange}
        className="h-11 min-h-[44px] flex-1 border-zinc-200 bg-white text-base text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
        disabled={disabled}
      />
    </div>
  );
}
