import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "baseUrl",
    label: "Base URL",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "https://api.example.com",
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    required: false,
    sensitive: true,
    placeholder: "Optional",
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

export function CustomApiForm(props: Props) {
  return (
    <ServerConfigForm
      serverType="custom-api"
      label="Custom API"
      description="Custom REST API integration — GET, POST, PUT, DELETE"
      fields={FIELDS}
      {...props}
    />
  );
}
