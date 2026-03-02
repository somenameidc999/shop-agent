import { ServerConfigForm, type FieldDef, type FormProps } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "accessToken",
    label: "Access Token",
    type: "password",
    required: true,
    sensitive: true,
  },
];

export function DropboxForm(props: FormProps) {
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
