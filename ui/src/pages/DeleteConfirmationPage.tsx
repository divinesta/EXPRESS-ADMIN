import { AlertTriangle, ChevronLeft, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiBase, readApiError } from "../api";
import { ApiNotice, FullPageState, NotFound } from "../components/Feedback";
import { useBulkActions } from "../hooks/useBulkActions";
import type { DeletePreview, Field, Model, RecordData, Schema } from "../types";
import { fieldLabel, formatRecordValue } from "../utils/format";

export const DeleteConfirmationPage = ({ schema }: { schema: Schema }) => {
   const { model: modelPath } = useParams();
   const [searchParams] = useSearchParams();
   const navigate = useNavigate();
   const model = useMemo(() => schema.models.find((candidate) => candidate.meta.pluralName === modelPath), [modelPath, schema.models]);
   const idsParam = searchParams.get("ids") ?? "";
   const ids = useMemo(() => idsParam.split(",").map((id) => id.trim()).filter(Boolean), [idsParam]);
   const [preview, setPreview] = useState<DeletePreview | null>(null);
   const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
   const [error, setError] = useState("");
   const bulkActions = useBulkActions(model);

   useEffect(() => {
      if (!model || ids.length === 0) return;
      const controller = new AbortController();
      setStatus("loading");
      fetch(`${apiBase}/${model.meta.pluralName}/actions/delete-preview?${new URLSearchParams({ ids: ids.join(",") })}`, {
         credentials: "include",
         headers: { Accept: "application/json" },
         signal: controller.signal,
      })
         .then(async (response) => {
            if (!response.ok) throw new Error(await readApiError(response));
            return response.json() as Promise<DeletePreview>;
         })
         .then((payload) => {
            setPreview(payload);
            setStatus("ready");
         })
         .catch((reason: unknown) => {
            if (reason instanceof DOMException && reason.name === "AbortError") return;
            setError(reason instanceof Error ? reason.message : "Could not load delete confirmation.");
            setStatus("error");
         });
      return () => controller.abort();
   }, [ids, model]);

   if (!model || !model.config.permissions.delete) return <NotFound />;
   if (ids.length === 0) return <NotFound />;
   if (status === "loading") return <FullPageState eyebrow="Confirm deletion" title="Checking related records" detail="Preparing the records that will be affected..." busy />;

   const listFields = model.config.listDisplay.map((name) => model.meta.fields.find((field) => field.name === name)).filter((field): field is Field => Boolean(field));
   const displayField = listFields[0];
   const cancelPath = `/${model.meta.pluralName}`;
   const confirmDelete = async () => {
      if (await bulkActions.run("delete_selected", ids)) navigate(cancelPath);
   };

   return (
      <section className="page-section delete-confirm-page">
         <div className="delete-confirm-layout">
            <div>
               <NavLink className="back-link" to={cancelPath}>
                  <ChevronLeft size={15} strokeWidth={2} aria-hidden />
                  Back to {model.meta.name}
               </NavLink>
               <div className="delete-confirm-heading">
                  <span className="confirm-icon" aria-hidden>
                     <AlertTriangle size={18} strokeWidth={2} />
                  </span>
                  <div>
                     <div className="eyebrow">Confirm deletion</div>
                     <h1>Delete {ids.length} {ids.length === 1 ? model.meta.name : `${model.meta.name} records`}?</h1>
                     <p>This page shows the selected records and any registered cascade relationships that will be deleted with them.</p>
                  </div>
               </div>
            </div>
            <div className="delete-confirm-actions">
               <NavLink className="secondary-button" to={cancelPath}>Cancel</NavLink>
               <button className="danger-button" type="button" disabled={bulkActions.status === "running"} onClick={() => void confirmDelete()}>
                  <Trash2 size={14} strokeWidth={2} aria-hidden />
                  {bulkActions.status === "running" ? "Deleting..." : "Confirm delete"}
               </button>
            </div>
         </div>

         {status === "error" && <ApiNotice message={error} />}
         {bulkActions.error && <ApiNotice message={bulkActions.error} />}

         {status === "ready" && preview && (
            <div className="delete-tree">
               {preview.records.map((record) => (
                  <DeleteTreeItem key={String(record[model.meta.idField])} model={model} record={record} displayField={displayField} preview={preview} />
               ))}
            </div>
         )}
      </section>
   );
};

const DeleteTreeItem = ({ model, record, displayField, preview }: { model: Model; record: RecordData; displayField?: Field; preview: DeletePreview }) => {
   const id = String(record[model.meta.idField]);
   const label = displayField ? formatRecordValue(record[displayField.name], displayField) : id;

   return (
      <article className="delete-tree-item">
         <div className="delete-parent-row">
            <strong>{label || id}</strong>
            <span>{fieldLabel(model.meta.idField)}: {id}</span>
         </div>
         {preview.relations.map((relation) => {
            const children = relation.recordsByParentId[id] ?? [];
            if (children.length === 0) return null;
            return (
               <ul className="delete-child-list" key={relation.fieldName}>
                  {children.map((child) => {
                     const childId = String(child[relation.idField]);
                     const childValue = child[relation.displayField] ?? childId;
                     return (
                        <li key={childId}>
                           <span className="tree-branch" aria-hidden />
                           <div>
                              <strong>{relation.modelName}: {String(childValue)}</strong>
                              <span>{fieldLabel(relation.idField)}: {childId}</span>
                           </div>
                        </li>
                     );
                  })}
               </ul>
            );
         })}
      </article>
   );
};
