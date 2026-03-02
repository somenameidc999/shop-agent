import { ServerConfigForm, type FieldDef, type FormProps } from "./ServerConfigForm";

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

export function MysqlForm(props: FormProps) {
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
