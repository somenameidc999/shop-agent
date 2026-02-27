/**
 * FTP / SFTP integration tests
 *
 * Verifies the SFTP server is reachable and each tool operation the MCP
 * ftp server exposes (list, read, write, delete, mkdir) works end-to-end.
 *
 * FTP_PORT=22 in .env → this is an SSH/SFTP server; uses ssh2-sftp-client.
 */

import SftpClient from "ssh2-sftp-client";
import { loadEnv } from "../helpers/env.js";

loadEnv();

const { FTP_HOST, FTP_PORT, FTP_USER, FTP_PASS } = process.env;

const TEST_DIR = "/tmp/mcp-test";
const TEST_FILE = `${TEST_DIR}/hello.txt`;
const TEST_CONTENT = "hello from mcp test suite";

describe("FTP / SFTP", () => {
  let sftp: SftpClient;

  beforeAll(async () => {
    if (!FTP_HOST) throw new Error("FTP_HOST is not set in .env");

    sftp = new SftpClient();
    await sftp.connect({
      host: FTP_HOST,
      port: parseInt(FTP_PORT ?? "22", 10),
      username: FTP_USER,
      password: FTP_PASS,
    });
  });

  afterAll(async () => {
    // Clean up test artefacts then close
    try {
      await sftp.delete(TEST_FILE);
    } catch { /* already gone */ }
    try {
      await sftp.rmdir(TEST_DIR);
    } catch { /* already gone */ }
    await sftp?.end();
  });

  it("connects to the SFTP server (ftp_list /)", async () => {
    const list = await sftp.list("/");
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    console.log(`  Root entries: ${list.map((i) => i.name).join(", ")}`);
  });

  it("creates a directory (ftp_mkdir)", async () => {
    await sftp.mkdir(TEST_DIR, true);
    const exists = await sftp.exists(TEST_DIR);
    expect(exists).toBeTruthy();
  });

  it("writes a file (ftp_write)", async () => {
    const buf = Buffer.from(TEST_CONTENT, "utf-8");
    await sftp.put(buf, TEST_FILE);
    const exists = await sftp.exists(TEST_FILE);
    expect(exists).toBeTruthy();
  });

  it("reads the file back (ftp_read)", async () => {
    const result = await sftp.get(TEST_FILE);
    const text = result instanceof Buffer ? result.toString("utf-8") : String(result);
    expect(text).toBe(TEST_CONTENT);
  });

  it("lists the test directory (ftp_list subdir)", async () => {
    const list = await sftp.list(TEST_DIR);
    const names = list.map((i) => i.name);
    expect(names).toContain("hello.txt");
  });

  it("deletes the file (ftp_delete)", async () => {
    await sftp.delete(TEST_FILE);
    const exists = await sftp.exists(TEST_FILE);
    expect(exists).toBe(false);
  });

  it("exists() returns 'd' for a directory and falsy for a missing path", async () => {
    const dirType = await sftp.exists("/");
    expect(dirType).toBe("d");

    const missing = await sftp.exists("/nonexistent-mcp-test-path");
    expect(missing).toBeFalsy();
  });
});
