import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "connectionString",
    label: "Connection String",
    type: "password",
    required: true,
    sensitive: true,
    placeholder: "mysql://user:pass@host:3306/dbname",
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

export function MysqlForm(props: Props) {
  return (
    <ServerConfigForm
      serverType="mysql"
      label="MySQL"
      description="MySQL database access and querying"
      fields={FIELDS}
      {...props}
    />
  );
}
