import { ServerConfigForm, type FieldDef, type FormProps } from "./ServerConfigForm";

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

export function FtpForm(props: FormProps) {
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
