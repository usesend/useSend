"use client";

import { H1 } from "@usesend/ui";
import { Button } from "@usesend/ui/src/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import DuplicatesList from "./duplicates-list";

export default function DuplicatesPage() {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/contacts">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <H1>Duplicate Contacts</H1>
          <p className="text-sm text-muted-foreground mt-1">
            Find and merge contacts that appear in multiple contact books
          </p>
        </div>
      </div>
      <DuplicatesList />
    </div>
  );
}
