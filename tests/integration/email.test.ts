/**
 * Email (IMAP/SMTP) integration tests
 *
 * Verifies the IMAP server is reachable and that credentials work,
 * mirroring the tools exposed by the @codefuturist/email-mcp package
 * (list_mailboxes, list_emails, search_emails, send_email).
 *
 * Add these to .env to run:
 *   EMAIL_ADDRESS=you@example.com
 *   EMAIL_PASSWORD=app-specific-password
 *   EMAIL_IMAP_HOST=imap.gmail.com
 *   EMAIL_SMTP_HOST=smtp.gmail.com
 */

import { ImapFlow } from "imapflow";
import { loadEnv } from "../helpers/env.js";

loadEnv();

const EMAIL_ADDRESS = process.env.EMAIL_ADDRESS ?? "";
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD ?? "";
const IMAP_HOST = process.env.EMAIL_IMAP_HOST ?? "";
const IMAP_PORT = parseInt(process.env.EMAIL_IMAP_PORT ?? "993", 10);

const configured = !!(EMAIL_ADDRESS && EMAIL_PASSWORD && IMAP_HOST);

describe("Email (IMAP)", () => {
  let client: ImapFlow;

  beforeAll(async () => {
    if (!configured) {
      console.log("  Email credentials not set in .env — tests will be skipped");
      return;
    }

    client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: true,
      auth: { user: EMAIL_ADDRESS, pass: EMAIL_PASSWORD },
      logger: false,
    });
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.logout().catch(() => {});
    }
  });

  it("has email credentials configured", () => {
    if (!configured) {
      console.log("  ⏭ skipped (not configured)");
      return;
    }
    expect(EMAIL_ADDRESS).toBeTruthy();
    expect(IMAP_HOST).toBeTruthy();
  });

  it("connects to the IMAP server", async () => {
    if (!configured) return;
    expect(client.usable).toBe(true);
    console.log(`  Connected to ${IMAP_HOST}:${IMAP_PORT} as ${EMAIL_ADDRESS}`);
  });

  it("lists mailboxes (list_mailboxes tool)", async () => {
    if (!configured) return;
    const mailboxes = await client.list();
    expect(Array.isArray(mailboxes)).toBe(true);
    expect(mailboxes.length).toBeGreaterThan(0);

    const names = mailboxes.map((m) => m.path);
    console.log(`  Mailboxes: ${names.join(", ")}`);
    expect(names.some((n) => n.toUpperCase() === "INBOX")).toBe(true);
  });

  it("opens INBOX and reads message count (list_emails tool)", async () => {
    if (!configured) return;
    const lock = await client.getMailboxLock("INBOX");
    try {
      const { exists } = client.mailbox!;
      expect(typeof exists).toBe("number");
      console.log(`  INBOX has ${exists} message(s)`);
    } finally {
      lock.release();
    }
  });

  it("fetches headers from recent messages (get_email tool)", async () => {
    if (!configured) return;
    const lock = await client.getMailboxLock("INBOX");
    try {
      const { exists } = client.mailbox!;
      if (!exists || exists === 0) {
        console.log("  INBOX is empty — skipping header fetch");
        return;
      }

      const start = Math.max(1, (exists as number) - 2);
      const range = `${start}:*`;
      const messages: Array<{ subject: string; from: string }> = [];

      for await (const msg of client.fetch(range, { envelope: true })) {
        messages.push({
          subject: msg.envelope.subject ?? "(no subject)",
          from: msg.envelope.from?.[0]?.address ?? "unknown",
        });
      }

      expect(messages.length).toBeGreaterThan(0);
      console.log(`  Fetched ${messages.length} message header(s)`);
      for (const m of messages.slice(0, 3)) {
        console.log(`    From: ${m.from} — Subject: ${m.subject}`);
      }
    } finally {
      lock.release();
    }
  });

  it("searches for messages (search_emails tool)", async () => {
    if (!configured) return;
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ all: true }, { uid: true });
      expect(Array.isArray(uids)).toBe(true);
      console.log(`  Search returned ${uids.length} UID(s)`);
    } finally {
      lock.release();
    }
  });

  it("checks mailbox status", async () => {
    if (!configured) return;
    const status = await client.status("INBOX", {
      messages: true,
      unseen: true,
      recent: true,
    });
    expect(typeof status.messages).toBe("number");
    console.log(`  INBOX status — messages: ${status.messages}, unseen: ${status.unseen}, recent: ${status.recent}`);
  });
});
