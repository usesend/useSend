"use client";

import TemplateList from "./template-list";
import CreateTemplate from "./create-template";
import { H1 } from "@usesend/ui";

export default function TemplatesPage() {
  return (
    <div>
      <div className="flex justify-between items-center">
        <H1>Templates</H1>
        <CreateTemplate />
      </div>
      <TemplateList />
    </div>
  );
}
