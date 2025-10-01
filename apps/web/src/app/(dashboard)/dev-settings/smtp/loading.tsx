import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@usesend/ui/src/card";
  
  export default function Loading() {
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
              <div className="ml-1 border bg-primary/10 rounded-lg mt-1 p-2 w-full h-10 animate-pulse" />
            </div>
            <div>
              <strong>Port:</strong>
              <div className="ml-1 rounded-lg mt-1 p-2 w-full bg-primary/10 h-10 animate-pulse" />
              <p className="ml-1 mt-1 text-zinc-500 text-sm">
                For encrypted/TLS connections use{" "}
                <strong className="font-mono">2465</strong>,{" "}
                <strong className="font-mono">587</strong> or{" "}
                <strong className="font-mono">2587</strong>
              </p>
            </div>
            <div>
              <strong>User:</strong>
              <div className="ml-1 rounded-lg mt-1 p-2 w-full bg-primary/10 h-10 animate-pulse" />
            </div>
            <div>
              <strong>Password:</strong>
              <div className="ml-1 rounded-lg mt-1 p-2 w-full bg-primary/10 h-10 animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }