import { ServerConfigForm, type FieldDef, type FormProps } from "./ServerConfigForm";

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

export function PostgresForm(props: FormProps) {
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
