import { useState } from "react";
import { OtpInput } from "./OtpInput";
import { PhoneInput } from "./PhoneInput";
import { PolicyModals } from "./PolicyModals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="relative z-10 w-full border border-border shadow-sm dark:border-border">
      <CardContent className="p-6 sm:p-8">
        <PolicyModals
          isOpen={policyModal.isOpen}
          onClose={() => setPolicyModal((prev) => ({ ...prev, isOpen: false }))}
          type={policyModal.type}
        />

        <div className="mb-6 text-center sm:mb-8">
          <div className="text-2xl font-bold text-blue-600 sm:text-3xl dark:text-blue-500">Buildesk</div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Real Estate CRM</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {step === "phone" ? "Sign in with your phone number" : "Enter the 6-digit code sent to your phone"}
          </p>
        </div>

      {step === "phone" ? (
        <form onSubmit={onSendOtp} className="space-y-4">
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

          <div className="flex items-start space-x-3 pt-1">
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
              "h-11 w-full text-base font-semibold",
              agreed
                ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
            disabled={loading || !agreed}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Send OTP"}
          </Button>
        </form>
      ) : (
        <form onSubmit={onVerifyOtp} className="space-y-6">
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
              className="h-11 w-full text-base font-semibold bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
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

      <div className="mt-8 border-t border-border pt-6 text-center sm:mt-10 sm:pt-8">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Security Notice
        </p>
        <p className="text-xs text-muted-foreground">Secure login powered by Firebase authentication.</p>
      </div>
      </CardContent>
    </Card>
  );
}
