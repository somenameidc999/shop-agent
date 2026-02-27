import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "connectionString",
    label: "Connection String",
    type: "password",
    required: true,
    sensitive: true,
    placeholder: "postgresql://user:pass@host:5432/dbname",
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

export function PostgresForm(props: Props) {
  return (
    <ServerConfigForm
      serverType="postgres"
      label="PostgreSQL"
      description="PostgreSQL database access and querying"
      fields={FIELDS}
      {...props}
    />
  );
}
