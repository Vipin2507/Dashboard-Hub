import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "terms" | "privacy";
}

export function PolicyModals({ isOpen, onClose, type }: PolicyModalProps) {
  const content = {
    terms: {
      title: "Terms of Service",
      description: "Last updated: March 15, 2026",
      sections: [
        {
          heading: "1. Acceptance of Terms",
          text: "By accessing or using Buildesk, you agree to be bound by these Terms of Service and all applicable laws and regulations."
        },
        {
          heading: "2. License Management",
          text: "Buildesk provides a platform for managing software licenses and revenue. Users are responsible for maintaining the confidentiality of their account and tokens."
        },
        {
          heading: "3. User Responsibilities",
          text: "You may not use the service for any illegal purposes or to violate any laws in your jurisdiction. You are responsible for all content posted and activity that occurs under your account."
        },
        {
          heading: "4. Data Ownership",
          text: "You retain all rights to your data. Buildesk does not claim ownership of any content you upload or provide to the service."
        },
        {
          heading: "5. Termination",
          text: "We reserve the right to terminate or suspend access to our service immediately, without prior notice or liability, for any reason whatsoever."
        }
      ]
    },
    privacy: {
      title: "Privacy Policy",
      description: "Last updated: March 15, 2026",
      sections: [
        {
          heading: "1. Information Collection",
          text: "We collect information you provide directly to us, such as your phone number when you create an account using Firebase Authentication."
        },
        {
          heading: "2. Use of Information",
          text: "We use the information we collect to provide, maintain, and improve our services, and to process authentication requests."
        },
        {
          heading: "3. Data Sharing",
          text: "We do not share your personal information with third parties except as required by law or to provide the authentication service (e.g., via Firebase)."
        },
        {
          heading: "4. Security",
          text: "We use military-grade encryption and secure enterprise access patterns to protect your data from unauthorized access or disclosure."
        },
        {
          heading: "5. Cookies",
          text: "We use subtle cookies to manage user sessions and provide a seamless login experience across different pages of the dashboard."
        }
      ]
    }
  };

  const activeContent = content[type];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-8 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
          <DialogTitle className="text-2xl font-bold tracking-tight">{activeContent.title}</DialogTitle>
          <DialogDescription className="text-zinc-500 dark:text-zinc-400">
            {activeContent.description}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh] p-8">
          <div className="space-y-8">
            {activeContent.sections.map((section, index) => (
              <div key={index} className="space-y-3">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white tabular-nums">
                  {section.heading}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {section.text}
                </p>
              </div>
            ))}
          </div>
          
          <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs text-zinc-400">
              If you have any questions about our {activeContent.title.toLowerCase()}, please contact our support team.
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
