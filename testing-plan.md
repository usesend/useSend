# Testing Plan for useSend Web App (apps/web)

## Overview

This document outlines a comprehensive testing strategy for the useSend email platform backend, focusing on unit tests, integration tests, and production workflow validation.

**Product Summary**: useSend is an email sending and marketing platform (similar to SendGrid/Mailgun) that enables users to send transactional emails, manage marketing campaigns, organize contacts, verify sending domains, and track email metrics.

---

## Table of Contents

1. [Testing Strategy & Principles](#testing-strategy--principles)
2. [Test Infrastructure Setup](#test-infrastructure-setup)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [Production Workflow Tests](#production-workflow-tests)
6. [Mocking Strategy](#mocking-strategy)
7. [Test Data Management](#test-data-management)
8. [CI/CD Integration](#cicd-integration)
9. [Test Coverage Goals](#test-coverage-goals)

---

## Testing Strategy & Principles

### Core Principles

1. **Test Real Production Scenarios**: Focus on actual user workflows (sending emails, running campaigns, managing contacts)
2. **Integration Over Isolation**: Prefer integration tests that validate full workflows over pure unit tests
3. **Database Testing**: Use a real test database (not mocks) for integration tests
4. **External Service Mocking**: Mock AWS SES, Stripe, and other external services
5. **Queue Testing**: Test actual queue behavior with real Redis (test instance)
6. **API Contract Testing**: Validate both tRPC and REST API contracts
7. **Authorization Testing**: Verify role-based access control and team isolation
8. **Error Path Testing**: Test failure scenarios (bounces, API errors, limit enforcement)

### Test Pyramid

```
         /\
        /  \  E2E (Manual/Playwright - Future)
       /____\
      /      \
     / Integ. \ Integration Tests (60%)
    /__________\
   /            \
  /  Unit Tests  \ Unit Tests (40%)
 /________________\
```

---

## Test Infrastructure Setup

### 1. Testing Framework Installation

**Task 1.1**: Install testing dependencies
```bash
pnpm add -D vitest @vitest/ui
pnpm add -D @types/node
pnpm add -D vitest-mock-extended
```

**Task 1.2**: Create Vitest configuration
- File: `apps/web/vitest.config.ts`
- Configure test environment (node for backend)
- Setup path aliases from tsconfig
- Configure test database connection
- Setup Redis test instance
- Configure test timeouts

**Task 1.3**: Add test scripts to package.json
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:unit": "vitest --run unit",
    "test:integration": "vitest --run integration"
  }
}
```

### 2. Test Database Setup

**Task 2.1**: Create test database configuration
- Separate DATABASE_URL for tests
- Use `.env.test` file
- Database naming: `usesend_test`

**Task 2.2**: Database seeding utilities
- File: `apps/web/src/test/utils/db-helpers.ts`
- Functions:
  - `setupTestDatabase()` - Run migrations
  - `cleanDatabase()` - Truncate all tables
  - `seedTestData()` - Create baseline test data
  - `createTestTeam()`
  - `createTestUser()`
  - `createTestDomain()`
  - `createTestApiKey()`

**Task 2.3**: Database lifecycle hooks
- Before each test suite: Clean database
- After all tests: Disconnect Prisma client

### 3. Mock Service Setup

**Task 3.1**: AWS SES Mock
- File: `apps/web/src/test/mocks/aws-ses.mock.ts`
- Mock all SES operations:
  - `sendRawEmail()` - Return mock message ID
  - `addDomain()` - Return mock DKIM tokens
  - `verifyDomain()` - Return SUCCESS status
  - `deleteDomain()` - Return success

**Task 3.2**: AWS SNS Mock (Webhook Events)
- File: `apps/web/src/test/mocks/aws-sns.mock.ts`
- Generate test SNS event payloads:
  - Bounce events
  - Complaint events
  - Delivery events
  - Open/click events

**Task 3.3**: Stripe Mock
- File: `apps/web/src/test/mocks/stripe.mock.ts`
- Mock Stripe methods:
  - `checkout.sessions.create()`
  - `billingPortal.sessions.create()`
  - `customers.retrieve()`
  - Webhook event constructors

**Task 3.4**: Redis/BullMQ Test Setup
- Use real Redis (test instance on different DB number)
- File: `apps/web/src/test/utils/queue-helpers.ts`
- Functions:
  - `setupTestQueues()`
  - `clearAllQueues()`
  - `waitForJobCompletion()`

### 4. Test Utilities & Helpers

**Task 4.1**: Create tRPC test caller
- File: `apps/web/src/test/utils/trpc-helpers.ts`
- Create authenticated tRPC caller with test context
- Helper to create team-scoped caller
- Helper to create admin caller

**Task 4.2**: Create API test client (Hono)
- File: `apps/web/src/test/utils/api-helpers.ts`
- HTTP client for REST API testing
- Add authentication headers
- Parse responses

**Task 4.3**: Test fixtures
- File: `apps/web/src/test/fixtures/`
- Email fixtures (HTML, text, with attachments)
- Campaign fixtures
- Contact fixtures
- Domain fixtures

**Task 4.4**: Custom matchers
- File: `apps/web/src/test/matchers/`
- `toBeValidEmail()` - Validate email format
- `toHaveStatus()` - Check email status
- `toBeWithinDailyLimit()` - Check usage limits

---

## Unit Tests

### Utilities & Pure Functions

#### 5. Email Utilities (`/src/lib/` and `/src/utils/`)

**Task 5.1**: Test email validation (`apps/web/src/lib/email-validation.test.ts`)
- Valid email formats
- Invalid formats (missing @, invalid domain)
- Edge cases (special characters, long domains)
- Batch email validation

**Task 5.2**: Test usage calculation (`apps/web/src/lib/usage.test.ts`)
- Monthly usage aggregation
- Daily usage tracking
- Percentage calculations
- Limit enforcement logic

**Task 5.3**: Test constants and helpers
- Plan limits validation (`plans.ts`)
- Email status transitions
- Region availability

#### 6. Service Layer - Pure Logic

**Task 6.1**: EmailService unit tests (`apps/web/src/server/service/email-service.test.ts`)

Test cases:
- **Variable replacement**:
  - Replace `{{variable}}` placeholders
  - Handle missing variables (keep placeholder or empty)
  - Nested objects: `{{user.firstName}}`
  - Array access: `{{items[0]}}`
  - Special characters in values
  - HTML escaping in variables

- **Email validation**:
  - Valid email structures
  - Multiple recipients (to, cc, bcc)
  - Reply-to validation
  - From address validation

- **HTML rendering**:
  - Render template JSON to HTML
  - Handle plain text
  - Handle attachments
  - Handle inline images

**Task 6.2**: CampaignService unit tests (`apps/web/src/server/service/campaign-service.test.ts`)

Test cases:
- **Variable replacement**:
  - Replace contact variables: `{{firstName}}`, `{{email}}`, `{{properties.company}}`
  - Unsubscribe URL replacement
  - Missing contact properties handling

- **HTML preparation**:
  - Convert campaign content JSON to HTML
  - Preserve formatting
  - Handle custom properties

**Task 6.3**: SuppressionService unit tests (`apps/web/src/server/service/suppression-service.test.ts`)

Test cases:
- **Suppression logic**:
  - Add email to suppression list (all reasons)
  - Remove from suppression list
  - Check if email is suppressed
  - Bulk suppression checks
  - Team isolation (can't see other teams' suppressions)

**Task 6.4**: LimitService unit tests (`apps/web/src/server/service/limit-service.test.ts`)

Test cases:
- **Plan limit checks**:
  - FREE plan: domain limit (1)
  - FREE plan: contact book limit (1)
  - FREE plan: team member limit (1)
  - FREE plan: monthly email limit (3000)
  - FREE plan: daily email limit (100)
  - BASIC plan: unlimited checks
  - Edge cases: exactly at limit
  - INACTIVE plan: no sending

**Task 6.5**: DomainService unit tests (`apps/web/src/server/service/domain-service.test.ts`)

Test cases:
- **Domain validation**:
  - Extract domain from email address
  - Validate domain ownership
  - Check domain verification status
  - API key domain scoping
  - Region validation

**Task 6.6**: TeamService unit tests (`apps/web/src/server/service/team-service.test.ts`)

Test cases:
- **Team operations**:
  - Create team with owner
  - Add team member
  - Remove team member
  - Update member role
  - Check member permissions
  - Team isolation validation

**Task 6.7**: UsageService unit tests (`apps/web/src/server/service/usage-service.test.ts`)

Test cases:
- **Usage calculation**:
  - Daily usage aggregation
  - Monthly total calculation
  - Cumulated metrics (hard bounces, complaints)
  - Usage by type (transactional vs marketing)
  - Usage by domain

**Task 6.8**: NotificationService unit tests (`apps/web/src/server/service/notification-service.test.ts`)

Test cases:
- **Email generation**:
  - Limit warning email (80% threshold)
  - Limit reached email
  - Team invitation email
  - Test email rendering (use snapshots)

---

## Integration Tests

### tRPC API Integration Tests

#### 7. Email Router Tests

**Task 7.1**: Email listing and filtering (`apps/web/src/server/api/routers/email.integration.test.ts`)

Test cases:
- **email.emails**:
  - List all emails for team
  - Filter by status (SENT, DELIVERED, BOUNCED)
  - Filter by date range
  - Pagination (cursor-based)
  - Team isolation (can't see other teams' emails)
  - Sorting by createdAt

- **email.getEmail**:
  - Get single email with full details
  - Include email events
  - Access control (must own email)
  - Not found error

- **email.exportEmails**:
  - Export with filters
  - CSV format validation
  - Include bounce details

- **email.cancelEmail**:
  - Cancel scheduled email (status: SCHEDULED)
  - Can't cancel already sent email
  - Update status to CANCELLED
  - Access control

- **email.updateEmailScheduledAt**:
  - Reschedule email
  - Can't reschedule sent email
  - Validate future date
  - Access control

**Setup**:
- Create test team and user
- Seed emails in various states
- Use real database
- Mock AWS SES

#### 8. Campaign Router Tests

**Task 8.1**: Campaign CRUD operations (`apps/web/src/server/api/routers/campaign.integration.test.ts`)

Test cases:
- **campaign.createCampaign**:
  - Create draft campaign
  - Validate required fields (name, subject, from, contactBookId)
  - Validate from address domain ownership
  - Default status: DRAFT

- **campaign.getCampaigns**:
  - List all campaigns for team
  - Filter by status
  - Pagination
  - Include metrics
  - Team isolation

- **campaign.scheduleCampaign**:
  - Schedule for future date
  - Status transition: DRAFT → SCHEDULED
  - Validate scheduledAt in future
  - Can't schedule empty contact book

- **campaign.sendCampaign**:
  - Send immediately (no schedule)
  - Status transition: DRAFT → RUNNING
  - Creates email records for all contacts
  - Batch processing
  - Contact variable replacement
  - Daily limit enforcement
  - Suppression list filtering

- **campaign.pauseCampaign**:
  - Pause running campaign
  - Status: RUNNING → PAUSED
  - Can't pause completed campaign

- **campaign.resumeCampaign**:
  - Resume paused campaign
  - Status: PAUSED → RUNNING
  - Continue from last batch

**Setup**:
- Create test team, domain, contact book with contacts
- Mock AWS SES
- Use real Redis/queue for batch testing

#### 9. Contact Management Router Tests

**Task 9.1**: Contact Book operations (`apps/web/src/server/api/routers/contacts.integration.test.ts`)

Test cases:
- **contacts.createContactBook**:
  - Create with name and emoji
  - Define custom properties schema
  - FREE plan: limit to 1 book
  - BASIC plan: unlimited books

- **contacts.getContactBooks**:
  - List all books for team
  - Include contact count
  - Team isolation

- **contacts.getContactBookDetails**:
  - Get book with full details
  - Include metrics (subscribed count, unsubscribed count)
  - Include custom properties schema

- **contacts.updateContactBook**:
  - Update name, emoji
  - Update properties schema
  - Can't change to conflicting schema

- **contacts.deleteContactBook**:
  - Delete book and all contacts
  - Can't delete if used in active campaign
  - Cascade delete contacts

**Task 9.2**: Contact operations

Test cases:
- **contacts.contacts**:
  - List contacts in book
  - Pagination (50 per page)
  - Filter by subscription status
  - Search by email, name
  - Team isolation

- **contacts.addContact**:
  - Add single contact
  - Validate email format
  - Set custom properties
  - Default subscribed: true
  - Handle duplicates

- **contacts.bulkAddContacts**:
  - Add multiple contacts (100+)
  - Queue processing for large batches
  - Duplicate handling (skip or update)
  - Validate all emails
  - Report success/failure count

- **contacts.updateContact**:
  - Update name, properties
  - Update subscription status
  - Can't change email

- **contacts.deleteContact**:
  - Delete single contact
  - Access control

**Setup**:
- Create test team with FREE and BASIC plans
- Create contact books with various properties
- Seed contacts

#### 10. Domain Router Tests

**Task 10.1**: Domain management (`apps/web/src/server/api/routers/domain.integration.test.ts`)

Test cases:
- **domain.createDomain**:
  - Register new domain
  - Choose AWS region
  - Generate DKIM keys (mock SES response)
  - Status: PENDING
  - FREE plan: limit to 1 domain
  - BASIC plan: unlimited
  - Can't register duplicate domain

- **domain.domains**:
  - List all domains for team
  - Include verification status
  - Include DNS records
  - Team isolation

- **domain.getDomain**:
  - Get domain with full DNS records
  - DKIM record details
  - SPF record
  - DMARC recommendation
  - Verification status

- **domain.updateDomain**:
  - Toggle click tracking
  - Toggle open tracking
  - Can't change domain name

- **domain.deleteDomain**:
  - Delete domain from SES (mock)
  - Delete from database
  - Can't delete if used in scheduled emails

- **domain.sendTestEmailFromDomain**:
  - Send test email
  - Validate domain ownership
  - Validate destination email
  - Check domain verification status

**Setup**:
- Mock AWS SES client
- Create test team with different plans
- Create domains in various states

#### 11. Team Router Tests

**Task 11.1**: Team operations (`apps/web/src/server/api/routers/team.integration.test.ts`)

Test cases:
- **team.createTeam**:
  - Create team with user as owner (ADMIN)
  - Default plan: FREE
  - Initialize default settings

- **team.getTeams**:
  - List user's teams
  - Include role
  - Include team plan

- **team.getTeamUsers**:
  - List all members
  - Include roles
  - Include user details
  - Access control (team member only)

- **team.createTeamInvite**:
  - Invite user by email
  - Set role (ADMIN or MEMBER)
  - Send invitation email (mock)
  - FREE plan: limit to 1 member
  - BASIC plan: unlimited
  - Can't invite existing member

- **team.updateTeamUserRole**:
  - Change member role
  - Must be admin
  - Can't demote last admin

- **team.deleteTeamUser**:
  - Remove member
  - Must be admin
  - Can't remove last admin
  - Member can leave team

- **team.resendTeamInvite**:
  - Resend invitation email
  - Update expiry date

- **team.deleteTeamInvite**:
  - Cancel pending invitation

**Setup**:
- Create multiple users and teams
- Test different role combinations

#### 12. Billing Router Tests

**Task 12.1**: Billing operations (`apps/web/src/server/api/routers/billing.integration.test.ts`)

Test cases:
- **billing.createCheckoutSession**:
  - Create Stripe checkout URL (mock Stripe)
  - Validate team ownership
  - Include success/cancel URLs
  - Create customer if doesn't exist

- **billing.getManageSessionUrl**:
  - Create billing portal URL (mock)
  - Require existing customer

- **billing.getThisMonthUsage**:
  - Calculate current month usage
  - Include sent, delivered, opened, clicked, bounced
  - Include daily breakdown
  - Calculate percentage of limit (FREE plan)

- **billing.getSubscriptionDetails**:
  - Get active subscription
  - Include status, period, price
  - Return null if no subscription

- **billing.updateBillingEmail**:
  - Update team billing email
  - Must be admin

**Setup**:
- Mock Stripe client
- Create teams with different plans and usage

#### 13. API Key Router Tests

**Task 13.1**: API key management (`apps/web/src/server/api/routers/api.integration.test.ts`)

Test cases:
- **apiKey.createToken**:
  - Generate API key with name
  - Set permission (FULL or SENDING)
  - Optional domain scoping
  - Return unhashed token (only once)
  - Store hashed token

- **apiKey.getApiKeys**:
  - List all keys for team
  - Hide token, show hash prefix
  - Include last used timestamp
  - Include domain scope

- **apiKey.deleteApiKey**:
  - Revoke API key
  - Access control

**Setup**:
- Create test team
- Generate multiple API keys

#### 14. Suppression Router Tests

**Task 14.1**: Suppression list operations (`apps/web/src/server/api/routers/suppression.integration.test.ts`)

Test cases:
- **suppression.getSuppressions**:
  - List all suppressed emails for team
  - Filter by reason (HARD_BOUNCE, COMPLAINT, MANUAL)
  - Pagination
  - Search by email
  - Team isolation

- **suppression.addSuppression**:
  - Add email manually
  - Set reason: MANUAL
  - Can't send to suppressed email

- **suppression.removeSuppression**:
  - Remove from suppression list
  - Re-enable sending

- **suppression.bulkAddSuppressions**:
  - Add multiple emails
  - Validate all emails
  - Report count

- **suppression.checkSuppression**:
  - Check single email
  - Return boolean + reason if suppressed

- **suppression.checkMultipleSuppressions**:
  - Check batch of emails
  - Return map of email -> suppression status

- **suppression.getSuppressionStats**:
  - Count by reason
  - Total suppressed

**Setup**:
- Seed suppression list with various reasons
- Test team isolation

#### 15. Dashboard Router Tests

**Task 15.1**: Analytics (`apps/web/src/server/api/routers/dashboard.integration.test.ts`)

Test cases:
- **dashboard.emailTimeSeries**:
  - Get time series data (daily metrics)
  - Filter by date range
  - Filter by domain
  - Include sent, delivered, opened, clicked, bounced
  - Group by date

**Setup**:
- Seed DailyEmailUsage records
- Create multiple domains

---

### REST API (Hono) Integration Tests

#### 16. Email Endpoints

**Task 16.1**: Send emails (`apps/web/src/server/public-api/api/emails/send.integration.test.ts`)

Test cases:
- **POST /v1/emails**:
  - Send single email with API key
  - Validate required fields (to, from, subject)
  - Validate from domain ownership
  - Validate API key permissions
  - Domain-scoped API key validation
  - HTML and text content
  - Attachments
  - CC, BCC, Reply-To
  - Custom headers
  - Schedule for future
  - Variables replacement
  - Rate limiting (429 error)
  - Daily limit enforcement (FREE plan)
  - Suppression list check (skip suppressed)
  - Invalid API key (401)
  - Invalid domain (403)
  - Return email ID

- **POST /v1/emails/batch**:
  - Send multiple emails in one request
  - Validate each email
  - Return array of email IDs
  - Individual validation (partial success)
  - Batch limit (max 100)

**Task 16.2**: Email management

Test cases:
- **GET /v1/emails**:
  - List emails with API key
  - Filter by status
  - Filter by date range
  - Pagination (limit/offset)
  - API key team isolation
  - Domain-scoped API key (only emails from that domain)

- **GET /v1/emails/:id**:
  - Get single email details
  - Include events
  - Access control (team ownership)

- **PATCH /v1/emails/:id**:
  - Update scheduled time
  - Can only update SCHEDULED emails
  - Validate future date

- **DELETE /v1/emails/:id**:
  - Cancel scheduled email
  - Status: SCHEDULED → CANCELLED
  - Can't cancel sent emails

**Setup**:
- Create test team and API keys
- Mock AWS SES
- Use real database and queue

#### 17. Campaign Endpoints

**Task 17.1**: Campaign management (`apps/web/src/server/public-api/api/campaigns/campaigns.integration.test.ts`)

Test cases:
- **POST /v1/campaigns**:
  - Create campaign via API
  - Validate contact book exists
  - Validate from domain
  - API key permissions (FULL only, not SENDING)
  - Return campaign ID

- **GET /v1/campaigns**:
  - List campaigns
  - Filter by status
  - Pagination
  - Team isolation

- **GET /v1/campaigns/:id**:
  - Get campaign with metrics
  - Access control

- **POST /v1/campaigns/:id/schedule**:
  - Schedule campaign
  - Validate scheduledAt
  - Status transition

- **POST /v1/campaigns/:id/pause**:
  - Pause running campaign

- **POST /v1/campaigns/:id/resume**:
  - Resume paused campaign

**Setup**:
- Create API keys with different permissions
- Seed campaigns

#### 18. Contact Endpoints

**Task 18.1**: Contact operations (`apps/web/src/server/public-api/api/contacts/contacts.integration.test.ts`)

Test cases:
- **POST /v1/contacts**:
  - Add contact via API
  - Require contact book ID
  - Validate email
  - Set custom properties
  - API key permissions

- **GET /v1/contacts**:
  - List contacts
  - Filter by contact book
  - Filter by subscription status
  - Pagination
  - Search by email

- **GET /v1/contacts/:id**:
  - Get contact details
  - Access control

- **PATCH /v1/contacts/:id**:
  - Update contact properties
  - Update subscription status
  - Can't update email

- **DELETE /v1/contacts/:id**:
  - Delete contact
  - Access control

- **POST /v1/contacts/upsert**:
  - Add or update contact by email
  - Insert if new, update if exists
  - Return created/updated flag

**Setup**:
- Create contact books
- Generate API keys

#### 19. Domain Endpoints

**Task 19.1**: Domain operations (`apps/web/src/server/public-api/api/domains/domains.integration.test.ts`)

Test cases:
- **POST /v1/domains**:
  - Create domain via API
  - Choose region
  - Mock SES response
  - FREE plan limit
  - API key permissions (FULL only)

- **GET /v1/domains**:
  - List domains
  - Include DNS records
  - Team isolation

- **GET /v1/domains/:id**:
  - Get domain with verification status
  - Include DKIM, SPF, DMARC records

- **DELETE /v1/domains/:id**:
  - Delete domain
  - Access control
  - Can't delete if in use

- **POST /v1/domains/:id/verify**:
  - Request verification check
  - Mock SES verification
  - Update status

**Setup**:
- Mock AWS SES
- Create test domains

---

### Webhook Integration Tests

#### 20. SES Event Callback

**Task 20.1**: SES webhook handler (`apps/web/src/app/api/ses_callback/route.integration.test.ts`)

Test cases:
- **Bounce handling**:
  - Receive SNS bounce notification
  - Parse bounce type (Permanent, Transient)
  - Update email status to BOUNCED
  - Create EmailEvent record
  - Add to suppression list (hard bounces only)
  - Update cumulated bounce count

- **Complaint handling**:
  - Receive complaint notification
  - Update email status to COMPLAINED
  - Add to suppression list
  - Update cumulated complaint count

- **Delivery notification**:
  - Update status to DELIVERED
  - Create EmailEvent

- **Open tracking**:
  - Update status to OPENED
  - Create EmailEvent
  - Track timestamp

- **Click tracking**:
  - Update status to CLICKED
  - Create EmailEvent
  - Track clicked link

- **Rendering failure**:
  - Update status to RENDERING_FAILURE
  - Record error message

- **Invalid signature**:
  - Reject invalid SNS signature (security)

- **Unknown email ID**:
  - Log warning, don't crash

**Setup**:
- Create test emails
- Generate valid SNS event payloads
- Mock SNS signature verification

#### 21. Stripe Webhook

**Task 21.1**: Stripe webhook handler (`apps/web/src/app/api/webhook/stripe/route.integration.test.ts`)

Test cases:
- **customer.subscription.updated**:
  - Update subscription in database
  - Update team plan (FREE → BASIC)
  - Update status
  - Update period dates

- **customer.subscription.deleted**:
  - Downgrade team to FREE plan
  - Update team status

- **invoice.payment_succeeded**:
  - Log successful payment
  - Update subscription period

- **Webhook signature validation**:
  - Reject invalid signatures
  - Accept valid signatures

**Setup**:
- Mock Stripe webhook events
- Create test teams with subscriptions

#### 22. Unsubscribe Endpoint

**Task 22.1**: One-click unsubscribe (`apps/web/src/app/api/unsubscribe-oneclick/route.integration.test.ts`)

Test cases:
- **POST /api/unsubscribe-oneclick**:
  - Parse List-Unsubscribe-Post header
  - Decode unsubscribe token
  - Update contact subscription status
  - Set unsubscribeReason: "one-click"
  - Return 200 OK
  - Invalid token: return 400

**Setup**:
- Create test contacts
- Generate valid unsubscribe tokens

---

## Production Workflow Tests

These tests validate complete end-to-end workflows as they would occur in production.

### 23. Complete Email Sending Workflow

**Task 23.1**: Transactional email workflow (`apps/web/src/test/workflows/email-sending.workflow.test.ts`)

**Test: Send transactional email via API → SES → delivery tracking**

Steps:
1. Create team with verified domain
2. Generate API key
3. POST to `/v1/emails` with valid email
4. Assert email created with status QUEUED
5. Assert job added to BullMQ queue
6. Process queue job
7. Assert AWS SES sendRawEmail called with correct params
8. Assert email status updated to SENT
9. Simulate SNS delivery notification
10. Assert email status updated to DELIVERED
11. Simulate SNS open notification
12. Assert email status updated to OPENED
13. Verify EmailEvent records created

**Test: Send email to suppressed address**

Steps:
1. Add email to suppression list (HARD_BOUNCE)
2. Attempt to send email to suppressed address
3. Assert email status: SUPPRESSED
4. Assert email NOT sent to SES
5. Assert email not queued

**Test: Send email exceeding daily limit (FREE plan)**

Steps:
1. Create FREE plan team
2. Send 100 emails (daily limit)
3. Assert all queued successfully
4. Attempt to send 101st email
5. Assert error: "Daily limit reached"
6. Assert email not created

**Test: Scheduled email workflow**

Steps:
1. Create email with scheduledAt (future date)
2. Assert status: SCHEDULED
3. Assert NOT queued immediately
4. Advance time to scheduledAt
5. Run scheduler job
6. Assert email queued
7. Process queue
8. Assert email sent

### 24. Campaign Execution Workflow

**Task 24.1**: Campaign sending workflow (`apps/web/src/test/workflows/campaign-execution.workflow.test.ts`)

**Test: Create campaign → schedule → execute → track results**

Steps:
1. Create team with verified domain
2. Create contact book with 100 contacts (with custom properties)
3. Create campaign with variables: `Hi {{firstName}}, from {{properties.company}}`
4. Schedule campaign for immediate execution
5. Assert campaign status: SCHEDULED
6. Run campaign scheduler job
7. Assert campaign status: RUNNING
8. Assert 100 email records created
9. Verify variable replacement in each email HTML
10. Verify unsubscribe URL in each email
11. Process email queue (batch by batch)
12. Assert AWS SES called 100 times
13. Assert campaign status: SENT
14. Assert campaign metrics: total=100, sent=100
15. Simulate delivery notifications (80%)
16. Assert campaign metrics: delivered=80
17. Simulate open notifications (30%)
18. Assert campaign metrics: opened=30
19. Simulate bounce notifications (5 hard, 15 soft)
20. Assert campaign metrics: bounced=20, hardBounced=5
21. Assert 5 contacts added to suppression list

**Test: Campaign with suppression filtering**

Steps:
1. Create contact book with 50 contacts
2. Add 10 contacts to suppression list
3. Execute campaign
4. Assert only 40 emails created
5. Assert suppressed contacts skipped

**Test: Campaign respecting daily limits**

Steps:
1. Create FREE plan team (100 email/day limit)
2. Create contact book with 150 contacts
3. Execute campaign
4. Assert only 100 emails queued (remaining 50 for next day)
5. Assert campaign status: RUNNING (not SENT)

**Test: Pause and resume campaign**

Steps:
1. Create campaign with 1000 contacts
2. Start campaign (status: RUNNING)
3. Process 300 emails
4. Pause campaign
5. Assert status: PAUSED
6. Assert no more emails queued
7. Resume campaign
8. Assert status: RUNNING
9. Assert remaining 700 emails queued

### 25. Domain Verification Workflow

**Task 25.1**: Domain setup and verification (`apps/web/src/test/workflows/domain-verification.workflow.test.ts`)

**Test: Add domain → verify DNS → send test email**

Steps:
1. Create team (FREE plan, no domains yet)
2. Add domain "example.com" in us-east-1
3. Mock SES createDomain response with DKIM tokens
4. Assert domain created with status: PENDING
5. Assert DKIM records returned
6. Call verifyDomain API
7. Mock SES verification response: SUCCESS
8. Assert domain status: SUCCESS
9. Send test email from verified domain
10. Assert email sent successfully

**Test: Add domain exceeding FREE plan limit**

Steps:
1. Create FREE plan team with 1 domain
2. Attempt to add 2nd domain
3. Assert error: "Domain limit reached"
4. Upgrade to BASIC plan
5. Add 2nd domain successfully

**Test: Send email from unverified domain**

Steps:
1. Add domain with status: PENDING
2. Attempt to send email from domain
3. Assert error: "Domain not verified"

### 26. Contact Management Workflow

**Task 26.1**: Contact lifecycle (`apps/web/src/test/workflows/contact-management.workflow.test.ts`)

**Test: Create contact book → import contacts → send campaign → handle unsubscribe**

Steps:
1. Create contact book with custom properties: `{company: string, role: string}`
2. Bulk import 500 contacts with properties
3. Assert all contacts created
4. Assert properties saved correctly
5. Send campaign using contact variables
6. Simulate contact clicks unsubscribe link
7. Assert contact.subscribed = false
8. Assert contact.unsubscribeReason set
9. Send another campaign
10. Assert unsubscribed contact skipped

**Test: One-click unsubscribe (RFC 8058)**

Steps:
1. Send email with List-Unsubscribe header
2. Simulate ESP sending POST to /api/unsubscribe-oneclick
3. Assert contact unsubscribed
4. Assert reason: "one-click"

### 27. Team & Billing Workflow

**Task 27.1**: Team and subscription lifecycle (`apps/web/src/test/workflows/team-billing.workflow.test.ts`)

**Test: Create team → invite member → upgrade plan → downgrade**

Steps:
1. User creates team (default: FREE plan)
2. Send 50 emails (within limit)
3. Create Stripe checkout session
4. Simulate Stripe webhook: subscription created
5. Assert team plan: BASIC
6. Send 5000 emails (exceed FREE limit, allowed on BASIC)
7. Simulate subscription cancellation
8. Assert team plan: FREE
9. Assert daily limit enforced again

**Test: FREE plan limit enforcement**

Steps:
1. Create FREE plan team
2. Add 1 domain (limit reached)
3. Add 1 contact book (limit reached)
4. Invite 1 member (limit reached)
5. Attempt to add 2nd domain → error
6. Attempt to add 2nd contact book → error
7. Attempt to invite 2nd member → error

### 28. Bounce and Complaint Handling Workflow

**Task 28.1**: Email failures and suppressions (`apps/web/src/test/workflows/bounce-complaint.workflow.test.ts`)

**Test: Hard bounce → suppression → prevent future sends**

Steps:
1. Send email to "bounce@simulator.amazonses.com"
2. Simulate SNS hard bounce notification
3. Assert email status: BOUNCED
4. Assert EmailEvent created (type: BOUNCE, bounceType: Permanent)
5. Assert email added to suppression list (reason: HARD_BOUNCE)
6. Attempt to send another email to same address
7. Assert email status: SUPPRESSED
8. Assert email not sent to SES

**Test: Complaint → suppression**

Steps:
1. Send email
2. Simulate SNS complaint notification
3. Assert email status: COMPLAINED
4. Assert email added to suppression list (reason: COMPLAINT)
5. Verify future emails suppressed

**Test: Soft bounce (transient) → no suppression**

Steps:
1. Send email
2. Simulate SNS soft bounce (mailbox full)
3. Assert email status: BOUNCED
4. Assert email NOT added to suppression list
5. Assert can send again later

### 29. API Key Permissions Workflow

**Task 29.1**: API key scoping and permissions (`apps/web/src/test/workflows/api-key-permissions.workflow.test.ts`)

**Test: Domain-scoped API key**

Steps:
1. Create team with 2 domains: example.com, example.org
2. Create API key scoped to example.com
3. Send email from example.com → success
4. Attempt to send from example.org → error (403)

**Test: SENDING vs FULL permissions**

Steps:
1. Create API key with permission: SENDING
2. Send email → success
3. Attempt to create campaign → error (403)
4. Attempt to create domain → error (403)
5. Create API key with permission: FULL
6. Create campaign → success
7. Create domain → success

### 30. Rate Limiting Workflow

**Task 30.1**: API rate limiting (`apps/web/src/test/workflows/rate-limiting.workflow.test.ts`)

**Test: API rate limit enforcement**

Steps:
1. Create team with apiRateLimit: 10 requests/minute
2. Send 10 API requests within 1 minute → all succeed
3. Send 11th request → error 429 (Too Many Requests)
4. Wait 1 minute
5. Send request → success (limit reset)

---

## Mocking Strategy

### Services to Mock

1. **AWS SES** (always mock in tests)
   - Use vitest-mock-extended or manual mocks
   - Verify correct parameters passed
   - Return realistic responses

2. **AWS SNS** (generate test payloads)
   - Use real SNS event formats
   - Sign events (or disable signature verification in tests)

3. **Stripe** (always mock)
   - Mock checkout session creation
   - Mock webhook event generation
   - Use Stripe test fixtures

4. **Email sending** (mock SMTP if used internally)
   - Verify email content
   - Don't send real emails

### Services to Use Real Instances

1. **PostgreSQL** (test database)
   - Separate test database
   - Clean before each suite
   - Use transactions for isolation

2. **Redis** (test instance)
   - Use different DB number (e.g., DB 15)
   - Clear queues before tests
   - Real BullMQ behavior

3. **BullMQ queues** (real)
   - Validate queue processing
   - Test job completion
   - Test job failures

---

## Test Data Management

### Database Seeding Strategy

**Base fixtures**:
- 2 test users (user1, user2)
- 2 teams with different plans (FREE, BASIC)
- 1 verified domain per team
- 1 API key per team
- Sample contact books with contacts

**Per-test fixtures**:
- Create specific test data needed
- Use factory functions for consistency
- Clean up after test (or use transactions)

### Factory Functions

```typescript
// apps/web/src/test/factories/

createTestUser(overrides?: Partial<User>): Promise<User>
createTestTeam(overrides?: Partial<Team>): Promise<Team>
createTestDomain(teamId: string, verified?: boolean): Promise<Domain>
createTestApiKey(teamId: string, permission?: Permission): Promise<{key: string, apiKey: ApiKey}>
createTestEmail(teamId: string, overrides?: Partial<Email>): Promise<Email>
createTestCampaign(teamId: string, overrides?: Partial<Campaign>): Promise<Campaign>
createTestContactBook(teamId: string, overrides?: Partial<ContactBook>): Promise<ContactBook>
createTestContact(contactBookId: string, overrides?: Partial<Contact>): Promise<Contact>
```

---

## CI/CD Integration

### GitHub Actions Workflow

**Task 31**: Create test workflow (`.github/workflows/test.yml`)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: usesend_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm --filter web db:migrate:test
      - run: pnpm --filter web test
      - run: pnpm --filter web test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

**Task 32**: Add pre-commit testing
- Run unit tests before commit
- Run linting
- Format code

---

## Test Coverage Goals

### Coverage Targets

- **Overall**: 80%+
- **Services**: 90%+ (core business logic)
- **API Routers**: 85%+
- **Utilities**: 95%+
- **Integration workflows**: 100% of critical paths

### Critical Paths (Must have 100% coverage)

1. Email sending workflow (transactional)
2. Campaign execution workflow
3. Suppression list enforcement
4. Plan limit enforcement (FREE plan)
5. Domain verification
6. Bounce/complaint handling
7. API authentication
8. Team isolation (security)

---

## Implementation Phases

### Phase 1: Infrastructure (Tasks 1-4)
- Setup testing framework
- Configure test database
- Create mock services
- Build test utilities

**Duration**: 2-3 days

### Phase 2: Unit Tests (Tasks 5-8)
- Test utilities
- Test service layer pure logic
- Test validation functions

**Duration**: 3-4 days

### Phase 3: tRPC Integration Tests (Tasks 7-15)
- Test all tRPC routers
- Test authorization
- Test team isolation

**Duration**: 5-7 days

### Phase 4: REST API Integration Tests (Tasks 16-19)
- Test public API endpoints
- Test API key auth
- Test rate limiting

**Duration**: 3-4 days

### Phase 5: Webhook Tests (Tasks 20-22)
- Test SES callbacks
- Test Stripe webhooks
- Test unsubscribe endpoints

**Duration**: 2-3 days

### Phase 6: Production Workflow Tests (Tasks 23-30)
- Test complete end-to-end workflows
- Test all critical user journeys

**Duration**: 4-5 days

### Phase 7: CI/CD & Documentation (Tasks 31-32)
- Setup GitHub Actions
- Add pre-commit hooks
- Document testing practices

**Duration**: 1-2 days

**Total estimated duration**: 20-28 days

---

## Success Metrics

1. **Coverage**: 80%+ overall code coverage
2. **Reliability**: All tests pass consistently
3. **Speed**: Full test suite runs in < 5 minutes
4. **Maintainability**: Tests are easy to understand and update
5. **Confidence**: Can deploy with confidence that critical paths work
6. **Bug Detection**: Tests catch bugs before production

---

## Testing Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **One assertion per test** (when possible)
3. **Descriptive test names**: "should return error when email is suppressed"
4. **Test edge cases**: Empty arrays, null values, boundary conditions
5. **Avoid test interdependence**: Each test should run independently
6. **Use transactions**: Rollback database changes when possible
7. **Mock external services**: Never call real AWS/Stripe in tests
8. **Test error paths**: Not just happy paths
9. **Keep tests fast**: Mock expensive operations
10. **Document complex test setups**: Use comments

---

## Maintenance Plan

1. **Update tests with new features**: Add tests for every new feature
2. **Review test failures**: Don't ignore failing tests
3. **Refactor tests**: Keep tests clean and maintainable
4. **Monitor coverage**: Don't let coverage drop below targets
5. **Regular test audits**: Remove obsolete tests, add missing tests

---

## Questions to Address

1. Should we use Vitest or Jest? (Recommendation: Vitest for better speed and Vite integration)
2. Separate test database or use transactions? (Recommendation: Separate DB + transactions)
3. Test coverage enforcement in CI? (Recommendation: Yes, fail if < 80%)
4. Snapshot testing for email templates? (Recommendation: Yes)
5. Visual regression testing for emails? (Recommendation: Future consideration)
6. Load testing for queue processing? (Recommendation: Future consideration)
7. E2E tests with Playwright? (Recommendation: Phase 2, separate from this plan)

---

## Conclusion

This testing plan provides comprehensive coverage of the useSend backend, focusing on:
- **Unit tests** for business logic and utilities
- **Integration tests** for APIs and database operations
- **Workflow tests** for real production scenarios

By implementing this plan, you will:
- Catch bugs before production
- Ensure critical workflows function correctly
- Enable confident refactoring and feature development
- Maintain code quality standards
- Provide documentation through tests

Next step: Begin with Phase 1 (Infrastructure Setup) and progressively implement each phase.
