import { ServerConfigForm, type FieldDef, type FormProps } from "./ServerConfigForm";

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

export function CustomApiForm(props: FormProps) {
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
