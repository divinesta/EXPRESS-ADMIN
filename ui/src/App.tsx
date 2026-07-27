import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

type Field = {
  name: string;
  type: string;
  isId: boolean;
  isRequired: boolean;
  isReadOnly: boolean;
  relation?: { model: string; displayField: string } | null;
};

type Model = {
  meta: {
    name: string;
    pluralName: string;
    fields: Field[];
    displayField: string;
  };
  config: {
    listDisplay: string[];
    listFilter: string[];
    searchFields: string[];
    defaultSort: { field: string; direction: "asc" | "desc" };
    perPage: number;
    permissions: {
      list: boolean;
      view: boolean;
      create: boolean;
      update: boolean;
      delete: boolean;
      actions: Record<string, boolean>;
    };
  };
};

type Schema = {
  siteName: string;
  basePath: string;
  identity: { id: string; email: string; role: string; isSuperAdmin: boolean };
  models: Model[];
};

type LoadState = { status: "loading" } | { status: "ready"; schema: Schema } | { status: "unauthorized" } | { status: "error"; message: string };

const apiBase = "/admin/api";

async function fetchSchema(): Promise<Schema> {
  const response = await fetch(`${apiBase}/schema`, { credentials: "include", headers: { Accept: "application/json" } });
  if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
  if (!response.ok) throw new Error(`The admin schema could not be loaded (${response.status}).`);
  return response.json() as Promise<Schema>;
}

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetchSchema()
      .then((schema) => active && setState({ status: "ready", schema }))
      .catch((error: unknown) => {
        if (!active) return;
        setState(error instanceof Error && error.message === "UNAUTHORIZED" ? { status: "unauthorized" } : { status: "error", message: error instanceof Error ? error.message : "Something went wrong." });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") return <FullPageState eyebrow="Prisma Admin" title="Loading your workspace" detail="Reading the models and permissions available to you…" busy />;
  if (state.status === "unauthorized") return <FullPageState eyebrow="Access required" title="You’re not signed in" detail="Sign in through the host application, then return here to open the admin workspace." />;
  if (state.status === "error") return <FullPageState eyebrow="Unable to connect" title="The admin is unavailable" detail={state.message} />;

  return (
    <BrowserRouter basename="/admin">
      <AdminShell schema={state.schema} />
    </BrowserRouter>
  );
}

function AdminShell({ schema }: { schema: Schema }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const activeModel = schema.models.find((model) => location.pathname.includes(`/${model.meta.pluralName}`));

  return (
    <div className="app-frame">
      <div className={`scrim ${sidebarOpen ? "is-visible" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">{schema.siteName}</div>
            <div className="brand-caption">Operations workspace</div>
          </div>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <div className="nav-label">Workspace</div>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">⌂</span><span>Overview</span>
          </NavLink>
          <div className="nav-label models-label">Models</div>
          {schema.models.filter((model) => model.config.permissions.list).map((model) => (
            <NavLink key={model.meta.name} to={`/${model.meta.pluralName}`} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setSidebarOpen(false)}>
              <span className="nav-icon model-icon">{model.meta.name.slice(0, 1)}</span><span>{model.meta.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> Connected to host app</div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="breadcrumb"><span>Admin</span><span className="breadcrumb-separator">/</span><strong>{activeModel?.meta.name ?? "Overview"}</strong></div>
          <div className="identity-chip"><div className="avatar">{schema.identity.email.slice(0, 1).toUpperCase()}</div><div className="identity-copy"><strong>{schema.identity.email}</strong><span>{schema.identity.role}</span></div></div>
        </header>
        <div className="content-wrap">
          <Routes>
            <Route path="/" element={<Overview schema={schema} />} />
            <Route path="/:model" element={<ModelPreview schema={schema} />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function Overview({ schema }: { schema: Schema }) {
  const visibleModels = schema.models.filter((model) => model.config.permissions.list);
  return <section className="page-section"><div className="eyebrow">{formatDate(new Date())}</div><div className="page-heading"><div><h1>Good to see you.</h1><p>Choose a model to start managing your data.</p></div><div className="system-pill"><span className="status-dot" /> All systems operational</div></div><div className="overview-grid"><div className="welcome-card"><div className="welcome-glow" /><div className="eyebrow light">Your workspace</div><h2>One clear view of your data.</h2><p>The admin is connected to your application and ready to work with {visibleModels.length} {visibleModels.length === 1 ? "registered model" : "registered models"}.</p><div className="welcome-meta"><span className="mini-avatar">{schema.identity.email.slice(0, 1).toUpperCase()}</span><span>Signed in as <strong>{schema.identity.email}</strong></span></div></div><div className="metric-card"><span className="metric-label">Registered models</span><strong>{visibleModels.length.toString().padStart(2, "0")}</strong><span className="metric-foot">Visible to your account</span></div></div><div className="section-heading"><div><h2>Available models</h2><p>Open a model to view its records and controls.</p></div></div><div className="model-cards">{visibleModels.map((model) => <NavLink className="model-card" key={model.meta.name} to={`/${model.meta.pluralName}`}><span className="model-card-icon">{model.meta.name.slice(0, 1)}</span><span className="model-card-copy"><strong>{model.meta.name}</strong><small>{model.meta.fields.length} fields · {model.config.permissions.create ? "Can create" : "Read only"}</small></span><span className="arrow">↗</span></NavLink>)}</div></section>;
}

function ModelPreview({ schema }: { schema: Schema }) {
  const { model: modelPath } = useParams();
  const navigate = useNavigate();
  const model = useMemo(() => schema.models.find((candidate) => candidate.meta.pluralName === modelPath), [modelPath, schema.models]);
  if (!model || !model.config.permissions.list) return <NotFound />;
  return <section className="page-section"><button className="back-link" type="button" onClick={() => navigate("/")}>← Back to overview</button><div className="page-heading"><div><div className="eyebrow">Model workspace</div><h1>{model.meta.name}</h1><p>Records, filters, and actions will appear here next.</p></div>{model.config.permissions.create && <button className="primary-button" type="button" disabled>＋ New {model.meta.name}</button>}</div><div className="preview-card"><div className="preview-icon">{model.meta.name.slice(0, 1)}</div><div><h2>Your {model.meta.name.toLowerCase()} workspace is ready.</h2><p>The schema is connected. The next UI pass will render {model.config.listDisplay.length} configured list columns, search, filters, and pagination from this model’s metadata.</p></div></div><div className="field-preview"><div className="section-heading"><div><h2>Configured fields</h2><p>These fields are available to the schema-driven views.</p></div></div><div className="field-list">{model.meta.fields.slice(0, 8).map((field) => <div className="field-row" key={field.name}><span className="field-name">{field.name}</span><span className="field-type">{field.relation ? `Relation · ${field.relation.model}` : field.type}</span><span className={`field-badge ${field.isReadOnly ? "muted" : ""}`}>{field.isReadOnly ? "Read only" : field.isRequired ? "Required" : "Optional"}</span></div>)}</div></div></section>;
}

function FullPageState({ eyebrow, title, detail, busy = false }: { eyebrow: string; title: string; detail: string; busy?: boolean }) {
  return <main className="full-page-state"><div className="state-mark">{busy ? <span className="spinner" /> : "P"}</div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{detail}</p></main>;
}

function NotFound() { return <div className="empty-state"><div className="empty-icon">?</div><h1>Model not found</h1><p>This model is not registered or is not available to your account.</p></div>; }

function formatDate(date: Date) { return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date); }
