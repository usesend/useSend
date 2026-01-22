# Custom Tracking Domain Implementation Plan

## Overview

This document outlines the implementation plan for adding Custom Tracking Domain support to UseSend. This feature allows users to configure custom tracking domains (e.g., `track.example.com`) for click and open tracking instead of the default AWS SES tracking links (`r.{region}.awstrack.me`).

**Benefits:**
- Improved email deliverability by avoiding shared tracking domains
- Isolated sender reputation
- Reduced spam filtering risk
- Consistent branding in email links
- Alignment with ESP best practices (SendGrid, Postmark, Mailgun)

---

## Task 1: Database Schema Changes

**File:** `/apps/web/prisma/schema.prisma`

### 1.1 Add Tracking Domain Fields to Domain Model

Add the following fields to the `Domain` model to store custom tracking domain configuration:

```prisma
model Domain {
  // ... existing fields ...

  // Custom tracking domain fields
  trackingDomain         String?       // e.g., "track.example.com"
  trackingDomainStatus   DomainStatus  @default(NOT_STARTED)
  trackingDomainError    String?       // Error message if verification fails
  trackingDomainVerifiedAt DateTime?   // When the tracking domain was verified
}
```

### 1.2 Create Database Migration

Run Prisma migration to apply schema changes:

```bash
npx prisma migrate dev --name add_custom_tracking_domain
```

### 1.3 Update Prisma Client Types

The migration will auto-generate updated TypeScript types.

---

## Task 2: AWS SES Integration for Custom Tracking Domains

**Files to modify:**
- `/apps/web/src/server/aws/ses.ts`

### 2.1 Add AWS SDK Import for Tracking Options

Add the required AWS SDK command imports:

```typescript
import {
  // ... existing imports ...
  PutConfigurationSetTrackingOptionsCommand,
  GetConfigurationSetCommand,
} from "@aws-sdk/client-sesv2";
```

### 2.2 Create Function to Set Custom Tracking Domain

Add a new function to configure custom redirect domain on a Configuration Set:

```typescript
/**
 * Sets a custom tracking domain on all configuration sets for a region.
 * AWS SES will automatically provision an HTTPS certificate for the domain.
 *
 * @param trackingDomain - The custom tracking domain (e.g., "track.example.com")
 * @param region - AWS region
 * @param configSetNames - Array of configuration set names to update
 */
export async function setCustomTrackingDomain(
  trackingDomain: string,
  region: string,
  configSetNames: string[]
): Promise<{ success: boolean; error?: string }> {
  const sesClient = getSesClient(region);

  for (const configSetName of configSetNames) {
    const command = new PutConfigurationSetTrackingOptionsCommand({
      ConfigurationSetName: configSetName,
      CustomRedirectDomain: trackingDomain,
    });

    try {
      await sesClient.send(command);
    } catch (error) {
      return {
        success: false,
        error: `Failed to set tracking domain on ${configSetName}: ${error}`
      };
    }
  }

  return { success: true };
}
```

### 2.3 Create Function to Remove Custom Tracking Domain

Add function to revert to default SES tracking:

```typescript
/**
 * Removes custom tracking domain from configuration sets, reverting to default SES tracking.
 */
export async function removeCustomTrackingDomain(
  region: string,
  configSetNames: string[]
): Promise<{ success: boolean; error?: string }> {
  const sesClient = getSesClient(region);

  for (const configSetName of configSetNames) {
    const command = new PutConfigurationSetTrackingOptionsCommand({
      ConfigurationSetName: configSetName,
      CustomRedirectDomain: "", // Empty string removes custom domain
    });

    try {
      await sesClient.send(command);
    } catch (error) {
      return {
        success: false,
        error: `Failed to remove tracking domain from ${configSetName}: ${error}`
      };
    }
  }

  return { success: true };
}
```

### 2.4 Create Function to Get Configuration Set Tracking Status

Add function to check current tracking domain configuration:

```typescript
/**
 * Gets the current tracking domain configuration for a configuration set.
 */
export async function getTrackingDomainConfig(
  configSetName: string,
  region: string
): Promise<{ trackingDomain?: string; status?: string }> {
  const sesClient = getSesClient(region);

  const command = new GetConfigurationSetCommand({
    ConfigurationSetName: configSetName,
    ConfigurationSetAttributeNames: ["trackingOptions"],
  });

  const response = await sesClient.send(command);
  return {
    trackingDomain: response.TrackingOptions?.CustomRedirectDomain,
  };
}
```

