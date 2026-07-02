export type TemplateField = {
  selector: string;
  type: string;
  label: string;
  value: string | boolean;
};

export type Template = {
  id: string;
  name: string;
  description?: string;
  fields: TemplateField[];
};

export type TemplateBundle = {
  name?: string;
  version?: number;
  exportedAt?: string;
  templates: Template[];
};
