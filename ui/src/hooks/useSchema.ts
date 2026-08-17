import { useEffect, useState } from "react";
import { fetchSchema } from "../api";
import type { LoadState } from "../types";

export const useSchema = (enabled = true): LoadState => {
  const [state, setState] = useState<LoadState>({ status: "loading" });
   useEffect(() => {
      if (!enabled) return;
    let active = true;
    fetchSchema().then((schema) => active && setState({ status: "ready", schema })).catch((error: unknown) => {
      if (!active) return;
      setState(error instanceof Error && error.message === "UNAUTHORIZED" ? { status: "unauthorized" } : { status: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    });
    return () => { active = false; };
   }, [enabled]);
  return state;
};
