import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@usesend/ui/src/card";
import { TextWithCopyButton } from "@usesend/ui/src/text-with-copy";
import { env } from "~/env";

export const dynamic = "force-dynamic";

export default function ExampleCard() {
  const host = env.SMTP_HOST;
  const user = env.SMTP_USER;

  return (
    <Card className="mt-9 max-w-xl">
      <CardHeader>
        <CardTitle>SMTP</CardTitle>
        <CardDescription>
          Send emails using SMTP instead of the REST API. See documentation for
          more information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <strong>Host:</strong>
            <TextWithCopyButton
              className="ml-1 border bg-primary/10  rounded-lg mt-1 p-2 w-full "
              value={host}
            ></TextWithCopyButton>
          </div>
          <div>
            <strong>Port:</strong>
            <TextWithCopyButton
              className="ml-1 rounded-lg mt-1 p-2 w-full bg-primary/10 font-mono"
              value={"465"}
            ></TextWithCopyButton>
            <p className="ml-1 mt-1 text-zinc-500 text-sm ">
              For encrypted/TLS connections use{" "}
              <strong className="font-mono">2465</strong>,{" "}
              <strong className="font-mono">587</strong> or{" "}
              <strong className="font-mono">2587</strong>
            </p>
          </div>
          <div>
            <strong>User:</strong>
            <TextWithCopyButton
              className="ml-1 rounded-lg mt-1 p-2 w-full bg-primary/10"
              value={user}
            ></TextWithCopyButton>
          </div>
          <div>
            <strong>Password:</strong>
            <TextWithCopyButton
              className="ml-1 rounded-lg mt-1 p-2 w-full bg-primary/10"
              value={"YOUR_API_KEY"}
            ></TextWithCopyButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
