/**
 * Encryption utility unit tests
 *
 * Verifies the AES-256-GCM encrypt/decrypt round-trip used to protect
 * MCP server credentials in the database.
 */

import { randomBytes } from "crypto";

const TEST_KEY = randomBytes(32).toString("hex");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

describe("Encryption", () => {
  let encrypt: (plaintext: string) => string;
  let decrypt: (ciphertext: string) => string;

  beforeAll(async () => {
    const mod = await import("../../app/utils/encryption.server.js");
    encrypt = mod.encrypt;
    decrypt = mod.decrypt;
  });

  it("round-trips a simple string", () => {
    const original = "hello world";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it("round-trips a JSON config object", () => {
    const config = JSON.stringify({
      connectionString: "postgresql://user:pass@host:5432/db",
      apiKey: "sk-test-123",
    });
    const encrypted = encrypt(config);
    expect(decrypt(encrypted)).toBe(config);
  });

  it("produces different ciphertext for the same input (random IV)", () => {
    const input = "deterministic?";
    const a = encrypt(input);
    const b = encrypt(input);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(input);
    expect(decrypt(b)).toBe(input);
  });

  it("ciphertext has the expected format (iv:tag:data)", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    expect(parts.length).toBe(3);
    expect(parts[0]!.length).toBe(24); // 12 bytes = 24 hex chars
    expect(parts[1]!.length).toBe(32); // 16-byte auth tag = 32 hex chars
    expect(parts[2]!.length).toBeGreaterThan(0);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret");
    const parts = encrypted.split(":");
    const tampered = `${parts[0]}:${parts[1]}:ff${parts[2]!.slice(2)}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on invalid format", () => {
    expect(() => decrypt("not-valid")).toThrow("Invalid ciphertext format");
    expect(() => decrypt("aa:bb")).toThrow("Invalid ciphertext format");
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode and special characters", () => {
    const special = "こんにちは 🌍 <script>alert('xss')</script>";
    const encrypted = encrypt(special);
    expect(decrypt(encrypted)).toBe(special);
  });
});
