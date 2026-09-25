import { describe, expect, test } from "bun:test";
import { checkPublicUrl } from "../src/web/ssrf-guard.js";

describe("checkPublicUrl", () => {
  test("rejects non-http(s) schemes", async () => {
    expect((await checkPublicUrl("file:///etc/passwd")).ok).toBe(false);
    expect((await checkPublicUrl("ftp://example.com")).ok).toBe(false);
  });

  test("rejects malformed URLs", async () => {
    expect((await checkPublicUrl("not a url")).ok).toBe(false);
  });

  test("rejects localhost by name", async () => {
    expect((await checkPublicUrl("http://localhost:8787/health")).ok).toBe(false);
  });

  test("rejects loopback, private and link-local literal IPs", async () => {
    for (const host of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0"]) {
      expect((await checkPublicUrl(`http://${host}/`)).ok, host).toBe(false);
    }
  });

  test("rejects literal IPv6 loopback and unique-local", async () => {
    expect((await checkPublicUrl("http://[::1]/")).ok).toBe(false);
    expect((await checkPublicUrl("http://[fd00::1]/")).ok).toBe(false);
  });

  test("accepts a normal public https URL", async () => {
    const result = await checkPublicUrl("https://example.com/");
    expect(result.ok).toBe(true);
  });
});