---

## Task 3: Domain Service Updates

**File:** `/apps/web/src/server/service/domain-service.ts`

### 3.1 Add Tracking Domain DNS Record Helper

Extend `buildDnsRecords` function to include tracking domain CNAME:

```typescript
function buildDnsRecords(domain: Domain): DomainDnsRecord[] {
  const records = [
    // ... existing MX, TXT records ...
  ];

  // Add tracking domain CNAME record if configured
  if (domain.trackingDomain) {
    records.push({
      type: "CNAME",
      name: extractSubdomain(domain.trackingDomain), // e.g., "track" from "track.example.com"
      value: `r.${domain.region}.awstrack.me`,
      ttl: "Auto",
      status: domain.trackingDomainStatus,
    });
  }

  return records;
}

// Helper to extract subdomain from tracking domain
function extractSubdomain(trackingDomain: string): string {
  const parts = trackingDomain.split('.');
  return parts[0] || trackingDomain;
}
```

### 3.2 Create Tracking Domain Verification Function

Add a new function to verify tracking domain CNAME:

```typescript
import dns from "dns";
import util from "util";

const dnsResolveCname = util.promisify(dns.resolveCname);

/**
 * Verifies that the tracking domain CNAME is correctly configured.
 *
 * @param trackingDomain - The custom tracking domain to verify
 * @param region - AWS region for expected CNAME target
 * @returns Verification result with status
 */
export async function verifyTrackingDomainCname(
  trackingDomain: string,
  region: string
): Promise<{ verified: boolean; error?: string }> {
  const expectedTarget = `r.${region}.awstrack.me`;

  try {
    const records = await dnsResolveCname(trackingDomain);

    // Check if any CNAME record points to the expected target
    const hasValidCname = records.some(
      record => record.toLowerCase() === expectedTarget.toLowerCase()
    );

    if (hasValidCname) {
      return { verified: true };
    }

    return {
      verified: false,
      error: `CNAME does not point to ${expectedTarget}. Found: ${records.join(", ")}`
    };
  } catch (error: any) {
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
      return { verified: false, error: "CNAME record not found" };
    }
    return { verified: false, error: error.message };
  }
}
```

### 3.3 Add Set Tracking Domain Function

Create the main function to set and verify a custom tracking domain:

```typescript
import * as ses from "~/server/aws/ses";
import { SesSettingsService } from "./ses-settings-service";

/**
 * Sets a custom tracking domain for a domain.
 * This involves:
 * 1. Validating the tracking domain format
 * 2. Verifying DNS CNAME configuration
 * 3. Configuring AWS SES with the custom redirect domain
 * 4. Updating the database
 */
export async function setTrackingDomain(
  domainId: number,
  teamId: number,
  trackingDomain: string
): Promise<{ success: boolean; error?: string; dnsRecord?: DomainDnsRecord }> {
  // Fetch the domain
  const domain = await db.domain.findFirst({
    where: { id: domainId, teamId },
  });

  if (!domain) {
    throw new UnsendApiError({ code: "NOT_FOUND", message: "Domain not found" });
  }

  // Validate tracking domain belongs to or is subdomain of the sending domain
  if (!isValidTrackingDomain(trackingDomain, domain.name)) {
    throw new UnsendApiError({
      code: "BAD_REQUEST",
      message: "Tracking domain must be a subdomain of the sending domain",
    });
  }

  // Get SES settings for the region
  const sesSetting = await SesSettingsService.getSetting(domain.region);
  if (!sesSetting) {
    throw new UnsendApiError({
      code: "INTERNAL_SERVER_ERROR",
      message: "SES settings not found for region",
    });
  }

  // Update domain with pending status
  await db.domain.update({
    where: { id: domainId },
    data: {
      trackingDomain,
      trackingDomainStatus: "PENDING",
      trackingDomainError: null,
    },
  });

  // Return the required DNS record for the user to configure
  const dnsRecord: DomainDnsRecord = {
    type: "CNAME",
    name: extractSubdomain(trackingDomain),
    value: `r.${domain.region}.awstrack.me`,
    ttl: "Auto",
    status: "PENDING",
  };

  return { success: true, dnsRecord };
}

function isValidTrackingDomain(trackingDomain: string, sendingDomain: string): boolean {
  // Tracking domain should end with the sending domain
  // e.g., "track.example.com" is valid for "example.com"
  return trackingDomain.endsWith(`.${sendingDomain}`) ||
         trackingDomain === sendingDomain;
}
```

