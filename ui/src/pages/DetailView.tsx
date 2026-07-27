import { useEffect, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { apiBase, fetchRecord, readApiError } from "../api";
import { ApiNotice, NotFound } from "../components/Feedback";
import type { RecordData, Schema } from "../types";
import { fieldLabel, formatRecordValue } from "../utils/format";

export const DetailView = ({ schema }: { schema: Schema }) => {
   const { model: modelPath, id } = useParams();
   const navigate = useNavigate();
   const model = schema.models.find((candidate) => candidate.meta.pluralName === modelPath);
   const [record, setRecord] = useState<RecordData | null>(null);
   const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
   const [error, setError] = useState("");
   useEffect(() => {
      if (!model || !id) return;
      fetchRecord(model.meta.pluralName, id)
         .then((data) => {
            setRecord(data);
            setStatus("ready");
         })
         .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Could not load this record.");
            setStatus("error");
         });
   }, [id, model]);
   if (!model || !model.config.permissions.view) return <NotFound />;
   if (status === "loading")
      return (
         <div className="table-card table-state">
            <span className="spinner" /> Loading record…
         </div>
      );
   if (status === "error" || !record) return <ApiNotice message={error || "Record not found."} />;
   const remove = async () => {
      if (!window.confirm(`Delete this ${model.meta.name}?`)) return;
      const response = await fetch(`${apiBase}/${model.meta.pluralName}/${encodeURIComponent(id ?? "")}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
         setError(await readApiError(response));
         return;
      }
      navigate(`/${model.meta.pluralName}`);
   };
   return (
      <section className="page-section">
         <div className="page-heading model-list-heading">
            <div>
               <div className="eyebrow">Record detail</div>
               <h1>{String(record[model.meta.displayField] ?? id)}</h1>
               <p>
                  {model.meta.name} · {id}
               </p>
            </div>
            <div className="detail-actions">
               {model.config.permissions.update && (
                  <NavLink className="primary-button" to={`/${model.meta.pluralName}/${encodeURIComponent(id ?? "")}/edit`}>
                     Edit record
                  </NavLink>
               )}
               {model.config.permissions.delete && (
                  <button className="danger-button" type="button" onClick={remove}>
                     Delete
                  </button>
               )}
            </div>
         </div>
         {error && <ApiNotice message={error} />}
         <div className="detail-grid">
            {model.meta.fields
               .filter((field) => !field.isList)
               .map((field) => (
                  <div className="detail-field" key={field.name}>
                     <span className="detail-label">{fieldLabel(field.name)}</span>
                     <strong>{formatRecordValue(record[field.name], field) || "—"}</strong>
                     <span className="detail-type">{field.type}</span>
                  </div>
               ))}
         </div>
      </section>
   );
};
