import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiBase, fetchRecord, readApiError } from "../api";
import { ApiNotice, NotFound } from "../components/Feedback";
import { AutoFormField } from "../components/AutoForm";
import { useFormModel } from "../hooks/useFormModel";
import type { Schema } from "../types";
import { extractFieldName, fieldLabel, toDateInput } from "../utils/format";
import { writableFields } from "../utils/fieldResolver";

export const CreateView = ({ schema, mode }: { schema: Schema; mode: "create" | "edit" | "view" }) => {
   const { model: modelPath, id } = useParams();
   const navigate = useNavigate();
   const model = schema.models.find((candidate) => candidate.meta.pluralName === modelPath);
   const fields = model ? mode === "view" ? model.meta.fields.filter((field) => field.type !== "relation" && !field.isList) : writableFields(model.meta.fields) : [];
   const relationModelsByForeignKey = new Map(
      model?.meta.fields.flatMap((field) => {
         const relation = field.relation;
         if (field.type !== "relation" || !relation || (relation.kind !== "belongsTo" && relation.kind !== "hasOne") || relation.foreignKeyFields.length !== 1) return [];
         const relatedModel = schema.models.find((candidate) => candidate.meta.name === relation.model);
         if (!relatedModel?.config.permissions.list) return [];
         return [[relation.foreignKeyFields[0], { label: fieldLabel(field.name), pluralName: relatedModel.meta.pluralName, idField: relatedModel.meta.idField, displayField: relation.displayField }] as const];
      }) ?? [],
   );
   const form = useFormModel(fields);
   const [relationLabels, setRelationLabels] = useState<Record<string, string>>({});
   useEffect(() => {
      if (mode === "create" || !model || !id) return;
      fetchRecord(model.meta.pluralName, id)
         .then((record) => {
            const next: Record<string, string | boolean> = {};
            fields.forEach((field) => {
               const value = record[field.name];
               next[field.name] = field.type === "boolean" ? value === true : value == null ? "" : field.type === "datetime" ? toDateInput(String(value)) : String(value);
            });
            const labels: Record<string, string> = {};
            relationModelsByForeignKey.forEach((relationModel, foreignKeyField) => {
               const relationField = model.meta.fields.find((field) => field.type === "relation" && field.relation?.foreignKeyFields.includes(foreignKeyField));
               const relationRecord = relationField ? record[relationField.name] : undefined;
               if (typeof relationRecord !== "object" || relationRecord === null || Array.isArray(relationRecord)) return;
               const relationData = relationRecord as Record<string, unknown>;
               const label = relationData[relationModel.displayField] ?? record[foreignKeyField];
               if (label != null) labels[foreignKeyField] = String(label);
            });
            setRelationLabels(labels);
            form.setValues(next);
            form.setStatus("ready");
         })
         .catch((reason: unknown) => {
            form.setError(reason instanceof Error ? reason.message : "Could not load this record.");
            form.setStatus("ready");
         });
   }, [id, mode, model]);
   if (!model) return <NotFound />;
   if (mode === "create" && !model.config.permissions.create) return <NotFound />;
   if (mode === "edit" && !model.config.permissions.update) return <NotFound />;
   if (mode === "view" && !model.config.permissions.view) return <NotFound />;
   if (form.status === "loading")
      return (
         <div className="table-card table-state">
            <span className="spinner" /> Loading form…
         </div>
      );
   const submit = async (event: FormEvent) => {
      event.preventDefault();
      if (mode === "view") return;
      form.setError("");
      form.setFieldErrors({});
      const missingRequiredRelation = fields.find((field) => relationModelsByForeignKey.has(field.name) && field.isRequired && form.values[field.name] === "");
      if (missingRequiredRelation) {
         form.setFieldErrors({ [missingRequiredRelation.name]: `${fieldLabel(missingRequiredRelation.name)} is required.` });
         form.setStatus("ready");
         return;
      }
      form.setStatus("saving");
      const payload: Record<string, unknown> = {};
      fields.forEach((field) => {
         const value = form.values[field.name];
         if (value === "" && !field.isRequired) {
            if (relationModelsByForeignKey.has(field.name)) payload[field.name] = null;
            return;
         }
         payload[field.name] = field.type === "number" && field.prismaType !== "Decimal" && field.prismaType !== "BigInt" ? Number(value) : field.type === "datetime" && typeof value === "string" ? new Date(value).toISOString() : value;
      });
      const url = mode === "create" ? `${apiBase}/${model.meta.pluralName}` : `${apiBase}/${model.meta.pluralName}/${encodeURIComponent(id ?? "")}`;
      const response = await fetch(url, {
         method: mode === "create" ? "POST" : "PUT",
         credentials: "include",
         headers: { "Content-Type": "application/json", Accept: "application/json" },
         body: JSON.stringify(payload),
      });
      if (!response.ok) {
         const message = await readApiError(response);
         const field = extractFieldName(message);
         if (field) form.setFieldErrors({ [field]: message });
         else form.setError(message);
         form.setStatus("ready");
         return;
      }
      const record = (await response.json()) as Record<string, unknown>;
      navigate(`/${model.meta.pluralName}/${String(record[model.meta.idField])}`);
   };
   return (
      <section className="page-section">
         <div className="page-heading">
            <div>
               <div className="eyebrow">{mode === "create" ? "New record" : mode === "view" ? "Record detail" : "Edit record"}</div>
               <h1>{mode === "create" ? `Create ${model.meta.name}` : mode === "view" ? model.meta.name : `Edit ${model.meta.name}`}</h1>
               <p>{mode === "view" ? "Read-only record details." : "Only scalar fields are editable in this first release."}</p>
            </div>
         </div>
         {form.error && <ApiNotice message={form.error} />}
         <form className="record-form" onSubmit={submit}>
            <div className="form-grid">
               {fields.map((field) => (
                  <AutoFormField
                     field={field}
                     key={field.name}
                     value={form.values[field.name] ?? (field.type === "boolean" ? false : "")}
                     error={form.fieldErrors[field.name]}
                     relationModel={relationModelsByForeignKey.get(field.name)}
                     relationLabel={relationLabels[field.name]}
                     readOnly={mode === "view"}
                     onChange={(value) => {
                        setRelationLabels((current) => ({ ...current, [field.name]: "" }));
                        form.setValues((current) => ({ ...current, [field.name]: value }));
                     }}
                  />
               ))}
            </div>
            <div className="form-actions">
               <button className="secondary-button" type="button" onClick={() => navigate(`/${model.meta.pluralName}`)}>{mode === "view" ? "Back to list" : "Cancel"}</button>
               {mode !== "view" && <button className="primary-button" disabled={form.status === "saving"} type="submit">{form.status === "saving" ? "Saving…" : mode === "create" ? "Create record" : "Save changes"}</button>}
            </div>
         </form>
      </section>
   );
};
