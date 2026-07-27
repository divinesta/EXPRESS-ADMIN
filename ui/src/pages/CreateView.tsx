import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiBase, fetchRecord, readApiError } from "../api";
import { ApiNotice, NotFound } from "../components/Feedback";
import { AutoFormField } from "../components/AutoForm";
import { useFormModel } from "../hooks/useFormModel";
import type { Model, Schema } from "../types";
import { extractFieldName, toDateInput } from "../utils/format";
import { writableFields } from "../utils/fieldResolver";

export const CreateView = ({ schema, mode }: { schema: Schema; mode: "create" | "edit" }) => {
   const { model: modelPath, id } = useParams();
   const navigate = useNavigate();
   const model = schema.models.find((candidate) => candidate.meta.pluralName === modelPath);
   const fields = model ? writableFields(model.meta.fields) : [];
   const form = useFormModel(fields);
   useEffect(() => {
      if (mode !== "edit" || !model || !id) return;
      fetchRecord(model.meta.pluralName, id)
         .then((record) => {
            const next: Record<string, string | boolean> = {};
            fields.forEach((field) => {
               const value = record[field.name];
               next[field.name] = field.type === "boolean" ? value === true : value == null ? "" : field.type === "datetime" ? toDateInput(String(value)) : String(value);
            });
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
   if (form.status === "loading")
      return (
         <div className="table-card table-state">
            <span className="spinner" /> Loading form…
         </div>
      );
   const submit = async (event: FormEvent) => {
      event.preventDefault();
      form.setStatus("saving");
      form.setError("");
      form.setFieldErrors({});
      const payload: Record<string, unknown> = {};
      fields.forEach((field) => {
         const value = form.values[field.name];
         if (value === "" && !field.isRequired) return;
         payload[field.name] = field.type === "number" ? Number(value) : field.type === "datetime" && typeof value === "string" ? new Date(value).toISOString() : value;
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
         <button className="back-link" type="button" onClick={() => navigate(mode === "edit" ? `/${model.meta.pluralName}/${id}` : `/${model.meta.pluralName}`)}>
            ← Cancel
         </button>
         <div className="page-heading">
            <div>
               <div className="eyebrow">{mode === "create" ? "New record" : "Edit record"}</div>
               <h1>{mode === "create" ? `Create ${model.meta.name}` : `Edit ${model.meta.name}`}</h1>
               <p>Only scalar fields are editable in this first release.</p>
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
                     onChange={(value) => form.setValues((current) => ({ ...current, [field.name]: value }))}
                  />
               ))}
            </div>
            <div className="form-actions">
               <button className="secondary-button" type="button" onClick={() => navigate(mode === "edit" ? `/${model.meta.pluralName}/${id}` : `/${model.meta.pluralName}`)}>
                  Cancel
               </button>
               <button className="primary-button" disabled={form.status === "saving"} type="submit">
                  {form.status === "saving" ? "Saving…" : mode === "create" ? "Create record" : "Save changes"}
               </button>
            </div>
         </form>
      </section>
   );
};