### 3.4 Add Verify Tracking Domain Function

Create function to verify and activate tracking domain:

```typescript
/**
 * Verifies the tracking domain CNAME and activates it on AWS SES.
 */
export async function verifyAndActivateTrackingDomain(
  domainId: number,
  teamId: number
): Promise<{ success: boolean; status: DomainStatus; error?: string }> {
  const domain = await db.domain.findFirst({
    where: { id: domainId, teamId },
  });

  if (!domain || !domain.trackingDomain) {
    throw new UnsendApiError({
      code: "NOT_FOUND",
      message: "Domain or tracking domain not found",
    });
  }

  // Verify DNS CNAME
  const dnsResult = await verifyTrackingDomainCname(domain.trackingDomain, domain.region);

  if (!dnsResult.verified) {
    await db.domain.update({
      where: { id: domainId },
      data: {
        trackingDomainStatus: "FAILED",
        trackingDomainError: dnsResult.error,
      },
    });
    return { success: false, status: "FAILED", error: dnsResult.error };
  }

  // Get all config set names for this region
  const sesSetting = await SesSettingsService.getSetting(domain.region);
  if (!sesSetting) {
    throw new Error("SES settings not found");
  }

  const configSetNames = [
    sesSetting.configClick,
    sesSetting.configOpen,
    sesSetting.configFull,
  ].filter(Boolean) as string[];

  // Configure AWS SES with custom tracking domain
  const sesResult = await ses.setCustomTrackingDomain(
    domain.trackingDomain,
    domain.region,
    configSetNames
  );

  if (!sesResult.success) {
    await db.domain.update({
      where: { id: domainId },
      data: {
        trackingDomainStatus: "FAILED",
        trackingDomainError: sesResult.error,
      },
    });
    return { success: false, status: "FAILED", error: sesResult.error };
  }

  // Update domain status
  await db.domain.update({
    where: { id: domainId },
    data: {
      trackingDomainStatus: "SUCCESS",
      trackingDomainError: null,
      trackingDomainVerifiedAt: new Date(),
    },
  });

  await emitDomainEvent(domain, "domain.updated");

  return { success: true, status: "SUCCESS" };
}
```

### 3.5 Add Remove Tracking Domain Function

```typescript
/**
 * Removes custom tracking domain and reverts to default SES tracking.
 */
export async function removeTrackingDomain(
  domainId: number,
  teamId: number
): Promise<{ success: boolean; error?: string }> {
  const domain = await db.domain.findFirst({
    where: { id: domainId, teamId },
  });

  if (!domain) {
    throw new UnsendApiError({ code: "NOT_FOUND", message: "Domain not found" });
  }

  // Get config set names
  const sesSetting = await SesSettingsService.getSetting(domain.region);
  if (!sesSetting) {
    throw new Error("SES settings not found");
  }

  const configSetNames = [
    sesSetting.configClick,
    sesSetting.configOpen,
    sesSetting.configFull,
  ].filter(Boolean) as string[];

  // Remove from AWS SES
  const sesResult = await ses.removeCustomTrackingDomain(domain.region, configSetNames);

  if (!sesResult.success) {
    return { success: false, error: sesResult.error };
  }

  // Update database
  await db.domain.update({
    where: { id: domainId },
    data: {
      trackingDomain: null,
      trackingDomainStatus: "NOT_STARTED",
      trackingDomainError: null,
      trackingDomainVerifiedAt: null,
    },
  });

  await emitDomainEvent(domain, "domain.updated");

  return { success: true };
}
```

### 3.6 Update Domain Payload for Webhooks

Update `buildDomainPayload` function to include tracking domain fields:

```typescript
function buildDomainPayload(domain: Domain): DomainPayload {
  return {
    // ... existing fields ...
    trackingDomain: domain.trackingDomain,
    trackingDomainStatus: domain.trackingDomainStatus,
  };
}
```

---

## Task 4: Update Types and Schemas

### 4.1 Update DomainDnsRecord Type

**File:** `/apps/web/src/types/domain.ts`

