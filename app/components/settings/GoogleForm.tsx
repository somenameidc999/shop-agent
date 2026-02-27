import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

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

export function GoogleForm(props: Props) {
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
