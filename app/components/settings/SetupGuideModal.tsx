import { useEffect, useCallback } from "react";

interface SetupGuideModalProps {
  serverType: string;
  label: string;
  open: boolean;
  onClose: () => void;
}

interface GuideStep {
  title: string;
  detail: string;
}

interface Guide {
  intro: string;
  steps: GuideStep[];
  tip?: string;
}

const GUIDES: Record<string, Guide> = {
  postgres: {
    intro:
      "You need a PostgreSQL connection string in the format postgresql://user:pass@host:5432/dbname.",
    steps: [
      {
        title: "Find your connection string",
        detail:
          "Check your hosting provider's dashboard. Common locations:\n• Supabase — Settings → Database → Connection string (URI)\n• Railway — Variables tab → DATABASE_URL\n• AWS RDS — Connectivity & security → Endpoint + port\n• Render — Dashboard → Database → External Database URL\n• Local — postgresql://postgres:password@localhost:5432/mydb",
      },
      {
        title: "Copy the full URI",
        detail:
          "It should look like: postgresql://username:password@hostname:5432/database_name. Make sure to include the password.",
      },
      {
        title: "Paste it into the Connection String field and save",
        detail:
          "The agent will connect and be able to query your database. It has read-only access by default — use a read-only database user for extra safety.",
      },
    ],
    tip: "For production databases, create a read-only user: CREATE ROLE agent LOGIN PASSWORD 'xxx'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent;",
  },
  mysql: {
    intro:
      "You need a MySQL connection string in the format mysql://user:pass@host:3306/dbname.",
    steps: [
      {
        title: "Find your connection string",
        detail:
          "Check your hosting provider's dashboard:\n• PlanetScale — Overview → Connect → Connection string\n• AWS RDS — Connectivity & security → Endpoint + port\n• DigitalOcean — Databases → Connection details\n• Local — mysql://root:password@localhost:3306/mydb",
      },
      {
        title: "Copy the full URI",
        detail:
          "It should look like: mysql://username:password@hostname:3306/database_name",
      },
      {
        title: "Paste it into the Connection String field and save",
        detail:
          "For security, consider using a read-only database user.",
      },
    ],
  },
  google: {
    intro:
      "Google Sheets, Drive, and Docs all use a single Google Cloud service account for authentication.",
    steps: [
      {
        title: "Go to the Google Cloud Console",
        detail:
          "Visit console.cloud.google.com and select or create a project.",
      },
      {
        title: "Enable the required APIs",
        detail:
          'Go to APIs & Services → Library and enable:\n• Google Sheets API\n• Google Drive API\n• Google Docs API\n\nSearch for each name and click "Enable".',
      },
      {
        title: "Create a service account",
        detail:
          'Go to APIs & Services → Credentials → Create Credentials → Service Account. Give it a name like "data-agent". No roles are needed at this step.',
      },
      {
        title: "Generate a JSON key",
        detail:
          "Click into the new service account → Keys tab → Add Key → Create new key → JSON. A .json file will download.",
      },
      {
        title: "Paste the JSON contents",
        detail:
          'Open the downloaded .json file in a text editor, select all (Cmd+A / Ctrl+A), copy, and paste the entire contents into the "Service Account JSON" field.',
      },
      {
        title: "Share files with the service account",
        detail:
          'The service account has an email like project-name@project-id.iam.gserviceaccount.com. Share your Google Sheets, Docs, or Drive folders with this email address (use the "Share" button in Google) to grant access.',
      },
    ],
    tip: "The service account can only access files explicitly shared with it. Share a top-level Drive folder to grant access to everything inside.",
  },
  airtable: {
    intro:
      "You need a Personal Access Token and Base ID from your Airtable account.",
    steps: [
      {
        title: "Generate a Personal Access Token",
        detail:
          "Go to airtable.com/create/tokens → Create new token. Give it a name, then add scopes:\n• data.records:read\n• data.records:write\n• schema.bases:read\n\nUnder Access, select the specific base you want to connect.",
      },
      {
        title: "Copy the token",
        detail:
          'The token starts with "pat...". Copy it and paste it into the API Key field.',
      },
      {
        title: "Find your Base ID",
        detail:
          'Open your Airtable base in the browser. The URL will look like: airtable.com/appXXXXXXXXXXXXXX/... The part starting with "app" is your Base ID.',
      },
      {
        title: "Paste the Base ID and save",
        detail:
          "Paste the Base ID (e.g., appABC123def456) into the Base ID field.",
      },
    ],
    tip: 'You can also find your Base ID at airtable.com/developers/web/api/introduction — select your base and the ID is shown in the "Introduction" section.',
  },
  email: {
    intro:
      "Connect via IMAP (reading) and SMTP (sending). Most providers require an app-specific password rather than your account password.",
    steps: [
      {
        title: "Get an app password (Gmail)",
        detail:
          "Go to myaccount.google.com → Security → 2-Step Verification (must be enabled) → App passwords. Generate one for \"Mail\" and copy the 16-character password.",
      },
      {
        title: "Get an app password (Outlook / Microsoft 365)",
        detail:
          "Go to account.microsoft.com → Security → Advanced security options → App passwords → Create a new app password.",
      },
      {
        title: "Enter your email and app password",
        detail:
          "Paste your full email address and the app password (not your regular login password).",
      },
      {
        title: "Set the IMAP and SMTP hosts",
        detail:
          "Common settings:\n• Gmail — IMAP: imap.gmail.com / SMTP: smtp.gmail.com\n• Outlook — IMAP: outlook.office365.com / SMTP: smtp.office365.com\n• Yahoo — IMAP: imap.mail.yahoo.com / SMTP: smtp.mail.yahoo.com",
      },
      {
        title: "Ports (usually default is fine)",
        detail:
          "Standard ports: IMAP = 993 (SSL), SMTP = 465 (SSL) or 587 (TLS). The defaults should work for most providers.",
      },
    ],
    tip: "Never use your main account password — always generate an app-specific password for third-party access.",
  },
  ftp: {
    intro:
      "Connect to an FTP or SFTP server to browse, upload, and download files.",
    steps: [
      {
        title: "Find your FTP/SFTP credentials",
        detail:
          "Check your hosting provider's dashboard:\n• cPanel — FTP Accounts section\n• Shopify (for theme files) — not available via FTP\n• AWS — Use SFTP via AWS Transfer Family\n• Most web hosts — Look in the hosting control panel under FTP/SFTP",
      },
      {
        title: "Enter the host",
        detail:
          "Usually something like ftp.yourdomain.com or sftp.yourdomain.com. For SFTP, use the SSH hostname.",
      },
      {
        title: "Set the port",
        detail:
          "FTP typically uses port 21, SFTP uses port 22. The default is 22 (SFTP).",
      },
      {
        title: "Enter username and password",
        detail:
          "Use the FTP/SFTP username and password from your hosting provider. For SFTP with SSH keys, use key-based auth if supported.",
      },
    ],
  },
  "custom-api": {
    intro:
      "Connect to any REST API by providing a base URL and optional API key.",
    steps: [
      {
        title: "Find the API base URL",
        detail:
          'Check the API documentation for the service you want to connect. The base URL is the root of all endpoints, e.g., https://api.example.com/v1. Do not include a trailing slash.',
      },
      {
        title: "Get an API key (if required)",
        detail:
          "Most APIs require authentication. Check the provider's developer portal or settings page for an API key, access token, or bearer token.",
      },
      {
        title: "Paste and save",
        detail:
          'Enter the base URL and API key. The agent will send the API key as a Bearer token in the Authorization header.',
      },
    ],
    tip: "If the API uses a different auth scheme (e.g., query parameter or custom header), you may need to customize the Custom API server configuration.",
  },
};

