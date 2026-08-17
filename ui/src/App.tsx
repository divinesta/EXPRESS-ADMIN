import { useMemo, useState } from "react";
import { ArrowLeft, Home, LayoutDashboard, Menu } from "lucide-react";
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { FullPageState, NotFound } from "./components/Feedback";
import { CreateView } from "./pages/CreateView";
import { Dashboard } from "./pages/Dashboard";
import { ListView } from "./pages/ListView";
import { useSchema } from "./hooks/useSchema";
import { ThemeProvider, ThemeSettings } from "./components/ThemeProvider";
import { LoginPage } from "./pages/LoginPage";
import type { Schema } from "./types";

export const App = () => {
   const isLoginRoute = window.location.pathname.endsWith("/login");
   const state = useSchema(!isLoginRoute);
   return (
      <ThemeProvider>
         {isLoginRoute && <LoginPage />}
         {!isLoginRoute && state.status === "loading" && <FullPageState eyebrow="Prisma Admin" title="Loading your workspace" detail="Reading the models and permissions available to you…" busy />}
         {!isLoginRoute && state.status === "unauthorized" && <FullPageState eyebrow="Access required" title="You’re not signed in" detail="Sign in through the host application, then return here to open the admin workspace." />}
         {!isLoginRoute && state.status === "error" && <FullPageState eyebrow="Unable to connect" title="The admin is unavailable" detail={state.message} />}
         {!isLoginRoute && state.status === "ready" && (
            <BrowserRouter basename="/admin">
               <AdminShell schema={state.schema} />
            </BrowserRouter>
         )}
      </ThemeProvider>
   );
};

const AdminShell = ({ schema }: { schema: Schema }) => {
   const [sidebarOpen, setSidebarOpen] = useState(false);
   const location = useLocation();
   const navigate = useNavigate();
   const segments = location.pathname.split("/").filter(Boolean);
   const activeModel = schema.models.find((model) => segments[0] === model.meta.pluralName);
   const closeSidebar = () => setSidebarOpen(false);

   const crumbLabel = useMemo(() => {
      if (!activeModel) return "Overview";
      if (segments[1] === "new") return `New ${activeModel.meta.name}`;
      if (segments[2] === "edit") return `Edit ${activeModel.meta.name}`;
      if (segments[1]) return activeModel.meta.name;
      return activeModel.meta.name;
   }, [activeModel, segments]);

   const backTarget = useMemo(() => {
      if (!activeModel) return null;
      if (segments[2] === "edit" && segments[1]) return `/${activeModel.meta.pluralName}`;
      if (segments[1] === "new" || segments[1]) return `/${activeModel.meta.pluralName}`;
      return "/";
   }, [activeModel, segments]);

   return (
      <div className="app-frame">
         <div className={`scrim ${sidebarOpen ? "is-visible" : ""}`} onClick={closeSidebar} />
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
               <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeSidebar}>
                  <LayoutDashboard className="nav-icon" size={18} strokeWidth={1.75} aria-hidden />
                  <span>Overview</span>
               </NavLink>
               <div className="nav-label models-label">Models</div>
               {schema.models
                  .filter((model) => model.config.permissions.list)
                  .map((model) => (
                     <NavLink key={model.meta.name} to={`/${model.meta.pluralName}`} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={closeSidebar}>
                        <span className="nav-icon model-icon">{model.meta.name.slice(0, 1)}</span>
                        <span>{model.meta.name}</span>
                     </NavLink>
                  ))}
            </nav>
            <div className="sidebar-footer">
               <span className="status-dot" /> Connected to host app
            </div>
         </aside>
         <main className="main-panel">
            <header className="topbar">
               <div className="topbar-left">
                  <button className="menu-button" type="button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
                     <Menu size={20} strokeWidth={1.75} aria-hidden />
                  </button>
                  {backTarget ? (
                     <button className="breadcrumb-back" type="button" aria-label="Go back" onClick={() => navigate(backTarget)}>
                        <ArrowLeft size={16} strokeWidth={2} aria-hidden />
                     </button>
                  ) : (
                     <span className="breadcrumb-home" aria-hidden>
                        <Home size={15} strokeWidth={1.75} />
                     </span>
                  )}
                  <div className="breadcrumb">
                     <span>Admin</span>
                     <span className="breadcrumb-separator">/</span>
                     <strong>{crumbLabel}</strong>
                  </div>
               </div>
               <div className="topbar-right">
                  <ThemeSettings email={schema.identity.email} role={schema.identity.role} />
               </div>
            </header>
            <div className="content-wrap">
               <Routes>
                  <Route path="/" element={<Dashboard schema={schema} />} />
                  <Route path="/:model/new" element={<CreateView schema={schema} mode="create" />} />
                  <Route path="/:model/:id/edit" element={<CreateView schema={schema} mode="edit" />} />
                  <Route path="/:model" element={<ListView schema={schema} />} />
                  <Route path="*" element={<NotFound />} />
               </Routes>
            </div>
         </main>
      </div>
   );
};
