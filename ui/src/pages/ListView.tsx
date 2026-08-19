import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { ApiNotice, NotFound } from "../components/Feedback";
import { ActionBar } from "../components/ActionBar";
import { DataTable } from "../components/DataTable";
import { DateRangeControl, FilterControl } from "../components/FilterSidebar";
import { useFilters } from "../hooks/useFilters";
import { useModelData } from "../hooks/useModelData";
import { useBulkActions } from "../hooks/useBulkActions";
import type { Field, ListAction, Schema } from "../types";

export const ListView = ({ schema }: { schema: Schema }) => {
   const { model: modelPath } = useParams();
   const navigate = useNavigate();
   const model = useMemo(() => schema.models.find((candidate) => candidate.meta.pluralName === modelPath), [modelPath, schema.models]);
   const [searchDraft, setSearchDraft] = useState("");
   const [search, setSearch] = useState("");
   const [page, setPage] = useState(1);
   const [sort, setSort] = useState(model?.config.defaultSort.field ?? "createdAt");
   const [dir, setDir] = useState<"asc" | "desc">(model?.config.defaultSort.direction ?? "desc");
   const { filters, updateFilter, resetFilters } = useFilters();
   const data = useModelData(model, page, search, filters, sort, dir);
   const bulkActions = useBulkActions(model);
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   const totalPages = Math.max(data.totalPages, 1);
   useEffect(() => {
      setSearchDraft(""); setSearch(""); setPage(1);
      setSort(model?.config.defaultSort.field ?? "createdAt"); setDir(model?.config.defaultSort.direction ?? "desc");
      resetFilters(); setSelectedIds(new Set());
   }, [modelPath]);
   useEffect(() => {
      if (data.status === "ready" && page > totalPages) setPage(totalPages);
   }, [data.status, page, totalPages]);
   if (!model || !model.config.permissions.list) return <NotFound />;
   const listFields = model.config.listDisplay.map((name) => model.meta.fields.find((field) => field.name === name)).filter((field): field is Field => Boolean(field));
   const filterFields = model.config.listFilter.map((name) => model.meta.fields.find((field) => field.name === name)).filter((field): field is Field => Boolean(field));
   const reset = () => {
      setSearchDraft("");
      setSearch("");
      resetFilters();
      setPage(1);
   };
   const toggleSort = (field: string) => {
      setPage(1);
      if (sort === field) setDir((current) => (current === "asc" ? "desc" : "asc"));
      else {
         setSort(field);
         setDir("asc");
      }
   };
   const changeFilter = (name: string, value: string) => {
      setPage(1);
      updateFilter(name, value);
   };
   const goToPreviousPage = () => setPage((current) => Math.max(1, current - 1));
   const goToNextPage = () => setPage((current) => Math.min(totalPages, current + 1));
   const executeAction = async (action: ListAction) => {
      const ids = [...selectedIds];
      const message = `Run “${action.label}” for ${ids.length} selected ${ids.length === 1 ? "record" : "records"}?`;
      if (!window.confirm(message)) return;
      if (await bulkActions.run(action.name, ids)) {
         setSelectedIds(new Set());
         data.refresh();
      }
   };
   const runAction = (action: ListAction) => {
      if (action.name === "delete_selected") {
         navigate(`/${model.meta.pluralName}/delete?${new URLSearchParams({ ids: [...selectedIds].join(",") })}`);
         return;
      }
      void executeAction(action);
   };
   return (
      <section className="page-section">
         <div className="page-heading model-list-heading">
            <div>
               <h1>{model.meta.name}</h1>
               <p>
                  {data.total} {data.total === 1 ? "record" : "records"} available to your account.
               </p>
            </div>
            {model.config.permissions.create && (
               <NavLink className="primary-button" to={`/${model.meta.pluralName}/new`}>
                  <Plus size={15} strokeWidth={2} aria-hidden />
                  New {model.meta.name}
               </NavLink>
            )}
         </div>
         <div className="list-toolbar">
            <form
               className="search-box"
               onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(searchDraft.trim());
               }}
            >
               <Search size={15} strokeWidth={1.75} aria-hidden />
               <input aria-label={`Search ${model.meta.name}`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={`Search ${model.meta.name.toLowerCase()}…`} />
               <button type="submit">
                  <Search size={14} strokeWidth={2} aria-hidden />
                  Search
               </button>
            </form>
            <button className="secondary-button" type="button" onClick={reset}>
               Reset
            </button>
         </div>
         {filterFields.length > 0 && (
            <div className="filter-strip" aria-label="Filters">
               <span className="filter-caption">
                  <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden />
                  Filters
               </span>
               <div className="filter-controls">
                  {filterFields.map((field) =>
                     field.type === "datetime" ? (
                        <DateRangeControl
                           field={field}
                           key={field.name}
                           from={filters[`${field.name}_gte`] ?? ""}
                           to={filters[`${field.name}_lte`] ?? ""}
                           onChange={(key, value) => changeFilter(`${field.name}_${key}`, value)}
                        />
                     ) : (
                        <FilterControl field={field} key={field.name} value={filters[field.name] ?? ""} onChange={(value) => changeFilter(field.name, value)} />
                     ),
                  )}
               </div>
            </div>
         )}
         {data.status === "error" && <ApiNotice message={data.error} />}
         {bulkActions.error && <ApiNotice message={bulkActions.error} />}
         {bulkActions.message && (
            <div className="action-success" role="status">
               {bulkActions.message}
            </div>
         )}
         {data.status === "loading" && (
            <div className="table-card table-state">
               <span className="spinner" /> Loading records…
            </div>
         )}
         {data.status === "ready" && (
            <div className="table-card">
               {selectedIds.size > 0 && <ActionBar actions={model.config.actions} selectedCount={selectedIds.size} busy={bulkActions.status === "running"} onRun={runAction} />}
               <DataTable
                  records={data.records}
                  fields={listFields}
                  idField={model.meta.idField}
                  canEdit={model.config.permissions.view}
                  rowStart={(page - 1) * model.config.perPage}
                  selectedIds={model.config.actions.length > 0 ? selectedIds : undefined}
                  sort={sort}
                  dir={dir}
                  onSort={toggleSort}
                  onToggleAll={(selected) =>
                     setSelectedIds((current) => {
                        const next = new Set(current);
                        data.records.forEach((record) => {
                           const id = String(record[model.meta.idField]);
                           if (selected) next.add(id);
                           else next.delete(id);
                        });
                        return next;
                     })
                  }
                  onToggleSelected={(id, selected) =>
                     setSelectedIds((current) => {
                        const next = new Set(current);
                        if (selected) next.add(id);
                        else next.delete(id);
                        return next;
                     })
                  }
                  onOpen={(id) => navigate(model.config.permissions.update ? `/${model.meta.pluralName}/${id}/edit` : `/${model.meta.pluralName}/${id}`)}
               />
               <div className="table-footer">
                  <span>
                     Showing {data.records.length ? (page - 1) * model.config.perPage + 1 : 0}–{Math.min((page - 1) * model.config.perPage + data.records.length, data.total)} of {data.total}
                  </span>
                  <div className="pagination">
                     <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={goToPreviousPage}>
                        <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                     </button>
                     <span>
                        Page {page} of {totalPages}
                     </span>
                     <button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={goToNextPage}>
                        <ChevronRight size={14} strokeWidth={2} aria-hidden />
                     </button>
                  </div>
               </div>
            </div>
         )}
      </section>
   );
};
