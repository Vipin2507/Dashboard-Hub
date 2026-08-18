import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Datepicker, dateToYmd, ymdToDate } from "@/components/ui/datepicker";
import {
  TIME_RANGE_OPTIONS,
  resolveTimeRangeYmd,
  type TimeRangePreset,
} from "@/lib/dateRange";

export function TimeRangeFilter({
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomChange,
  customPlaceholder = "Custom dates…",
}: {
  preset: TimeRangePreset;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: TimeRangePreset) => void;
  onCustomChange: (from: string, to: string) => void;
  customPlaceholder?: string;
}) {
  return (
    <>
      <Select
        value={preset}
        onValueChange={(v) => {
          const next = v as TimeRangePreset;
          if (next === "custom" && !customFrom && !customTo) {
            const prev = resolveTimeRangeYmd(preset, customFrom, customTo);
            onCustomChange(prev.from, prev.to);
          }
          onPresetChange(next);
        }}
      >
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder="All time" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" ? (
        <Datepicker
          controls={["calendar"]}
          select="range"
          touchUi={true}
          inputComponent="input"
          inputProps={{
            placeholder: customPlaceholder,
            className: "h-9 w-full text-sm",
          }}
          value={[ymdToDate(customFrom), ymdToDate(customTo)]}
          onChange={(ev) => {
            const [f, t] = ev.value as [Date | null, Date | null];
            onCustomChange(f ? dateToYmd(f) : "", t ? dateToYmd(t) : "");
          }}
        />
      ) : null}
    </>
  );
}
