"use client";

import AddContactBook from "./add-contact-book";
import ContactBooksList from "./contact-books-list";
import { H1 } from "@usesend/ui";
import { Button } from "@usesend/ui/src/button";
import { Copy } from "lucide-react";
import Link from "next/link";

export default function ContactsPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Contact books</H1>
        <div className="flex gap-2">
          <Link href="/contacts/duplicates">
            <Button variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Find Duplicates
            </Button>
          </Link>
          <AddContactBook />
        </div>
      </div>
      <ContactBooksList />
    </div>
  );
}
