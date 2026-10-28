import { describe, expect, it } from "vitest";
import { serializeResponseForLog } from "../src/app";

describe("HTTP response logging", () => {
  it("does not include response headers such as refresh cookies", () => {
    const response = {
      statusCode: 200,
      headers: { "set-cookie": "refresh_token=sensitive-value" },
    };

    expect(serializeResponseForLog(response)).toEqual({ statusCode: 200 });
  });
});
