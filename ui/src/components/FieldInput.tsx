import type { Field } from "../types";
import { fieldLabel } from "../utils/format";
import { RelationSelect, type RelationSelectModel } from "./RelationSelect";

export const FieldInput = ({ field, value, error, relationModel, relationLabel, onChange, readOnly = false }: { field: Field; value: string | boolean; error?: string; relationModel?: RelationSelectModel; relationLabel?: string; onChange: (value: string | boolean) => void; readOnly?: boolean }) => {
   const id = `field-${field.name}`;
   if (relationModel) {
      return <RelationSelect label={`${relationModel.label}${field.isRequired ? " *" : ""}`} model={relationModel} value={String(value)} selectedLabel={relationLabel} error={error} readOnly={readOnly} onChange={onChange} />;
   }

   const inputType =
      field.type === "number"
         ? "number"
         : field.type === "datetime"
           ? "datetime-local"
           : field.name.toLowerCase().includes("email")
             ? "email"
             : field.name.toLowerCase().includes("url")
               ? "url"
               : field.name.toLowerCase().includes("password")
                 ? "password"
                 : "text";

   return (
      <label className={`form-field ${error ? "has-error" : ""}`} htmlFor={id}>
         <span className="form-label">
            {fieldLabel(field.name)} {field.isRequired && <em>*</em>}
         </span>
         {field.type === "boolean" ? (
            <span className="toggle-line">
               <input id={id} type="checkbox" checked={value === true} disabled={readOnly} onChange={(event) => onChange(event.target.checked)} />
               <span className="toggle" />
               <span>{value === true ? "Enabled" : "Disabled"}</span>
            </span>
         ) : field.type === "enum" ? (
            <select id={id} value={String(value)} disabled={readOnly} onChange={(event) => onChange(event.target.value)}>
               <option value="">Select {fieldLabel(field.name).toLowerCase()}</option>
               {(field.enumValues ?? []).map((option) => (
                  <option key={option} value={option}>
                     {option}
                  </option>
               ))}
            </select>
         ) : (
            <input
               id={id}
               type={inputType}
               value={String(value)}
               required={field.isRequired}
               readOnly={readOnly}
               autoComplete={inputType === "email" ? "email" : inputType === "password" ? "new-password" : undefined}
               onChange={(event) => onChange(event.target.value)}
            />
         )}
         {error && <span className="form-error">{error}</span>}
      </label>
   );
};
