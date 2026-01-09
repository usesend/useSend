"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@usesend/ui/src/card";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@usesend/ui/src/alert";
import { InfoIcon, KeyRound } from "lucide-react";
import Link from "next/link";
import { api } from "~/trpc/react";

export default function SmtpSettingsPage() {
  const smtpQuery = api.settings.getSmtpSettings.useQuery();
  const apiKeysQuery = api.apiKey.apiKeys.useQuery();

  const smtpHost = smtpQuery.data?.host || "smtp.usesend.com";
  const smtpUser = smtpQuery.data?.user || "usesend";
  const hasApiKeys = apiKeysQuery.data && apiKeysQuery.data.length > 0;

  return (
    <div className="space-y-6 mt-9 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>SMTP Configuration</CardTitle>
          <CardDescription>
            Send emails using SMTP instead of the REST API. Use these settings
            to configure your email client or application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Host
              </label>
              <TextWithCopyButton
                className="mt-1 border bg-muted/50 rounded-lg p-3 w-full font-mono text-sm"
                value={smtpHost}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Port
              </label>
              <TextWithCopyButton
                className="mt-1 border bg-muted/50 rounded-lg p-3 w-full font-mono text-sm"
                value="465"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Alternative ports:{" "}
                <code className="bg-muted px-1 rounded">2465</code> (TLS),{" "}
                <code className="bg-muted px-1 rounded">587</code> (STARTTLS),{" "}
                <code className="bg-muted px-1 rounded">2587</code> (STARTTLS)
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Username
              </label>
              <TextWithCopyButton
                className="mt-1 border bg-muted/50 rounded-lg p-3 w-full font-mono text-sm"
                value={smtpUser}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Password
              </label>
              <div className="mt-1 border bg-muted/50 rounded-lg p-3 w-full">
                <div className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Use your API key as the password
                  </span>
                </div>
              </div>
              {!hasApiKeys && (
                <p className="mt-2 text-sm text-muted-foreground">
                  You need an API key to authenticate.{" "}
                  <Link
                    href="/dev-settings/api-keys"
                    className="text-primary underline underline-offset-4"
                  >
                    Create an API key
                  </Link>
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <InfoIcon className="h-4 w-4" />
        <AlertTitle>How to use SMTP</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>
            Configure your email client or application with the settings above.
            Use your API key as the password for authentication.
          </p>
          <p className="text-sm">
            Example with Nodemailer:
          </p>
          <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-x-auto">
{`const transporter = nodemailer.createTransport({
  host: "${smtpHost}",
  port: 465,
  secure: true,
  auth: {
    user: "${smtpUser}",
    pass: "YOUR_API_KEY"
  }
});`}
          </pre>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            • Always use TLS/SSL encryption (port 465 or 587 with STARTTLS)
          </p>
          <p>
            • Never share your API key or commit it to version control
          </p>
          <p>
            • Use environment variables to store your API key in production
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
