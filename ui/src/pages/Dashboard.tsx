import { ArrowUpRight } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { Schema } from "../types";
import { formatDate } from "../utils/format";

export const Dashboard = ({ schema }: { schema: Schema }) => {
   const visibleModels = schema.models.filter((model) => model.config.permissions.list);
   return (
      <section className="page-section">
         <div className="eyebrow">{formatDate(new Date())}</div>
         {/* <div className="page-heading">
            <div>
               <h1>Good to see you.</h1>
               <p>Choose a model to start managing your data.</p>
            </div>
         </div>
         <div className="overview-grid">
            <div className="welcome-card">
               <div className="welcome-glow" />
               <div className="eyebrow light">Your workspace</div>
               <h2>One clear view of your data.</h2>
               <p>
                  The admin is connected to your application and ready to work with {visibleModels.length} {visibleModels.length === 1 ? "registered model" : "registered models"}.
               </p>
               <div className="welcome-meta">
                  <span className="mini-avatar">{schema.identity.email.slice(0, 1).toUpperCase()}</span>
                  <span>
                     Signed in as <strong>{schema.identity.email}</strong>
                  </span>
               </div>
            </div>
            <div className="metric-card">
               <span className="metric-label">Registered models</span>
               <strong>{visibleModels.length.toString().padStart(2, "0")}</strong>
               <span className="metric-foot">Visible to your account</span>
            </div>
         </div> */}
         <div className="section-heading">
            <div>
               <h2>Available models</h2>
               <p>Open a model to view its records and controls.</p>
            </div>
         </div>
         <div className="model-cards">
            {visibleModels.map((model) => (
               <NavLink className="model-card" key={model.meta.name} to={`/${model.meta.pluralName}`}>
                  <span className="model-card-icon">{model.meta.name.slice(0, 1)}</span>
                  <span className="model-card-copy">
                     <strong>{model.meta.name}</strong>
                     <small>
                        {model.meta.fields.length} fields · {model.config.permissions.create ? "Can create" : "Read only"}
                     </small>
                  </span>
                  <ArrowUpRight className="arrow" size={18} strokeWidth={1.75} aria-hidden />
               </NavLink>
            ))}
         </div>
      </section>
   );
};
