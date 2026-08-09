import type { Field } from "../types";
import { fieldLabel } from "../utils/format";
import { RelationSelect, type RelationSelectModel } from "./RelationSelect";

export const FieldInput = ({ field, value, error, relationModel, onChange }: { field: Field; value: string | boolean; error?: string; relationModel?: RelationSelectModel; onChange: (value: string | boolean) => void }) => {
   const id = `field-${field.name}`;
   if (relationModel) {
      return <RelationSelect label={`${relationModel.label}${field.isRequired ? " *" : ""}`} model={relationModel} value={String(value)} error={error} onChange={onChange} />;
   }

   return (
      <label className={`form-field ${error ? "has-error" : ""}`} htmlFor={id}>
         <span className="form-label">
            {fieldLabel(field.name)} {field.isRequired && <em>*</em>}
         </span>
         {field.type === "boolean" ? (
            <span className="toggle-line">
               <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
               <span className="toggle" />
               <span>{value === true ? "Enabled" : "Disabled"}</span>
            </span>
         ) : field.type === "enum" ? (
            <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}>
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
               type={field.type === "number" ? "number" : field.type === "datetime" ? "datetime-local" : "text"}
               value={String(value)}
               required={field.isRequired}
               onChange={(event) => onChange(event.target.value)}
            />
         )}
         {error && <span className="form-error">{error}</span>}
      </label>
   );
};
