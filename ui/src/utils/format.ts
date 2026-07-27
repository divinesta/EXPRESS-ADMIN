import type { Field } from "../types";

export const fieldLabel = (name: string): string => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase());

export const formatDate = (date: Date): string => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date);

export const formatRecordValue = (value: unknown, field: Field): string => {
  if (value === null || value === undefined) return "";
  if (field.relation && typeof value === "object") return String((value as Record<string, unknown>)[field.relation.displayField] ?? "—");
  if (field.type === "boolean") return value === true ? "Yes" : "No";
  if (field.type === "datetime") return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)));
  return String(value);
};

export const toDateInput = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export const extractFieldName = (message: string): string | undefined => /Field "([^"]+)"/.exec(message)?.[1];
