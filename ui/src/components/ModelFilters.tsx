import type { Field } from "../types";
import { fieldLabel } from "../utils/format";

export const FilterControl = ({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) => {
   if (field.type === "enum")
      return (
         <label className="filter-control">
            <span>{fieldLabel(field.name)}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
               <option value="">Any</option>
               {(field.enumValues ?? []).map((option) => (
                  <option key={option} value={option}>
                     {option}
                  </option>
               ))}
            </select>
         </label>
      );
   if (field.type === "boolean")
      return (
         <label className="filter-control">
            <span>{fieldLabel(field.name)}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
               <option value="">Any</option>
               <option value="true">Yes</option>
               <option value="false">No</option>
            </select>
         </label>
      );
   return (
      <label className="filter-control">
         <span>{fieldLabel(field.name)}</span>
         <input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Any" />
      </label>
   );
};

export const DateRangeControl = ({ field, from, to, onChange }: { field: Field; from: string; to: string; onChange: (key: "gte" | "lte", value: string) => void }) => (
   <span className="filter-control date-range-control">
      <span>{fieldLabel(field.name)}</span>
      <input aria-label={`${fieldLabel(field.name)} from`} type="date" value={from} onChange={(event) => onChange("gte", event.target.value)} />
      <span>→</span>
      <input aria-label={`${fieldLabel(field.name)} to`} type="date" value={to} onChange={(event) => onChange("lte", event.target.value)} />
   </span>
);