export function SetupGuideModal({
  serverType,
  label,
  open,
  onClose,
}: SetupGuideModalProps) {
  const guide = GUIDES[serverType];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open || !guide) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
        }}
      />

      {/* dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Setup guide for ${label}`}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 560,
          maxHeight: "85vh",
          margin: 16,
          background: "var(--s-color-bg-surface, #fff)",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--s-color-border-secondary, #e3e3e3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              How to connect {label}
            </span>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              fontSize: 18,
              color: "#666",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#f3f3f3")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          <p
            style={{
              margin: "0 0 16px",
              fontSize: 13,
              lineHeight: 1.5,
              color: "#444",
            }}
          >
            {guide.intro}
          </p>

          <ol style={{ margin: 0, padding: "0 0 0 20px", listStyleType: "none", counterReset: "step" }}>
            {guide.steps.map((step, i) => (
              <li
                key={i}
                style={{
                  marginBottom: i < guide.steps.length - 1 ? 16 : 0,
                  counterIncrement: "step",
                  position: "relative",
                  paddingLeft: 36,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "#008060",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "#555",
                    whiteSpace: "pre-line",
                  }}
                >
                  {step.detail}
                </div>
              </li>
            ))}
          </ol>

          {guide.tip && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                fontSize: 12,
                lineHeight: 1.5,
                color: "#166534",
              }}
            >
              <strong>Tip: </strong>
              <span style={{ fontFamily: "monospace", fontSize: 11 }}>
                {guide.tip}
              </span>
            </div>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--s-color-border-secondary, #e3e3e3)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            type="button"
            style={{
              padding: "8px 20px",
              background: "#f6f6f7",
              color: "#333",
              border: "1px solid #ccc",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
