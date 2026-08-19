import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Field, RecordData } from "../types";
import { fieldLabel, formatRecordValue } from "../utils/format";

export const DataTable = ({
   records,
   fields,
   idField,
   canEdit,
   rowStart = 0,
   selectedIds,
   sort,
   dir,
   onSort,
   onToggleAll,
   onToggleSelected,
   onOpen,
}: {
   records: RecordData[];
   fields: Field[];
   idField: string;
   canEdit: boolean;
   rowStart?: number;
   selectedIds?: Set<string>;
   sort: string;
   dir: "asc" | "desc";
   onSort: (field: string) => void;
   onToggleAll?: (selected: boolean) => void;
   onToggleSelected?: (id: string, selected: boolean) => void;
   onOpen: (id: string) => void;
}) => {
   const selectable = selectedIds !== undefined && onToggleAll && onToggleSelected;
   const allSelected = records.length > 0 && records.every((record) => selectedIds?.has(String(record[idField])));

   return (
   <div className="table-scroll">
      <table className="data-table">
         <thead>
            <tr>
               <th className="row-number-header" scope="col">
                  <span className="sr-only">Row number</span>
                  <span aria-hidden>#</span>
               </th>
               {selectable && (
                  <th className="selection-cell">
                     <input aria-label="Select all records on this page" type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} />
                  </th>
               )}
               {fields.map((field) => (
                  <th aria-sort={field.type !== "relation" && sort === field.name ? (dir === "asc" ? "ascending" : "descending") : undefined} key={field.name}>
                     {field.type !== "relation" ? (
                        <button className={`sort-button ${sort === field.name ? "is-sorted" : ""}`} type="button" onClick={() => onSort(field.name)}>
                           <span>{fieldLabel(field.name)}</span>
                           {sort === field.name ? dir === "asc" ? <ArrowUp size={12} strokeWidth={2} aria-hidden /> : <ArrowDown size={12} strokeWidth={2} aria-hidden /> : <ArrowUpDown size={12} strokeWidth={1.75} aria-hidden />}
                        </button>
                     ) : (
                        <span className="column-label">{fieldLabel(field.name)}</span>
                     )}
                  </th>
               ))}
               {canEdit && <th aria-label="Edit record" />}
            </tr>
         </thead>
         <tbody>
            {records.length === 0 ? (
               <tr>
                  <td className="table-empty" colSpan={fields.length + 1 + (canEdit ? 1 : 0) + (selectable ? 1 : 0)}>
                     No records match your current view.
                  </td>
               </tr>
            ) : (
               records.map((record, index) => {
                  const isSelected = selectedIds?.has(String(record[idField]));
                  return (
                  <tr className={[canEdit ? "clickable-row" : "", isSelected ? "is-selected" : ""].filter(Boolean).join(" ")} key={String(record[idField])} onClick={() => canEdit && onOpen(String(record[idField]))}>
                     <td className="row-number-cell">{rowStart + index + 1}</td>
                     {selectable && (
                        <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                           <input aria-label={`Select ${String(record[idField])}`} type="checkbox" checked={selectedIds.has(String(record[idField]))} onChange={(event) => onToggleSelected(String(record[idField]), event.target.checked)} />
                        </td>
                     )}
                     {fields.map((field, index) => (
                        <td className={[index === 0 ? "table-primary-cell" : "", field.type === "boolean" ? "table-boolean-cell" : "", field.type === "enum" ? "table-enum-cell" : "", field.type === "datetime" ? "table-date-cell" : ""].filter(Boolean).join(" ")} key={field.name}>
                           {field.type === "boolean" ? <span className="table-boolean">{formatRecordValue(record[field.name], field)}</span> : field.type === "enum" ? <span className="table-enum">{formatRecordValue(record[field.name], field)}</span> : formatRecordValue(record[field.name], field)}
                        </td>
                     ))}
                     {canEdit && (
                        <td className="row-arrow">
                           <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
                        </td>
                     )}
                  </tr>
                  );
               })
            )}
         </tbody>
      </table>
   </div>
   );
};
