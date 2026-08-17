import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type ThemeMode = "system" | "light" | "dark";
type PaletteName = "lime" | "ocean" | "violet" | "rose" | "amber";

type Appearance = { mode: ThemeMode; palette: PaletteName };

const storageKey = "express-admin:appearance";
const paletteLabels: Record<PaletteName, string> = {
   lime: "Lime",
   ocean: "Ocean",
   violet: "Violet",
   rose: "Rose",
   amber: "Amber",
};

const defaultAppearance: Appearance = { mode: "system", palette: "lime" };

const readAppearance = (): Appearance => {
   try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<Appearance>;
      return {
         mode: stored.mode === "light" || stored.mode === "dark" || stored.mode === "system" ? stored.mode : defaultAppearance.mode,
         palette: stored.palette && stored.palette in paletteLabels ? stored.palette : defaultAppearance.palette,
      };
   } catch {
      return defaultAppearance;
   }
};

const resolveTheme = (mode: ThemeMode) => (mode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode);

type ThemeContextValue = Appearance & { setMode: (mode: ThemeMode) => void; setPalette: (palette: PaletteName) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
   const [appearance, setAppearance] = useState<Appearance>(readAppearance);

   useLayoutEffect(() => {
      const apply = () => {
         document.documentElement.dataset.theme = resolveTheme(appearance.mode);
         document.documentElement.dataset.palette = appearance.palette;
      };
      apply();
      window.localStorage.setItem(storageKey, JSON.stringify(appearance));
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
   }, [appearance]);

   return (
      <ThemeContext.Provider value={{ ...appearance, setMode: (mode) => setAppearance((current) => ({ ...current, mode })), setPalette: (palette) => setAppearance((current) => ({ ...current, palette })) }}>
         {children}
      </ThemeContext.Provider>
   );
};

const useTheme = () => {
   const theme = useContext(ThemeContext);
   if (!theme) throw new Error("ThemeSettings must be rendered within ThemeProvider.");
   return theme;
};

export const ThemeSettings = ({ email, role, canLogout, onLogout }: { email: string; role: string; canLogout: boolean; onLogout: () => Promise<void> }) => {
   const [open, setOpen] = useState(false);
   const [loggingOut, setLoggingOut] = useState(false);
   const [logoutError, setLogoutError] = useState("");
   const controlRef = useRef<HTMLDivElement>(null);
   const { mode, palette, setMode, setPalette } = useTheme();
   const ModeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;

   useEffect(() => {
      if (!open) return;
      const closeOnOutsidePress = (event: PointerEvent) => {
         if (controlRef.current && !controlRef.current.contains(event.target as Node)) setOpen(false);
      };
      const closeOnEscape = (event: KeyboardEvent) => {
         if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", closeOnOutsidePress);
      document.addEventListener("keydown", closeOnEscape);
      return () => {
         document.removeEventListener("pointerdown", closeOnOutsidePress);
         document.removeEventListener("keydown", closeOnEscape);
      };
   }, [open]);

   const logout = async () => {
      if (loggingOut) return;
      setLoggingOut(true);
      setLogoutError("");
      try {
         await onLogout();
      } catch (error) {
         setLogoutError(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
         setLoggingOut(false);
      }
   };

   return (
      <div className="appearance-control" ref={controlRef}>
         <button className="appearance-trigger identity-chip" type="button" aria-expanded={open} aria-controls="appearance-panel" onClick={() => setOpen((value) => !value)}>
            <span className="avatar">{email.slice(0, 1).toUpperCase()}</span>
            <span className="identity-copy">
               <strong>{email}</strong>
               <span>{role}</span>
            </span>
         </button>
         {open && (
            <section className="appearance-panel" id="appearance-panel" aria-label="Appearance settings">
               <div className="appearance-heading">
                  <div>
                     <strong>Appearance</strong>
                     <span>Saved on this device</span>
                  </div>
                  <ModeIcon size={18} strokeWidth={1.75} aria-hidden />
               </div>
               <fieldset className="appearance-group">
                  <legend>Color mode</legend>
                  <div className="mode-options">
                     {(["system", "light", "dark"] as ThemeMode[]).map((option) => (
                        <button key={option} type="button" className={mode === option ? "is-selected" : ""} aria-pressed={mode === option} onClick={() => setMode(option)}>
                           {option === "system" ? <Monitor size={15} aria-hidden /> : option === "light" ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
                           {option === "system" ? "System" : option === "light" ? "Light" : "Dark"}
                        </button>
                     ))}
                  </div>
               </fieldset>
               <fieldset className="appearance-group">
                  <legend>Accent palette</legend>
                  <div className="palette-options">
                     {(Object.keys(paletteLabels) as PaletteName[]).map((option) => (
                        <button key={option} type="button" className={`palette-swatch ${option} ${palette === option ? "is-selected" : ""}`} aria-label={`${paletteLabels[option]} palette`} aria-pressed={palette === option} onClick={() => setPalette(option)}>
                           <span aria-hidden />
                           <small>{paletteLabels[option]}</small>
                        </button>
                     ))}
                  </div>
               </fieldset>
               {canLogout && (
                  <div className="appearance-logout">
                     <button type="button" className="logout-button" onClick={() => void logout()} disabled={loggingOut}>
                        <LogOut size={15} strokeWidth={1.75} aria-hidden />
                        {loggingOut ? "Signing out…" : "Log out"}
                     </button>
                     {logoutError && <p role="alert">{logoutError}</p>}
                  </div>
               )}
            </section>
         )}
      </div>
   );
};
