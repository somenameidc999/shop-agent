import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { mcpManager } from "../mcp/mcpManager.server";
import { ensureShopInfo } from "../services/shop.server";

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

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/chat">Chat</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
