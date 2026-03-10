import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { mcpManager } from "../mcp/mcpManager.server";
import { ensureShopInfo } from "../services/shop.server";
import { initWorker } from "../jobs/worker.server";
import { initScheduler } from "../jobs/scheduler.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Persist shop info. Only calls the Shopify API when there is no saved
  // record yet; only writes to the DB when the token has rotated.
  void ensureShopInfo(
    session.shop,
    session.accessToken ?? "",
    async () => {
      const res = await admin.graphql(`{ shop { name } }`);
      const { data } = await res.json();
      return data!.shop.name;
    },
  ).catch((err) => console.error("Failed to persist shop info:", err));

  void mcpManager.ensureInitialized(session.shop).catch(console.error);

  // Initialize background job worker and goal scheduler
  initWorker();
  initScheduler();

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Recommendations</s-link>
        <s-link href="/app/goals">Goals</s-link>
        <s-link href="/app/chat">Chat</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
// boundary.error() only handles Shopify ErrorResponse types and re-throws everything else,
// so we catch non-Response errors here to prevent cascading crashes.
export function ErrorBoundary() {
  const error = useRouteError();

  // Let Shopify's boundary handle its own error responses (auth redirects, etc.)
  if (
    isRouteErrorResponse(error) ||
    (error && typeof error === "object" && "constructor" in error &&
      (error.constructor.name === "ErrorResponse" ||
        error.constructor.name === "ErrorResponseImpl"))
  ) {
    return boundary.error(error);
  }

  // For all other errors, render a user-friendly fallback instead of re-throwing
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: 32,
        textAlign: "center",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 14, color: "#616161", marginBottom: 16 }}>
        {message}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "8px 20px",
          background: "#303030",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reload page
      </button>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
