import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchContext, type ExaContextResult } from "./exa-context.js";

describe("exa-context", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when apiKey is null", async () => {
    await expect(searchContext("test", { apiKey: null })).rejects.toThrow("EXA_API_KEY");
  });

  it("sends correct request to Exa Context API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: "some markdown content" }),
    });

    await searchContext("react hooks", { apiKey: "test-key" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.exa.ai/context");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("test-key");

    const body = JSON.parse(init.body);
    expect(body.query).toBe("react hooks");
    expect(body.tokensNum).toBe("dynamic");
  });

  it("sends numeric tokensNum when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: "content" }),
    });

    await searchContext("test", { apiKey: "key", tokensNum: 3000 });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tokensNum).toBe(3000);
  });

  it("returns markdown content from response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: "## Example\n\n```ts\nconst x = 1;\n```\n\nSource: https://github.com/example",
      }),
    });

    const result = await searchContext("test", { apiKey: "key" });
    expect(result.content).toContain("## Example");
    expect(result.content).toContain("const x = 1");
    expect(result.query).toBe("test");
  });

  it("handles API errors with status code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad request",
    });

    await expect(searchContext("test", { apiKey: "key" })).rejects.toThrow("400");
  });

  it("wraps network errors with query context", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ENOTFOUND"));

    await expect(searchContext("my code query", { apiKey: "key" }))
      .rejects.toThrow(/Context request failed.*my code query/i);
  });
});
