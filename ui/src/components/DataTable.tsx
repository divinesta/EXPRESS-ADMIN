import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Field, RecordData } from "../types";
import { fieldLabel, formatRecordValue } from "../utils/format";

export const DataTable = ({
   records,
   fields,
   idField,
   canView,
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
   canView: boolean;
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
      <table>
         <thead>
            <tr>
               {selectable && (
                  <th className="selection-cell">
                     <input aria-label="Select all records on this page" type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} />
                  </th>
               )}
               {fields.map((field) => (
                  <th key={field.name}>
                     <button className="sort-button" type="button" onClick={() => onSort(field.name)}>
                        <span>{fieldLabel(field.name)}</span>
                        {sort === field.name ? dir === "asc" ? <ArrowUp size={12} strokeWidth={2} aria-hidden /> : <ArrowDown size={12} strokeWidth={2} aria-hidden /> : <ArrowUpDown size={12} strokeWidth={1.75} aria-hidden />}
                     </button>
                  </th>
               ))}
               {canView && <th aria-label="Open record" />}
            </tr>
         </thead>
         <tbody>
            {records.length === 0 ? (
               <tr>
                  <td className="table-empty" colSpan={fields.length + (canView ? 1 : 0) + (selectable ? 1 : 0)}>
                     No records match your current view.
                  </td>
               </tr>
            ) : (
               records.map((record) => (
                  <tr className={canView ? "clickable-row" : ""} key={String(record[idField])} onClick={() => canView && onOpen(String(record[idField]))}>
                     {selectable && (
                        <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                           <input aria-label={`Select ${String(record[idField])}`} type="checkbox" checked={selectedIds.has(String(record[idField]))} onChange={(event) => onToggleSelected(String(record[idField]), event.target.checked)} />
                        </td>
                     )}
                     {fields.map((field) => (
                        <td key={field.name}>{formatRecordValue(record[field.name], field)}</td>
                     ))}
                     {canView && (
                        <td className="row-arrow">
                           <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
                        </td>
                     )}
                  </tr>
               ))
            )}
         </tbody>
      </table>
   </div>
   );
};
