import { useState } from "react";
import { OtpInput } from "./OtpInput";
import { PhoneInput } from "./PhoneInput";
import { PolicyModals } from "./PolicyModals";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoginCardProps {
  phoneNumber: string;
  setPhoneNumber: (val: string) => void;
  otp: string;
  setOtp: (val: string) => void;
  step: "phone" | "otp";
  setStep: (step: "phone" | "otp") => void;
  loading: boolean;
  onSendOtp: (e: React.FormEvent) => void;
  onVerifyOtp: (e: React.FormEvent) => void;
  onResendOtp: () => void;
  timer: number;
}

export function LoginCard({
  phoneNumber,
  setPhoneNumber,
  otp,
  setOtp,
  step,
  setStep,
  loading,
  onSendOtp,
  onVerifyOtp,
  onResendOtp,
  timer,
}: LoginCardProps) {
  const [agreed, setAgreed] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ isOpen: boolean; type: "terms" | "privacy" }>({
    isOpen: false,
    type: "terms",
  });

  return (
    <div className="relative z-10 w-full max-w-md mx-auto p-8 bg-white dark:bg-zinc-900 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-zinc-100 dark:border-zinc-800 transition-all duration-300 hover:shadow-[0_8px_40px_rgb(0,0,0,0.16)]">
      <PolicyModals
        isOpen={policyModal.isOpen}
        onClose={() => setPolicyModal((prev) => ({ ...prev, isOpen: false }))}
        type={policyModal.type}
      />
      
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary mb-2 tracking-tight">Buildesk</h1>
        <p className="text-muted-foreground">
          {step === "phone" ? "Sign in with your phone number" : "Enter the 6-digit code sent to your phone"}
        </p>
      </div>

      {step === "phone" ? (
        <form onSubmit={onSendOtp} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Phone Number
            </Label>
            <PhoneInput
              value={phoneNumber}
              onChange={setPhoneNumber}
              disabled={loading}
            />
          </div>

          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="terms"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked as boolean)}
              disabled={loading}
              className="mt-1 border-zinc-300 dark:border-zinc-700"
            />
            <Label
              htmlFor="terms"
              className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 font-normal cursor-pointer"
            >
              I agree to the{" "}
              <button
                type="button"
                onClick={() => setPolicyModal({ isOpen: true, type: "terms" })}
                className="text-primary dark:text-white underline underline-offset-4 hover:opacity-80 transition-opacity"
              >
                Terms of Service
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={() => setPolicyModal({ isOpen: true, type: "privacy" })}
                className="text-primary dark:text-white underline underline-offset-4 hover:opacity-80 transition-opacity"
              >
                Privacy Policy
              </button>
            </Label>
          </div>

          <Button
            type="submit"
            className={cn(
              "w-full h-12 text-base font-semibold transition-all duration-300 rounded-xl shadow-lg shadow-primary/20",
              agreed 
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]" 
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            disabled={loading || !agreed}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Send OTP"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onVerifyOtp} className="space-y-8">
          <div className="flex flex-col items-center space-y-6">
            <OtpInput value={otp} onChange={setOtp} disabled={loading} />
            
            <div className="text-sm text-center">
              {timer > 0 ? (
                <span className="text-zinc-500 dark:text-zinc-500 font-medium">Resend code in {timer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={onResendOtp}
                  className="text-primary dark:text-white font-semibold underline underline-offset-4 hover:opacity-80 transition-opacity"
                  disabled={loading}
                >
                  Resend code
                </button>
              )}
            </div>
          </div>
          
          <div className="space-y-4">
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-lg shadow-primary/20"
              disabled={loading || otp.length !== 6}
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Verify & Login"}
            </Button>
            
            <button
              type="button"
              className="w-full text-sm text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-white transition-colors"
              onClick={() => setStep("phone")}
              disabled={loading}
            >
              Change phone number
            </button>
          </div>
        </form>
      )}

      <div className="mt-12 text-center border-t border-zinc-100 dark:border-zinc-800 pt-8">
        <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold mb-1">
          Security Notice
        </p>
        <p className="text-xs text-zinc-400">
          Secure login powered by Firebase authentication.
        </p>
      </div>
    </div>
  );
}
