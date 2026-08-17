import type { RecordData, Schema } from "./types";
import { adminBasePath, joinAdminPath } from "./config";

export const apiBase = joinAdminPath(adminBasePath, "/api");

export const readApiError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
};

export const fetchSchema = async (): Promise<Schema> => {
  const response = await fetch(`${apiBase}/schema`, { credentials: "include", headers: { Accept: "application/json" } });
  if (response.status === 401 || response.status === 403) throw new Error("UNAUTHORIZED");
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<Schema>;
};

export const fetchRecord = async (model: string, id: string): Promise<RecordData> => {
  const response = await fetch(`${apiBase}/${model}/${encodeURIComponent(id)}`, { credentials: "include", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<RecordData>;
};
