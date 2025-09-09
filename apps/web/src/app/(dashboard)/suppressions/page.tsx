"use client";

import { useState } from "react";
import AddSuppressionDialog from "./add-suppression";
import BulkAddSuppressionsDialog from "./bulk-add-suppressions";
import SuppressionList from "./suppression-list";
import SuppressionStats from "./suppression-stats";
import { Button } from "@usesend/ui/src/button";
import { Plus, Upload } from "lucide-react";
import { H1 } from "@usesend/ui";

export default function SuppressionsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBulkAddDialog, setShowBulkAddDialog] = useState(false);

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <H1>Suppression List</H1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulkAddDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Bulk Add
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Suppression
          </Button>
        </div>
      </div>

      {/* Stats */}
      <SuppressionStats />

      {/* Suppression List */}
      <SuppressionList />

      {/* Dialogs */}
      <AddSuppressionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />

      <BulkAddSuppressionsDialog
        open={showBulkAddDialog}
        onOpenChange={setShowBulkAddDialog}
      />
    </div>
  );
}
