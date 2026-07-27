import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { ApiNotice, NotFound } from "../components/Feedback";
import { DataTable } from "../components/DataTable";
import { DateRangeControl, FilterControl } from "../components/FilterSidebar";
import { useFilters } from "../hooks/useFilters";
import { useModelData } from "../hooks/useModelData";
import type { Field, Schema } from "../types";

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
               <button type="submit">Search</button>
            </form>
            <button className="secondary-button" type="button" onClick={reset}>
               Reset
            </button>
         </div>
         {filterFields.length > 0 && (
            <div className="filter-strip">
               <span className="filter-caption">Filter by</span>
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
         )}
         {data.status === "error" && <ApiNotice message={data.error} />}
         {data.status === "loading" && (
            <div className="table-card table-state">
               <span className="spinner" /> Loading records…
            </div>
         )}
         {data.status === "ready" && (
            <div className="table-card">
               <DataTable
                  records={data.records}
                  fields={listFields}
                  idField={model.meta.idField}
                  canView={model.config.permissions.view}
                  sort={sort}
                  dir={dir}
                  onSort={toggleSort}
                  onOpen={(id) => navigate(`/${model.meta.pluralName}/${id}`)}
               />
               <div className="table-footer">
                  <span>
                     Showing {data.records.length ? (page - 1) * model.config.perPage + 1 : 0}–{Math.min((page - 1) * model.config.perPage + data.records.length, data.total)} of {data.total}
                  </span>
                  <div className="pagination">
                     <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                        <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                     </button>
                     <span>
                        Page {page} of {data.totalPages}
                     </span>
                     <button type="button" aria-label="Next page" disabled={page >= data.totalPages} onClick={() => setPage((current) => current + 1)}>
                        <ChevronRight size={14} strokeWidth={2} aria-hidden />
                     </button>
                  </div>
               </div>
            </div>
         )}
      </section>
   );
};
