/**
 * MCP Server Settings Page
 *
 * Configure credentials for each MCP data source.
 * Credentials are encrypted at rest and never displayed in plain text.
 *
 * Uses Remix loader/action pattern for server-side data operations,
 * bypassing the need for authenticated client-side fetch calls.
 */

import { useEffect, useCallback, useRef } from "react";
import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getAllConfigsForShop,
  getConfigForShop,
  saveConfigForShop,
  deleteConfigForShop,
  SERVER_FIELD_DEFS,
  type ServerType,
} from "../services/mcpConfig.server";
import { mcpManager } from "../mcp/mcpManager.server";

import { PostgresForm } from "../components/settings/PostgresForm";
import { MysqlForm } from "../components/settings/MysqlForm";
import { GoogleForm } from "../components/settings/GoogleForm";
import { AirtableForm } from "../components/settings/AirtableForm";
// import { S3Form } from "../components/settings/S3Form";
// import { DropboxForm } from "../components/settings/DropboxForm";
import { EmailForm } from "../components/settings/EmailForm";
import { FtpForm } from "../components/settings/FtpForm";
import { CustomApiForm } from "../components/settings/CustomApiForm";

// ---------------------------------------------------------------------------
// Server: loader + action
// ---------------------------------------------------------------------------

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const configs = await getAllConfigsForShop(session.shop);
  return { configs };
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const body = (await request.json()) as {
    _action?: string;
    serverType?: string;
    fields?: Record<string, string>;
    enabled?: boolean;
  };

  if (body._action === "delete") {
    if (!body.serverType) {
      return { error: "serverType is required" };
    }
    await deleteConfigForShop(session.shop, body.serverType);
    await mcpManager.reinitialize(session.shop);
    return { success: true, message: "Configuration removed" };
  }

  // Default: save
  const { serverType, fields, enabled } = body;
  if (!serverType || !fields) {
    return { error: "serverType and fields are required" };
  }

  const def = SERVER_FIELD_DEFS[serverType as ServerType];
  if (!def) {
    return { error: "Unknown server type" };
  }

  const missingRequired = def.fields
    .filter((f) => f.required && !fields[f.key])
    .map((f) => f.label);

  if (missingRequired.length > 0) {
    return { error: `Missing required fields: ${missingRequired.join(", ")}` };
  }

  // Merge: keep existing values for sensitive fields the user didn't change
  const existing = await getConfigForShop(session.shop, serverType);
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

  await saveConfigForShop(session.shop, serverType, mergedFields, enabled ?? true);
  await mcpManager.reinitialize(session.shop);

  return { success: true, message: "Configuration saved successfully" };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

interface ServerConfigSummary {
  serverType: string;
  label: string;
  description: string;
  enabled: boolean;
  hasConfig: boolean;
  fields: Record<string, string>;
}

const FORM_COMPONENTS: Record<
  string,
  React.ComponentType<{
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
  }>
> = {
  postgres: PostgresForm,
  mysql: MysqlForm,
  google: GoogleForm,
  airtable: AirtableForm,
  // s3: S3Form,
  // dropbox: DropboxForm,
  email: EmailForm,
  ftp: FtpForm,
  "custom-api": CustomApiForm,
};

export default function SettingsPage() {
  const { configs } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const saving = fetcher.state === "submitting";

  // Show toasts when the action completes
  const lastFetcherData = useRef(fetcher.data);
  useEffect(() => {
    if (fetcher.data && fetcher.data !== lastFetcherData.current) {
      lastFetcherData.current = fetcher.data;
      if ("success" in fetcher.data && fetcher.data.success) {
        shopify.toast.show(
          (fetcher.data as { message?: string }).message ?? "Done",
        );
      } else if ("error" in fetcher.data) {
        shopify.toast.show(fetcher.data.error as string, { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  const handleSave = useCallback(
    (serverType: string, values: Record<string, string>, enabled: boolean) => {
      fetcher.submit(
        { serverType, fields: values, enabled },
        { method: "POST", encType: "application/json" },
      );
    },
    [fetcher],
  );

  const handleDelete = useCallback(
    (serverType: string) => {
      fetcher.submit(
        { _action: "delete", serverType },
        { method: "POST", encType: "application/json" },
      );
    },
    [fetcher],
  );

  const connectedCount = (configs as ServerConfigSummary[]).filter(
    (c) => c.enabled && c.hasConfig,
  ).length;

  return (
    <s-page heading="Data Source Settings">
      <s-section>
        <s-paragraph>
          Configure credentials for each data source your Sidekick agent can
          connect to. All credentials are encrypted at rest and never displayed
          in plain text. After saving, the agent will automatically reconnect
          with the updated configuration.
        </s-paragraph>
      </s-section>

      <s-section>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-text>
              <strong>
                {connectedCount} of {(configs as ServerConfigSummary[]).length}
              </strong>{" "}
              data sources connected
            </s-text>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Data Sources">
        {(configs as ServerConfigSummary[]).map((config) => {
          const FormComponent = FORM_COMPONENTS[config.serverType];
          if (!FormComponent) return null;
          return (
            <FormComponent
              key={config.serverType}
              savedValues={config.fields}
              hasConfig={config.hasConfig}
              enabled={config.enabled}
              onSave={handleSave}
              onDelete={handleDelete}
              saving={saving}
            />
          );
        })}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
