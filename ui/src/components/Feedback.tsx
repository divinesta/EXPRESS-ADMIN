export const FullPageState = ({ eyebrow, title, detail, busy = false }: { eyebrow: string; title: string; detail: string; busy?: boolean }) => (
   <main className="full-page-state">
      <div className="state-mark">{busy ? <span className="spinner" /> : "P"}</div>
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{detail}</p>
   </main>
);

export const ApiNotice = ({ message }: { message: string }) => (
   <div className="api-notice" role="alert">
      <strong>Couldn’t complete that request.</strong>
      <span>{message}</span>
   </div>
);

export const NotFound = () => (
   <div className="empty-state">
      <div className="empty-icon">?</div>
      <h1>Model not found</h1>
      <p>This model is not registered or is not available to your account.</p>
   </div>
);
