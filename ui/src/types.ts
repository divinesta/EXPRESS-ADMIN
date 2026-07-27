export type Field = {
  name: string;
  type: string;
  isId: boolean;
  isRequired: boolean;
  isReadOnly: boolean;
  isList?: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
  relation?: { model: string; displayField: string } | null;
};

export type ModelPermissions = {
  list: boolean;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  actions: Record<string, boolean>;
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
  };
};

export type Schema = {
  siteName: string;
  basePath: string;
  identity: { id: string; email: string; role: string; isSuperAdmin: boolean };
  models: Model[];
};

export type RecordData = Record<string, unknown>;

export type LoadState =
  | { status: "loading" }
  | { status: "ready"; schema: Schema }
  | { status: "unauthorized" }
  | { status: "error"; message: string };
