import { describe, expect, it } from "vitest";
import { sanitizeCertificateFileName } from "@/lib/certificate-file-name";

describe("sanitizeCertificateFileName", () => {
  it("removes path separators, control characters and header quotes", () => {
    expect(sanitizeCertificateFileName('../cliente/"certificado".pfx\r\nX-Test: bad'))
      .toBe(".._cliente__certificado_.pfx__X-Test: bad");
  });

  it("normalizes Unicode and limits the resulting name length", () => {
    expect(sanitizeCertificateFileName("  certificado  .pfx ")).toBe("certificado .pfx");
    expect(sanitizeCertificateFileName("ｃｅｒｔｉｆｉｃａｄｏ.pfx")).toBe("certificado.pfx");
    expect(sanitizeCertificateFileName("a".repeat(200))).toHaveLength(160);
  });

  it("uses a safe fallback for an empty name", () => {
    expect(sanitizeCertificateFileName("")).toBe("certificado.pfx");
  });
});
