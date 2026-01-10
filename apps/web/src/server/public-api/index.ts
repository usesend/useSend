import { getApp } from "./hono";
import getDomains from "./api/domains/get-domains";
import sendEmail from "./api/emails/send-email";
import getEmail from "./api/emails/get-email";
import listEmails from "./api/emails/list-emails";
import addContact from "./api/contacts/add-contact";
import updateContactInfo from "./api/contacts/update-contact";
import getContact from "./api/contacts/get-contact";
import updateEmailScheduledAt from "./api/emails/update-email";
import cancelScheduledEmail from "./api/emails/cancel-email";
import getContacts from "./api/contacts/get-contacts";
import upsertContact from "./api/contacts/upsert-contact";
import createDomain from "./api/domains/create-domain";
import deleteContact from "./api/contacts/delete-contact";
import verifyDomain from "./api/domains/verify-domain";
import getDomain from "./api/domains/get-domain";
import deleteDomain from "./api/domains/delete-domain";
import sendBatch from "./api/emails/batch-email";
import createCampaign from "./api/campaigns/create-campaign";
import getCampaign from "./api/campaigns/get-campaign";
import getCampaigns from "./api/campaigns/get-campaigns";
import scheduleCampaign from "./api/campaigns/schedule-campaign";
import pauseCampaign from "./api/campaigns/pause-campaign";
import resumeCampaign from "./api/campaigns/resume-campaign";

export const app = getApp();

/**Domain related APIs */
getDomains(app);
createDomain(app);
verifyDomain(app);
getDomain(app);
deleteDomain(app);

/**Email related APIs */
getEmail(app);
listEmails(app);
sendEmail(app);
sendBatch(app);
updateEmailScheduledAt(app);
cancelScheduledEmail(app);

/**Contact related APIs */
addContact(app);
updateContactInfo(app);
getContact(app);
getContacts(app);
upsertContact(app);
deleteContact(app);

/**Campaign related APIs */
createCampaign(app);
getCampaign(app);
getCampaigns(app);
scheduleCampaign(app);
pauseCampaign(app);
resumeCampaign(app);

export default app;
