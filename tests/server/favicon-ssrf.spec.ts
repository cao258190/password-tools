import { Buffer } from "node:buffer";
import { lookup } from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveFavicons } from "../../src/server/services/favicon";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn()
}));

type LookupAddress = { address: string; family: 4 | 6 };
type LookupMock = (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>;

const lookupMock = vi.mocked(lookup as unknown as LookupMock);
const publicAddress: LookupAddress = { address: "93.184.216.34", family: 4 };

function addresses(...items: LookupAddress[]) {
  return items;
}

describe("favicon SSRF protections", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    lookupMock.mockReset();
  });

  it.each([
    ["loopback", addresses({ address: "127.0.0.1", family: 4 })],
    ["private", addresses({ address: "10.0.0.8", family: 4 })],
    ["link-local metadata", addresses({ address: "169.254.169.254", family: 4 })],
    ["multicast", addresses({ address: "224.0.0.1", family: 4 })],
    ["IPv6 unique-local", addresses({ address: "fd00:ec2::254", family: 6 })],
    ["IPv6 link-local", addresses({ address: "fe80::1", family: 6 })],
    ["IPv6 multicast", addresses({ address: "ff02::1", family: 6 })],
    ["mixed public and private", addresses(publicAddress, { address: "192.168.1.20", family: 4 })]
  ])("blocks hostnames resolving to %s addresses before fetching", async (_label, resolvedAddresses) => {
    lookupMock.mockResolvedValue(resolvedAddresses);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch should not be called"));

    await expect(resolveFavicons("https://blocked.example")).rejects.toMatchObject({ status: 400 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookupMock).toHaveBeenCalledWith("blocked.example", { all: true, verbatim: true });
  });

  it("blocks redirect targets that resolve to metadata addresses", async () => {
    lookupMock.mockImplementation(async (hostname) => {
      if (hostname === "example.com") return addresses(publicAddress);
      if (hostname === "metadata.example") return addresses({ address: "169.254.169.254", family: 4 });
      throw new Error(`Unexpected DNS lookup: ${hostname}`);
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return new Response("", {
          status: 302,
          headers: { location: "https://metadata.example/latest/meta-data" }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await expect(resolveFavicons("https://example.com")).rejects.toMatchObject({ status: 400 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lookupMock).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    expect(lookupMock).toHaveBeenCalledWith("metadata.example", { all: true, verbatim: true });
  });

  it("keeps resolving favicons from public hosts", async () => {
    const iconBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    lookupMock.mockResolvedValue(addresses(publicAddress));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return new Response('<html><head><link rel="icon" href="/assets/icon.png"></head></html>', {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      }
      if (url === "https://example.com/assets/icon.png") {
        return new Response(iconBytes, {
          status: 200,
          headers: { "content-type": "image/png" }
        });
      }
      if (url === "https://example.com/favicon.ico") {
        return new Response("", { status: 404 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const icons = await resolveFavicons("https://example.com");
    const iconUrl = `data:image/png;base64,${Buffer.from(iconBytes).toString("base64")}`;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lookupMock).toHaveBeenCalledTimes(3);
    expect(icons).toEqual([
      {
        iconUrl,
        sourceUrl: "https://example.com/assets/icon.png",
        contentType: "image/png"
      }
    ]);
  });
});
