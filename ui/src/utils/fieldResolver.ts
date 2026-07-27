import type { Field } from "../types";

export const writableFields = (fields: Field[]): Field[] => fields.filter((field) => field.type !== "relation" && !field.isReadOnly && !field.isList);

export const resolveWidget = (field: Field): "text" | "number" | "boolean" | "enum" | "datetime" => {
  if (field.type === "number") return "number";
  if (field.type === "boolean") return "boolean";
  if (field.type === "enum") return "enum";
  if (field.type === "datetime") return "datetime";
  return "text";
};
