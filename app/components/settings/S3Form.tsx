import { ServerConfigForm, type FieldDef } from "./ServerConfigForm";

const FIELDS: FieldDef[] = [
  {
    key: "accessKeyId",
    label: "Access Key ID",
    type: "password",
    required: true,
    sensitive: true,
    placeholder: "AKIA...",
  },
  {
    key: "secretAccessKey",
    label: "Secret Access Key",
    type: "password",
    required: true,
    sensitive: true,
  },
  {
    key: "region",
    label: "Region",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "us-east-1",
    defaultValue: "us-east-1",
  },
  {
    key: "bucket",
    label: "Bucket Name",
    type: "text",
    required: true,
    sensitive: false,
    placeholder: "my-bucket",
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

export function S3Form(props: Props) {
  return (
    <ServerConfigForm
      serverType="s3"
      label="AWS S3"
      description="AWS S3 bucket operations — list, read, write objects"
      fields={FIELDS}
      {...props}
    />
  );
}
