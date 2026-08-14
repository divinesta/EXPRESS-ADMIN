import { useEffect, useId, useState } from "react";
import { apiBase, readApiError } from "../api";
import type { RecordData } from "../types";

export type RelationSelectModel = {
   label: string;
   pluralName: string;
   idField: string;
   displayField: string;
};

export const RelationSelect = ({ label, model, value, selectedLabel, error, onChange }: { label: string; model: RelationSelectModel; value: string; selectedLabel?: string; error?: string; onChange: (value: string) => void }) => {
   const inputId = useId();
   const listboxId = useId();
   const [query, setQuery] = useState("");
   const [selectionLabel, setSelectionLabel] = useState(selectedLabel ?? "");
   const [records, setRecords] = useState<RecordData[]>([]);
   const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
   const [message, setMessage] = useState("");

   useEffect(() => {
      if (!value) {
         setSelectionLabel("");
         return;
      }
      if (selectedLabel && !selectionLabel) setSelectionLabel(selectedLabel);
   }, [selectedLabel, selectionLabel, value]);

   useEffect(() => {
      const search = query.trim();
      if (search.length < 2) {
         setRecords([]);
         setStatus("idle");
         return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
         setStatus("loading");
         fetch(`${apiBase}/${model.pluralName}?${new URLSearchParams({ search, page: "1" })}`, {
            credentials: "include",
            headers: { Accept: "application/json" },
            signal: controller.signal,
         })
            .then(async (response) => {
               if (!response.ok) throw new Error(await readApiError(response));
               return response.json() as Promise<{ records: RecordData[] }>;
            })
            .then((response) => {
               setRecords(response.records);
               setStatus("ready");
            })
            .catch((reason: unknown) => {
               if (reason instanceof DOMException && reason.name === "AbortError") return;
               setMessage(reason instanceof Error ? reason.message : "Could not search related records.");
               setStatus("error");
            });
      }, 250);

      return () => {
         window.clearTimeout(timeout);
         controller.abort();
      };
   }, [model.pluralName, query]);

   const selectRecord = (record: RecordData) => {
      onChange(String(record[model.idField]));
      const displayValue = String(record[model.displayField] ?? record[model.idField]);
      setQuery(displayValue);
      setSelectionLabel(displayValue);
      setRecords([]);
      setStatus("idle");
   };

   return (
      <div className={`relation-select ${error ? "has-error" : ""}`}>
         <label className="form-label" htmlFor={inputId}>{label}</label>
         <div className="relation-search-row">
            <input
               id={inputId}
               type="search"
               autoComplete="off"
               aria-controls={listboxId}
               aria-describedby={`${inputId}-help`}
               aria-expanded={records.length > 0}
               placeholder={`Search ${model.pluralName} by ${model.displayField}`}
               value={query}
               onChange={(event) => setQuery(event.target.value)}
            />
            {value && <button className="relation-clear" type="button" onClick={() => { onChange(""); setQuery(""); setSelectionLabel(""); }}>Clear</button>}
         </div>
         <span className="relation-help" id={`${inputId}-help`}>
            {value ? `Selected: ${selectionLabel || selectedLabel || value}` : "Type at least two characters, then choose a result."}
         </span>
         {status === "loading" && <span className="relation-help">Searching…</span>}
         {status === "error" && <span className="form-error">{message}</span>}
         {status === "ready" && records.length === 0 && <span className="relation-help">No matching records found.</span>}
         {records.length > 0 && (
            <ul className="relation-results" id={listboxId} role="listbox" aria-label={`${label} search results`}>
               {records.map((record) => {
                  const id = String(record[model.idField]);
                  const displayValue = String(record[model.displayField] ?? id);
                  return (
                     <li key={id} role="option" aria-selected={id === value}>
                        <button type="button" onClick={() => selectRecord(record)}>
                           <strong>{displayValue}</strong>
                           <span>{id}</span>
                        </button>
                     </li>
                  );
               })}
            </ul>
         )}
         {error && <span className="form-error">{error}</span>}
      </div>
   );
};
