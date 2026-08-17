declare global {
  interface Window {
    __EXPRESS_ADMIN_BASE_PATH__?: string;
  }
}

/** Set by the server in index.html so one UI build works at any base path. */
export const adminBasePath = window.__EXPRESS_ADMIN_BASE_PATH__ ?? "/admin";