```typescript
export type DomainDnsRecord = {
  type: "MX" | "TXT" | "CNAME";  // Add CNAME
  name: string;
  value: string;
  ttl: string;
  priority?: string | null;
  status: DomainStatus;
  recommended?: boolean;
};
```

### 4.2 Update Domain Zod Schema

**File:** `/apps/web/src/lib/zod/domain-schema.ts`

```typescript
export const DomainDnsRecordSchema = z.object({
  type: z.enum(["MX", "TXT", "CNAME"]).openapi({  // Add CNAME
    description: "DNS record type",
    example: "TXT",
  }),
  // ... rest unchanged
});

export const DomainSchema = z.object({
  // ... existing fields ...

  // New tracking domain fields
  trackingDomain: z.string().optional().nullish().openapi({
    description: "Custom tracking domain for click/open tracking",
    example: "track.example.com",
  }),
  trackingDomainStatus: DomainStatusSchema.optional().openapi({
    description: "Verification status of the custom tracking domain",
  }),
  trackingDomainError: z.string().optional().nullish().openapi({
    description: "Error message if tracking domain verification failed",
  }),
  trackingDomainVerifiedAt: z.string().optional().nullish().openapi({
    description: "Timestamp when tracking domain was verified",
  }),
});
```

---

## Task 5: tRPC API Endpoints

**File:** `/apps/web/src/server/api/routers/domain.ts`

### 5.1 Add setTrackingDomain Endpoint

```typescript
import {
  setTrackingDomain,
  verifyAndActivateTrackingDomain,
  removeTrackingDomain,
} from "~/server/service/domain-service";

export const domainRouter = createTRPCRouter({
  // ... existing endpoints ...

  setTrackingDomain: domainProcedure
    .input(z.object({
      trackingDomain: z.string().min(1).regex(
        /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
        "Invalid domain format"
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      return setTrackingDomain(input.id, ctx.team.id, input.trackingDomain);
    }),

  verifyTrackingDomain: domainProcedure
    .mutation(async ({ ctx, input }) => {
      return verifyAndActivateTrackingDomain(input.id, ctx.team.id);
    }),

  removeTrackingDomain: domainProcedure
    .mutation(async ({ ctx, input }) => {
      return removeTrackingDomain(input.id, ctx.team.id);
    }),
});
```

---

## Task 6: Public REST API Endpoints

### 6.1 Create Set Tracking Domain Endpoint

**File:** `/apps/web/src/server/public-api/api/domains/set-tracking-domain.ts`

```typescript
import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import { setTrackingDomain } from "~/server/service/domain-service";

const route = createRoute({
  method: "post",
  path: "/v1/domains/{id}/tracking-domain",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: { name: "id", in: "path" },
        example: 1,
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            trackingDomain: z.string().openapi({
              description: "Custom tracking domain (e.g., track.example.com)",
              example: "track.example.com",
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            dnsRecord: z.object({
              type: z.literal("CNAME"),
              name: z.string(),
              value: z.string(),
              ttl: z.string(),
              status: z.string(),
            }).optional(),
          }),
        },
      },
      description: "Tracking domain configured, DNS record returned",
    },
  },
});

function setTrackingDomainEndpoint(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const id = c.req.valid("param").id;
    const { trackingDomain } = c.req.valid("json");

    // Enforce API key domain restriction
    if (team.apiKey.domainId && team.apiKey.domainId !== id) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Domain not found" });
    }

    const result = await setTrackingDomain(id, team.id, trackingDomain);
    return c.json(result);
  });
}

export default setTrackingDomainEndpoint;
```

### 6.2 Create Verify Tracking Domain Endpoint

**File:** `/apps/web/src/server/public-api/api/domains/verify-tracking-domain.ts`

```typescript
import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import { verifyAndActivateTrackingDomain } from "~/server/service/domain-service";

const route = createRoute({
  method: "post",
  path: "/v1/domains/{id}/tracking-domain/verify",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: { name: "id", in: "path" },
        example: 1,
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            status: z.string(),
            error: z.string().optional(),
          }),
        },
      },
      description: "Tracking domain verification result",
    },
  },
});

function verifyTrackingDomainEndpoint(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const id = c.req.valid("param").id;

    if (team.apiKey.domainId && team.apiKey.domainId !== id) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Domain not found" });
    }

    const result = await verifyAndActivateTrackingDomain(id, team.id);
    return c.json(result);
  });
}

export default verifyTrackingDomainEndpoint;
```

