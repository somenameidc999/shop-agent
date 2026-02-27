import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "host",
    label: "Host",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "ftp.example.com",
  },
  {
    key: "port",
    label: "Port",
    type: "number",
    required: false,
    sensitive: false,
    placeholder: "22",
    defaultValue: "22",
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    sensitive: false,
  },
  {
    key: "password",
    label: "Password",
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

export function FtpForm(props: Props) {
  return (
    <ServerConfigForm
      serverType="ftp"
      label="FTP / SFTP"
      description="FTP/SFTP file operations — list, upload, download"
      fields={FIELDS}
      {...props}
    />
  );
}
