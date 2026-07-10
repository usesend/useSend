import { Campaign, Contact } from "@prisma/client";
import { db } from "../db";

type CampaignContactFailureInput = {
  contact: Pick<Contact, "id" | "email">;
  campaign: Pick<Campaign, "id" | "from" | "subject" | "html" | "previewText">;
  emailConfig: {
    replyTo?: string[];
    cc?: string[];
    bcc?: string[];
    teamId: number;
    domainId: number;
  };
  error: unknown;
};

function getFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function recordCampaignContactFailure({
  contact,
  campaign,
  emailConfig,
  error,
}: CampaignContactFailureInput) {
  const failureMessage = getFailureMessage(error);

  await db.$transaction(async (tx) => {
    const existingCampaignEmail = await tx.campaignEmail.findUnique({
      where: {
        campaignId_contactId: {
          campaignId: campaign.id,
          contactId: contact.id,
        },
      },
      select: { emailId: true },
    });

    let emailId = existingCampaignEmail?.emailId;

    if (!emailId) {
      const existingEmail = await tx.email.findFirst({
        where: {
          campaignId: campaign.id,
          contactId: contact.id,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      if (existingEmail) {
        emailId = existingEmail.id;
      } else {
        const failedEmail = await tx.email.create({
          data: {
            to: [contact.email],
            replyTo: emailConfig.replyTo ?? [],
            cc: emailConfig.cc ?? [],
            bcc: emailConfig.bcc ?? [],
            from: campaign.from,
            subject: campaign.subject,
            html: campaign.html,
            text: campaign.previewText,
            teamId: emailConfig.teamId,
            campaignId: campaign.id,
            contactId: contact.id,
            domainId: emailConfig.domainId,
            latestStatus: "FAILED",
          },
          select: { id: true },
        });
        emailId = failedEmail.id;
      }

      await tx.campaignEmail.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          emailId,
        },
      });
    }

    await tx.email.update({
      where: { id: emailId },
      data: { latestStatus: "FAILED" },
    });

    await tx.emailEvent.create({
      data: {
        emailId,
        status: "FAILED",
        data: { error: failureMessage },
        teamId: emailConfig.teamId,
      },
    });
  });
}
