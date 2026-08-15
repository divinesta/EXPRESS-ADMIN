import { useEffect, useState } from "react";
import { apiBase, readApiError } from "../api";
import type { Model, RecordData } from "../types";

export const useModelData = (model: Model | undefined, page: number, search: string, filters: Record<string, string>, sort: string, dir: "asc" | "desc") => {
   const [records, setRecords] = useState<RecordData[]>([]);
   const [total, setTotal] = useState(0);
   const [totalPages, setTotalPages] = useState(1);
   const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
   const [error, setError] = useState("");
   const [reloadVersion, setReloadVersion] = useState(0);
   useEffect(() => {
      
		if (!model) return;
      
		const controller = new AbortController();
      const params = new URLSearchParams({ page: String(page), sort, dir });
      
		if (search) params.set("search", search);
      
		Object.entries(filters).forEach(([name, value]) => value && params.set(name, value));
      
		setStatus("loading");
      
		fetch(`${apiBase}/${model.meta.pluralName}?${params.toString()}`, { credentials: "include", headers: { Accept: "application/json" }, signal: controller.signal })
         .then(async (response) => {
            if (!response.ok) throw new Error(await readApiError(response));
            return response.json() as Promise<{ records: RecordData[]; total: number; totalPages: number }>;
         })
         .then((payload) => {
            setRecords(payload.records);
            setTotal(payload.total);
            setTotalPages(Math.max(payload.totalPages, 1));
            setStatus("ready");
         })
         .catch((reason: unknown) => {
            if (reason instanceof DOMException && reason.name === "AbortError") return;
            setError(reason instanceof Error ? reason.message : "Could not load records.");
            setStatus("error");
         });
      
			return () => controller.abort();
   }, [filters, model, page, reloadVersion, search, sort, dir]);
   
	return { records, total, totalPages, status, error, refresh: () => setReloadVersion((current) => current + 1) };
};
