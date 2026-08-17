export type Field = {
  name: string;
  type: string;
  isId: boolean;
  isRequired: boolean;
  isReadOnly: boolean;
  isList?: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  relation?: {
    model: string;
    displayField: string;
    kind: "belongsTo" | "hasMany" | "manyToMany" | "hasOne";
    foreignKeyFields: string[];
  } | null;
};

export type ModelPermissions = {
  list: boolean;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  actions: Record<string, boolean>;
};

export type ListAction = {
  name: string;
  label: string;
};

export type Model = {
  meta: {
    name: string;
    pluralName: string;
    fields: Field[];
    idField: string;
    displayField: string;
  };
  config: {
    listDisplay: string[];
    listFilter: string[];
    searchFields: string[];
    defaultSort: { field: string; direction: "asc" | "desc" };
    perPage: number;
    permissions: ModelPermissions;
    actions: ListAction[];
  };
};

export type Schema = {
  siteName: string;
  basePath: string;
  identity: { id: string; email: string; role: string; isSuperAdmin: boolean };
  authMode: "built-in" | "external";
  models: Model[];
};

export type RecordData = Record<string, unknown>;

export type LoadState =
  | { status: "loading" }
  | { status: "ready"; schema: Schema }
  | { status: "unauthorized" }
  | { status: "error"; message: string };
