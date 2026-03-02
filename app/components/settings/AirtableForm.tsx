import { ServerConfigForm, type FieldDef, type FormProps } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    required: true,
    sensitive: true,
    placeholder: "pat...",
  },
  {
    key: "baseId",
    label: "Base ID",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "app...",
  },
];

export function AirtableForm(props: FormProps) {
  return (
    <ServerConfigForm
      serverType="airtable"
      label="Airtable"
      description="Airtable CRUD operations and schema inspection"
      fields={FIELDS}
      {...props}
    />
  );
}
