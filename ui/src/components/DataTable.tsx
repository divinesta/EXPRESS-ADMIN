import type { Field, RecordData } from "../types";
import { fieldLabel, formatRecordValue } from "../utils/format";

export const DataTable = ({
   records,
   fields,
   idField,
   canView,
   sort,
   dir,
   onSort,
   onOpen,
}: {
   records: RecordData[];
   fields: Field[];
   idField: string;
   canView: boolean;
   sort: string;
   dir: "asc" | "desc";
   onSort: (field: string) => void;
   onOpen: (id: string) => void;
}) => (
   <div className="table-scroll">
      <table>
         <thead>
            <tr>
               {fields.map((field) => (
                  <th key={field.name}>
                     <button className="sort-button" type="button" onClick={() => onSort(field.name)}>
                        {fieldLabel(field.name)} {sort === field.name ? (dir === "asc" ? "↑" : "↓") : "↕"}
                     </button>
                  </th>
               ))}
               {canView && <th aria-label="Open record" />}
            </tr>
         </thead>
         <tbody>
            {records.length === 0 ? (
               <tr>
                  <td className="table-empty" colSpan={fields.length + (canView ? 1 : 0)}>
                     No records match your current view.
                  </td>
               </tr>
            ) : (
               records.map((record) => (
                  <tr className={canView ? "clickable-row" : ""} key={String(record[idField])} onClick={() => canView && onOpen(String(record[idField]))}>
                     {fields.map((field) => (
                        <td key={field.name}>{formatRecordValue(record[field.name], field)}</td>
                     ))}
                     {canView && <td className="row-arrow">→</td>}
                  </tr>
               ))
            )}
         </tbody>
      </table>
   </div>
);
