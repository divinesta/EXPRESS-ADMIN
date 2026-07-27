import { useState } from "react";

export const useFormModel = (fields: { name: string; type: string }[]) => {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((field) => [field.name, field.type === "boolean" ? false : ""])));
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("ready");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  return { values, setValues, status, setStatus, error, setError, fieldErrors, setFieldErrors };
};
