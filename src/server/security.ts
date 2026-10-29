import dns from "node:dns/promises";
import net from "node:net";
export function validateUrl(raw: string, origins: string[]) {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !origins.includes(url.origin)
  )
    throw new Error("Navigation blocked: origin is not configured.");
  if (url.pathname.startsWith("/__"))
    throw new Error("Internal control endpoints are blocked.");
  return url;
}
export function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  return (
    address === "::1" ||
    address === "::" ||
    /^(fc|fd|fe[89ab])/i.test(address) ||
    address.includes(":ffff:")
  );
}
export async function validateNetwork(raw: string, origins: string[]) {
  const url = validateUrl(raw, origins);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return url;
  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address)))
    throw new Error(
      "Navigation blocked: private or metadata network destination.",
    );
  return url;
}
