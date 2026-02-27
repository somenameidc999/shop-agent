import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "accessToken",
    label: "Access Token",
    type: "password",
    required: true,
    sensitive: true,
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

export function DropboxForm(props: Props) {
  return (
    <ServerConfigForm
      serverType="dropbox"
      label="Dropbox"
      description="Dropbox file operations — list, read, write, search"
      fields={FIELDS}
      {...props}
    />
  );
}
