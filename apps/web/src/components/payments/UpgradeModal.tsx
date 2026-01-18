"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@usesend/ui/src/dialog";
import { CheckCircle2 } from "lucide-react";
import { useUpgradeModalStore } from "~/store/upgradeModalStore";
import { PLAN_PERKS } from "~/lib/constants/payments";
import { LimitReason } from "~/lib/constants/plans";
import { UpgradeButton } from "./UpgradeButton";

export const UpgradeModal = () => {
  const {
    isOpen,
    reason,
    action: { closeModal },
  } = useUpgradeModalStore();

  const basicPlanPerks = PLAN_PERKS.BASIC || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to Basic Plan</DialogTitle>
          <DialogDescription>
            {(() => {
              const messages: Record<LimitReason, string> = {
                [LimitReason.DOMAIN]:
                  "You've reached the domain limit for your current plan.",
                [LimitReason.CONTACT_BOOK]:
                  "You've reached the contact book limit for your current plan.",
                [LimitReason.TEAM_MEMBER]:
                  "You've reached the team member limit for your current plan.",
                [LimitReason.WEBHOOK]:
                  "You've reached the webhook limit for your current plan.",
                [LimitReason.EMAIL_BLOCKED]:
                  "You've reached the email sending limit for your current plan.",
                [LimitReason.EMAIL_DAILY_LIMIT_REACHED]:
                  "You've reached the email sending limit for your current plan.",
                [LimitReason.EMAIL_FREE_PLAN_MONTHLY_LIMIT_REACHED]:
                  "You've reached the email sending limit for your current plan.",
              };
              return reason
                ? `${messages[reason] ?? ""} Upgrade to unlock this feature and more.`
                : "Unlock more features with our Basic plan.";
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-3">What you'll get:</h4>
            <ul className="space-y-2">
              {basicPlanPerks.map((perk, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{perk}</span>
                </li>
              ))}
            </ul>
          </div>

          <UpgradeButton />
        </div>
      </DialogContent>
    </Dialog>
  );
};
