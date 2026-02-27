import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

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

interface Props {
  savedValues: Record<string, string>;
  hasConfig: boolean;
  enabled: boolean;
  onSave: (
    serverType: string,
    values: Record<string, string>,
    enabled: boolean,
  ) => void;
  onDelete: (serverType: string) => void;
  saving: boolean;
}

export function AirtableForm(props: Props) {
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
