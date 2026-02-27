import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "emailAddress",
    label: "Email Address",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "you@gmail.com",
  },
  {
    key: "password",
    label: "Password / App Password",
    type: "password",
    required: true,
    sensitive: true,
    placeholder: "App-specific password",
  },
  {
    key: "imapHost",
    label: "IMAP Host",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "imap.gmail.com",
  },
  {
    key: "smtpHost",
    label: "SMTP Host",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "smtp.gmail.com",
  },
  {
    key: "imapPort",
    label: "IMAP Port",
    type: "number",
    required: false,
    sensitive: false,
    placeholder: "993",
    defaultValue: "993",
  },
  {
    key: "smtpPort",
    label: "SMTP Port",
    type: "number",
    required: false,
    sensitive: false,
    placeholder: "465",
    defaultValue: "465",
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

export function EmailForm(props: Props) {
  return (
    <ServerConfigForm
      serverType="email"
      label="Email (IMAP/SMTP)"
      description="Read, search, send, and manage email via IMAP and SMTP"
      fields={FIELDS}
      {...props}
    />
  );
}
