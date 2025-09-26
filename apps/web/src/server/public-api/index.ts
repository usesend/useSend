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
import sendBatch from "./api/emails/batch-email";

export const app = getApp();

/**Domain related APIs */
getDomains(app);
createDomain(app);
verifyDomain(app);
getDomain(app);

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

export default app;
