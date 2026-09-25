import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * The web version fetches whatever URL a visitor types in, server-side. Without this check that's
 * a textbook SSRF: someone points it at http://169.254.169.254/ (cloud metadata), an internal admin
 * panel, or localhost, and reads the response back through our report. This rejects private,
 * loopback and link-local targets before we ever call fetch.
 *
 * Known gap: we resolve once and then let `fetch` resolve again to actually connect (DNS rebinding
 * — the name could point somewhere else by the second lookup). Good enough for a same-process CLI
 * scan; if the web version gets real traffic, connect using the IP we already checked (a custom
 * `dns.lookup` on the agent/dispatcher) instead of re-resolving.
 */
export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === "::1") return true; // loopback
  if (norm.startsWith("fe80:") || norm.startsWith("fe8") || norm.startsWith("fe9") || norm.startsWith("fea") || norm.startsWith("feb")) return true; // fe80::/10 link-local
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // fc00::/7 unique local
  if (norm.startsWith("::ffff:")) return isPrivateIPv4(norm.slice(7)); // IPv4-mapped
  return false;
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP at all: treat as unsafe rather than guess
}

export async function checkPublicUrl(rawUrl: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed." };
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "That host isn't a public storefront." };
  }
  if (isIP(hostname) && isPrivateIp(hostname)) {
    return { ok: false, reason: "That address is private, not a public storefront." };
  }
  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) return { ok: false, reason: "Could not resolve that host." };
    if (addresses.some((a) => isPrivateIp(a.address))) {
      return { ok: false, reason: "That host resolves to a private address, not a public storefront." };
    }
  } catch {
    return { ok: false, reason: "Could not resolve that host." };
  }
  return { ok: true };
}
