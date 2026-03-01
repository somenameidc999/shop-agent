import { ServerConfigForm, type FieldDef, type FormProps } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "serviceAccountJson",
    label: "Service Account JSON",
    type: "textarea",
    required: true,
    sensitive: true,
    placeholder: '{"type": "service_account", "project_id": "...", ...}',
  },
];

export function GoogleForm(props: FormProps) {
  return (
    <ServerConfigForm
      serverType="google"
      label="Google Services"
      description="Google Drive, Docs, and Sheets access via service account"
      fields={FIELDS}
      {...props}
    />
  );
}
