import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="gap-2"
    >
      <InputOTPGroup className="gap-2">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <InputOTPSlot
            key={idx}
            index={idx}
            className="w-12 h-12 border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white text-lg font-semibold focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
