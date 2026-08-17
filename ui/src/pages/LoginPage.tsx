import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type Identifier = "email" | "username";

const authUrl = "/admin/api/auth";

export const LoginPage = () => {
   const [identifierType, setIdentifierType] = useState<Identifier | null>(null);
   const [identifier, setIdentifier] = useState("");
   const [password, setPassword] = useState("");
   const [showPassword, setShowPassword] = useState(false);
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState("");

   useEffect(() => {
      let active = true;
      fetch(`${authUrl}/config`, { credentials: "include", headers: { Accept: "application/json" } })
         .then(async (response) => {
            if (!response.ok) throw new Error("Built-in admin authentication is unavailable.");
            return response.json() as Promise<{ identifier: Identifier }>;
         })
         .then((config) => active && setIdentifierType(config.identifier))
         .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Unable to load the sign-in form."));
      return () => { active = false; };
   }, []);

   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!identifierType || submitting) return;
      setSubmitting(true);
      setError("");
      try {
         const response = await fetch(`${authUrl}/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ identifier, password }),
         });
         if (!response.ok) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(body?.error ?? "Unable to sign in.");
         }
         window.location.assign("/admin/");
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : "Unable to sign in.");
      } finally {
         setSubmitting(false);
      }
   };

   const identifierLabel = identifierType === "email" ? "Email address" : "Username";
   return (
      <main className="login-page" aria-labelledby="login-title">
         <section className="login-card">
            <div className="login-brand" aria-hidden="true"><ShieldCheck size={22} strokeWidth={1.75} /></div>
            <div className="login-heading">
               <p>Express Admin</p>
               <h1 id="login-title">Sign in to continue</h1>
               <span>Use an administrator account to access this workspace.</span>
            </div>

            <form className="login-form" onSubmit={submit} noValidate>
               <div className="login-field">
                  <label htmlFor="admin-identifier">{identifierLabel}</label>
                  <input id="admin-identifier" name="identifier" type={identifierType === "email" ? "email" : "text"} autoComplete="username" autoCapitalize="none" value={identifier} onChange={(event) => setIdentifier(event.target.value)} disabled={!identifierType || submitting} required />
               </div>
               <div className="login-field">
                  <label htmlFor="admin-password">Password</label>
                  <div className="login-password-wrap">
                     <input id="admin-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={!identifierType || submitting} required />
                     <button className="password-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} disabled={!identifierType || submitting}>
                        {showPassword ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
                     </button>
                  </div>
               </div>
               {error && <p className="login-error" role="alert">{error}</p>}
               <button className="login-submit" type="submit" disabled={!identifierType || submitting}>
                  <KeyRound size={17} strokeWidth={1.75} />
                  <span>{submitting ? "Signing in…" : "Sign in"}</span>
               </button>
            </form>
         </section>
      </main>
   );
};
