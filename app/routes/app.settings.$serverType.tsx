import { useState, useCallback, useEffect, useRef } from "react";
import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getAllConfigsForShop,
  getConfigForShop,
  saveConfigForShop,
  deleteConfigForShop,
} from "../services/mcpConfig.server";
import {
  SERVER_FIELD_DEFS,
  SERVER_TYPES,
  type ServerType,
  type InstanceConfigSummary,
} from "../services/mcpConfig.shared";
import { mcpManager } from "../mcp/mcpManager.server";
import { PostgresForm } from "../components/settings/PostgresForm";
import { MysqlForm } from "../components/settings/MysqlForm";
import { GoogleForm } from "../components/settings/GoogleForm";
import { AirtableForm } from "../components/settings/AirtableForm";
import { EmailForm } from "../components/settings/EmailForm";
import { FtpForm } from "../components/settings/FtpForm";
import { CustomApiForm } from "../components/settings/CustomApiForm";
import type { FormProps } from "../components/settings/ServerConfigForm";

const FORM_COMPONENTS: Record<string, React.ComponentType<FormProps>> = {
  postgres: PostgresForm,
  mysql: MysqlForm,
  google: GoogleForm,
  airtable: AirtableForm,
  email: EmailForm,
  ftp: FtpForm,
  "custom-api": CustomApiForm,
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const serverType = params.serverType as string;

  if (!SERVER_TYPES.includes(serverType as ServerType)) {
    throw new Response("Not Found", { status: 404 });
  }

  const allConfigs = await getAllConfigsForShop(session.shop);
  const configs = allConfigs.filter(
    (c: InstanceConfigSummary) => c.serverType === serverType,
  );

  return { serverType, configs };
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const body = (await request.json()) as {
    _action?: string;
    serverType?: string;
    instanceName?: string;
    fields?: Record<string, string>;
    enabled?: boolean;
  };

  if (body._action === "delete") {
    if (!body.serverType || !body.instanceName) {
      return { error: "serverType and instanceName are required" };
    }
    await deleteConfigForShop(session.shop, body.serverType, body.instanceName);
    await mcpManager.reinitialize(session.shop);
    return { success: true, message: "Configuration removed" };
  }

  const { serverType, instanceName, fields, enabled } = body;
  if (!serverType || !instanceName || !fields) {
    return { error: "serverType, instanceName, and fields are required" };
  }

  const def = SERVER_FIELD_DEFS[serverType as ServerType];
  if (!def) return { error: "Unknown server type" };

  const missingRequired = def.fields
    .filter((f) => f.required && !fields[f.key])
    .map((f) => f.label);

  if (missingRequired.length > 0) {
    return { error: `Missing required fields: ${missingRequired.join(", ")}` };
  }

  const existing = await getConfigForShop(
    session.shop,
    serverType,
    instanceName,
  );
  const mergedFields: Record<string, string> = {};
  for (const field of def.fields) {
    const incoming = fields[field.key];
    if (incoming && incoming !== "••••••••") {
      mergedFields[field.key] = incoming;
    } else if (existing?.fields[field.key]) {
      mergedFields[field.key] = existing.fields[field.key]!;
    } else {
      mergedFields[field.key] = incoming ?? "";
    }
  }

  await saveConfigForShop(
    session.shop,
    serverType,
    instanceName,
    mergedFields,
    enabled ?? true,
  );
  await mcpManager.reinitialize(session.shop);

  return { success: true, message: "Configuration saved successfully" };
}

export default function ServerTypeDetailPage() {
  const { serverType, configs } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const saving = fetcher.state === "submitting";

  const def = SERVER_FIELD_DEFS[serverType as ServerType];
  const FormComponent = FORM_COMPONENTS[serverType];
  const [showNew, setShowNew] = useState(false);

  const typedConfigs = configs as InstanceConfigSummary[];
  const connectedCount = typedConfigs.filter(
    (c) => c.enabled && c.hasConfig,
  ).length;

  const lastFetcherData = useRef(fetcher.data);
  useEffect(() => {
    if (fetcher.data && fetcher.data !== lastFetcherData.current) {
      lastFetcherData.current = fetcher.data;
      if ("success" in fetcher.data && fetcher.data.success) {
        shopify.toast.show(
          (fetcher.data as { message?: string }).message ?? "Done",
        );
        setShowNew(false);
      } else if ("error" in fetcher.data) {
        shopify.toast.show(fetcher.data.error as string, { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const handleSave = useCallback(
    (
      st: string,
      name: string,
      values: Record<string, string>,
      enabled: boolean,
    ) => {
      fetcher.submit(
        { serverType: st, instanceName: name, fields: values, enabled },
        { method: "POST", encType: "application/json" },
      );
    },
    [fetcher],
  );

  const handleDelete = useCallback(
    (st: string, name: string) => {
      fetcher.submit(
        { _action: "delete", serverType: st, instanceName: name },
        { method: "POST", encType: "application/json" },
      );
    },
    [fetcher],
  );

  if (!def || !FormComponent) {
    return (
      <s-page heading="Not Found">
        <s-section>
          <s-paragraph>Unknown data source type.</s-paragraph>
          <s-link href="/app/settings">← Back to Data Sources</s-link>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={def.label}>
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => navigate("/app/settings")}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--s-color-text-link, #005bd3)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          ← Back to Data Sources
        </button>
      </div>

      <s-section>
        <s-paragraph>{def.description}</s-paragraph>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 12,
            marginBottom: 16,
          }}
        >
          <s-text>
            <strong>{connectedCount}</strong> connection
            {connectedCount !== 1 ? "s" : ""} active
          </s-text>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            disabled={showNew}
            style={{
              padding: "8px 16px",
              background: showNew ? "#f6f6f7" : "#008060",
              color: showNew ? "#999" : "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: showNew ? "not-allowed" : "pointer",
            }}
          >
            + Add Connection
          </button>
        </div>
      </s-section>

      <s-section heading="Connections">
        {typedConfigs.map((config) => (
          <FormComponent
            key={`${config.serverType}-${config.instanceName}`}
            instanceName={config.instanceName}
            savedValues={config.fields}
            hasConfig={config.hasConfig}
            enabled={config.enabled}
            onSave={handleSave}
            onDelete={handleDelete}
            saving={saving}
          />
        ))}

        {showNew && (
          <FormComponent
            instanceName=""
            savedValues={{}}
            hasConfig={false}
            enabled={true}
            isNew
            onSave={handleSave}
            onDelete={handleDelete}
            onCancelNew={() => setShowNew(false)}
            saving={saving}
          />
        )}

        {typedConfigs.length === 0 && !showNew && (
          <div
            style={{
              padding: "40px 24px",
              border: "1px dashed #ccc",
              borderRadius: 12,
              textAlign: "center",
              color: "#666",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
            <div
              style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}
            >
              No connections configured
            </div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>
              Add your first {def.label} connection to get started.
            </div>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              style={{
                padding: "8px 20px",
                background: "#008060",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add Connection
            </button>
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
