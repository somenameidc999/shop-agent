import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "react-router";

const markdownStyles = `
  .markdown-content { line-height: 1.6; }
  .markdown-content p { margin: 0 0 0.75em; }
  .markdown-content p:last-child { margin-bottom: 0; }
  .markdown-content h1, .markdown-content h2, .markdown-content h3,
  .markdown-content h4, .markdown-content h5, .markdown-content h6 {
    font-weight: 600; margin: 1em 0 0.5em;
  }
  .markdown-content h1 { font-size: 1.4em; }
  .markdown-content h2 { font-size: 1.2em; }
  .markdown-content h3 { font-size: 1.1em; }
  .markdown-content ul, .markdown-content ol {
    margin: 0.5em 0; padding-left: 1.5em;
  }
  .markdown-content li { margin: 0.25em 0; }
  .markdown-content code {
    background: rgba(0,0,0,0.08); border-radius: 3px;
    padding: 0.1em 0.35em; font-size: 0.875em; font-family: monospace;
  }
  .markdown-content pre {
    background: rgba(0,0,0,0.08); border-radius: 6px;
    padding: 0.75em 1em; overflow-x: auto; margin: 0.75em 0;
  }
  .markdown-content pre code {
    background: none; padding: 0; font-size: 0.85em;
  }
  .markdown-content blockquote {
    border-left: 3px solid rgba(0,0,0,0.2); margin: 0.75em 0;
    padding-left: 1em; color: rgba(0,0,0,0.6);
  }
  .markdown-content table {
    border-collapse: collapse; width: 100%; margin: 0.75em 0;
  }
  .markdown-content th, .markdown-content td {
    border: 1px solid rgba(0,0,0,0.15); padding: 0.4em 0.75em; text-align: left;
  }
  .markdown-content th { font-weight: 600; background: rgba(0,0,0,0.05); }
  .markdown-content a { color: #0066cc; text-decoration: underline; }
  .markdown-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.15); margin: 1em 0; }
  .markdown-content strong { font-weight: 600; }
  .markdown-content em { font-style: italic; }

  /* Prevent long URLs / unbreakable strings from overflowing user message bubbles */
  .chat-message-bubble { display: contents; }
  .chat-message-text { overflow-wrap: break-word; word-break: break-word; min-width: 0; }
`;

function Document({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {/* eslint-disable-next-line react/no-danger */}
        <style dangerouslySetInnerHTML={{ __html: markdownStyles }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";

  return (
    <Document>
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
    </Document>
  );
}
