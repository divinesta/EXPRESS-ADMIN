import { Play, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ListAction } from "../types";

export const ActionBar = ({ actions, selectedCount, busy, onRun }: { actions: ListAction[]; selectedCount: number; busy: boolean; onRun: (action: ListAction) => void }) => {
   const [actionName, setActionName] = useState(actions[0]?.name ?? "");
   const action = actions.find((candidate) => candidate.name === actionName) ?? actions[0];
   const isDeleteAction = action?.name === "delete_selected";

   if (actions.length === 0) return null;

   return (
      <div className="action-bar" aria-label="Bulk actions">
         <span className="action-selection-count">{selectedCount} selected</span>
         <select aria-label="Choose an action" value={action?.name ?? ""} onChange={(event) => setActionName(event.target.value)}>
            {actions.map((candidate) => (
               <option key={candidate.name} value={candidate.name}>
                  {candidate.label}
               </option>
            ))}
         </select>
         <button className={isDeleteAction ? "danger-button" : "secondary-button"} type="button" disabled={!action || selectedCount === 0 || busy} onClick={() => action && onRun(action)}>
            {isDeleteAction ? <Trash2 size={13} aria-hidden /> : <Play size={13} fill="currentColor" aria-hidden />}
            {busy ? "Running…" : isDeleteAction ? "Delete selected" : "Run action"}
         </button>
      </div>
   );
};