### 6.3 Create Delete Tracking Domain Endpoint

**File:** `/apps/web/src/server/public-api/api/domains/delete-tracking-domain.ts`

```typescript
import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { UnsendApiError } from "../../api-error";
import { removeTrackingDomain } from "~/server/service/domain-service";

const route = createRoute({
  method: "delete",
  path: "/v1/domains/{id}/tracking-domain",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: { name: "id", in: "path" },
        example: 1,
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            success: z.boolean(),
            error: z.string().optional(),
          }),
        },
      },
      description: "Tracking domain removed",
    },
  },
});

function deleteTrackingDomainEndpoint(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const id = c.req.valid("param").id;

    if (team.apiKey.domainId && team.apiKey.domainId !== id) {
      throw new UnsendApiError({ code: "NOT_FOUND", message: "Domain not found" });
    }

    const result = await removeTrackingDomain(id, team.id);
    return c.json(result);
  });
}

export default deleteTrackingDomainEndpoint;
```

### 6.4 Register New Endpoints

**File:** Update the public API router to include new endpoints (find the domains router registration file and add these).

---

## Task 7: Frontend UI Changes

### 7.1 Update Domain Settings Component

**File:** `/apps/web/src/app/(dashboard)/domains/[domainId]/page.tsx`

Add a new "Custom Tracking Domain" section to `DomainSettings` component:

```tsx
const DomainSettings: React.FC<{ domain: DomainResponse }> = ({ domain }) => {
  // ... existing state ...

  const [trackingDomainInput, setTrackingDomainInput] = React.useState(
    domain.trackingDomain || ""
  );

  const setTrackingDomain = api.domain.setTrackingDomain.useMutation();
  const verifyTrackingDomain = api.domain.verifyTrackingDomain.useMutation();
  const removeTrackingDomainMutation = api.domain.removeTrackingDomain.useMutation();

  const handleSetTrackingDomain = () => {
    setTrackingDomain.mutate(
      { id: domain.id, trackingDomain: trackingDomainInput },
      {
        onSuccess: () => {
          utils.domain.invalidate();
          toast.success("Tracking domain configured. Please add the DNS record.");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleVerifyTrackingDomain = () => {
    verifyTrackingDomain.mutate(
      { id: domain.id },
      {
        onSuccess: (result) => {
          utils.domain.invalidate();
          if (result.success) {
            toast.success("Tracking domain verified and activated!");
          } else {
            toast.error(result.error || "Verification failed");
          }
        },
      }
    );
  };

  const handleRemoveTrackingDomain = () => {
    removeTrackingDomainMutation.mutate(
      { id: domain.id },
      {
        onSuccess: () => {
          utils.domain.invalidate();
          setTrackingDomainInput("");
          toast.success("Tracking domain removed");
        },
      }
    );
  };

  return (
    <div className="rounded-lg shadow p-4 border flex flex-col gap-6">
      {/* ... existing click/open tracking settings ... */}

      {/* Custom Tracking Domain Section */}
      <div className="flex flex-col gap-2">
        <div className="font-semibold">Custom Tracking Domain</div>
        <p className="text-muted-foreground text-sm">
          Use a custom domain for click and open tracking links to improve
          deliverability and maintain brand consistency.
        </p>

        {domain.trackingDomain ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{domain.trackingDomain}</span>
              <DomainStatusBadge status={domain.trackingDomainStatus || "NOT_STARTED"} />
            </div>

            {domain.trackingDomainStatus !== "SUCCESS" && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleVerifyTrackingDomain}
                  disabled={verifyTrackingDomain.isPending}
                >
                  {verifyTrackingDomain.isPending ? "Verifying..." : "Verify DNS"}
                </Button>
              </div>
            )}

            {domain.trackingDomainError && (
              <p className="text-destructive text-sm">{domain.trackingDomainError}</p>
            )}

            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemoveTrackingDomain}
              disabled={removeTrackingDomainMutation.isPending}
            >
              Remove Tracking Domain
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={trackingDomainInput}
              onChange={(e) => setTrackingDomainInput(e.target.value)}
              placeholder={`track.${domain.name}`}
              className="flex-1 px-3 py-2 border rounded-md"
            />
            <Button
              onClick={handleSetTrackingDomain}
              disabled={!trackingDomainInput || setTrackingDomain.isPending}
            >
              {setTrackingDomain.isPending ? "Setting..." : "Set Domain"}
            </Button>
          </div>
        )}
      </div>

      {/* ... existing danger zone ... */}
    </div>
  );
};
```

