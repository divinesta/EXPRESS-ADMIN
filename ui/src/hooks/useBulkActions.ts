import { useState } from "react";
import { apiBase, readApiError } from "../api";
import type { Model } from "../types";

export const useBulkActions = (model: Model | undefined) => {
   const [status, setStatus] = useState<"idle" | "running">("idle");
   const [message, setMessage] = useState("");
   const [error, setError] = useState("");

   const run = async (actionName: string, ids: string[]) => {
      if (!model) return false;
      setStatus("running");
      setError("");
      setMessage("");
      try {
         const response = await fetch(`${apiBase}/${model.meta.pluralName}/actions/${encodeURIComponent(actionName)}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ ids }),
         });
         if (!response.ok) throw new Error(await readApiError(response));
         const result = (await response.json()) as { message?: string };
         setMessage(result.message ?? "Action completed.");
         return true;
      } catch (reason: unknown) {
         setError(reason instanceof Error ? reason.message : "Could not run the action.");
         return false;
      } finally {
         setStatus("idle");
      }
   };

   return { status, message, error, run };
};
