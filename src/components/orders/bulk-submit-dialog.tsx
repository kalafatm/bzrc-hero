"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, XCircle, SkipForward } from "lucide-react";
import type { BulkResults } from "./order-types";

interface BulkSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  results: BulkResults | null;
}

export function BulkSubmitDialog({
  open,
  onOpenChange,
  submitting,
  results,
}: BulkSubmitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Submit Results</DialogTitle>
          <DialogDescription>
            {submitting
              ? "Processing orders..."
              : results
                ? `${results.summary.success} success, ${results.summary.skipped} skipped, ${results.summary.errors} errors`
                : "Starting..."}
          </DialogDescription>
        </DialogHeader>

        {submitting && !results && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Submitting orders to carrier...
            </p>
          </div>
        )}

        {results && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Badge className="bg-green-100 text-green-700">
                {results.summary.success} Success
              </Badge>
              <Badge className="bg-yellow-100 text-yellow-700">
                {results.summary.skipped} Skipped
              </Badge>
              <Badge className="bg-red-100 text-red-700">
                {results.summary.errors} Errors
              </Badge>
            </div>

            <div className="space-y-1.5">
              {results.results.map((r) => (
                <div
                  key={r.orderId}
                  className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${
                    r.status === "success"
                      ? "border-green-200 bg-green-50"
                      : r.status === "skipped"
                        ? "border-yellow-200 bg-yellow-50"
                        : "border-red-200 bg-red-50"
                  }`}
                >
                  {r.status === "success" ? (
                    <CheckCircle2 className="size-4 text-green-600 mt-0.5 shrink-0" />
                  ) : r.status === "skipped" ? (
                    <SkipForward className="size-4 text-yellow-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-red-600 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      Order #{r.orderNumber || r.orderId}
                    </div>
                    {r.awb && (
                      <div className="text-xs text-green-700">AWB: {r.awb}</div>
                    )}
                    {r.error && (
                      <div className="text-xs text-muted-foreground truncate">
                        {r.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