### 7.2 Update DNS Records Table

The DNS records table will automatically show the CNAME record for the tracking domain since we updated `buildDnsRecords` to include it. Ensure the table handles CNAME type properly:

```tsx
// In the DNS records table, update any type-specific rendering if needed
{(domainQuery.data?.dnsRecords ?? []).map((record) => {
  // Handle CNAME records same as others - no changes needed if using generic rendering
})}
```

---

## Task 8: Webhook Events Update

### 8.1 Update Webhook Event Types

**File:** `/packages/lib/src/webhook/webhook-events.ts` (or wherever DomainPayload is defined)

```typescript
export interface DomainPayload {
  // ... existing fields ...
  trackingDomain?: string | null;
  trackingDomainStatus?: string | null;
}
```

This ensures webhook consumers receive tracking domain information in domain events.

---

## Task 9: Migration Strategy for Existing Users

### 9.1 Database Migration Safety

The schema changes add new optional fields, so existing data remains unaffected:
- `trackingDomain` defaults to `null`
- `trackingDomainStatus` defaults to `NOT_STARTED`
- No data migration needed

### 9.2 Feature Rollout

1. **Phase 1**: Deploy backend changes without UI
2. **Phase 2**: Enable UI for beta users via feature flag (optional)
3. **Phase 3**: General availability

### 9.3 Backward Compatibility

- Existing domains continue to use default SES tracking links
- No breaking changes to existing API contracts
- New fields are optional in API responses

---

## Task 10: Testing Considerations

### 10.1 Unit Tests

- DNS CNAME verification logic
- Tracking domain validation (must be subdomain of sending domain)
- AWS SES configuration set updates

### 10.2 Integration Tests

- Full flow: set tracking domain -> configure DNS -> verify -> activate
- Remove tracking domain flow
- API endpoint authorization

### 10.3 Manual Testing Checklist

- [ ] Add tracking domain via UI
- [ ] Verify DNS record instructions are correct
- [ ] Verify tracking domain via UI
- [ ] Check that click/open tracking links use custom domain
- [ ] Remove tracking domain
- [ ] Verify fallback to default SES links
- [ ] Test API endpoints

---

## Implementation Order

1. **Task 1**: Database schema changes (migration)
2. **Task 4**: Update types and schemas
3. **Task 2**: AWS SES integration functions
4. **Task 3**: Domain service updates
5. **Task 5**: tRPC API endpoints
6. **Task 6**: Public REST API endpoints
7. **Task 7**: Frontend UI changes
8. **Task 8**: Webhook events update
9. **Task 9**: Migration/rollout
10. **Task 10**: Testing

---

## Files to Create/Modify Summary

### New Files
- `/apps/web/src/server/public-api/api/domains/set-tracking-domain.ts`
- `/apps/web/src/server/public-api/api/domains/verify-tracking-domain.ts`
- `/apps/web/src/server/public-api/api/domains/delete-tracking-domain.ts`

### Modified Files
- `/apps/web/prisma/schema.prisma`
- `/apps/web/src/server/aws/ses.ts`
- `/apps/web/src/server/service/domain-service.ts`
- `/apps/web/src/server/api/routers/domain.ts`
- `/apps/web/src/types/domain.ts`
- `/apps/web/src/lib/zod/domain-schema.ts`
- `/apps/web/src/app/(dashboard)/domains/[domainId]/page.tsx`
- `/packages/lib/src/webhook/webhook-events.ts`
- Public API router registration file

---

## Notes and Considerations

### AWS SES Limitations
- SES automatically provisions HTTPS certificates for custom tracking domains
- Certificate provisioning may take a few minutes after CNAME verification
- Each region shares configuration sets, so custom tracking domain applies region-wide

### Security Considerations
- Validate that tracking domain is a subdomain of the verified sending domain
- Prevent users from setting tracking domains they do not own

### Future Enhancements
- Per-domain tracking configuration (requires per-domain config sets)
- Custom tracking domain for specific email types (transactional vs marketing)
- SSL certificate status monitoring
