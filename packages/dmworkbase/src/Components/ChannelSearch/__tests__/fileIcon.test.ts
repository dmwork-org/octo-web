import { describe, expect, it } from "vitest";
import { channelSearchFileIconTestUtils } from "../fileIcon";

const { fileNameForIconLookup } = channelSearchFileIconTestUtils;

describe("channel search file icon lookup name", () => {
  it("keeps the original name when no backend extension is provided", () => {
    expect(fileNameForIconLookup("report.final")).toBe("report.final");
  });

  it("keeps the original name when it already ends with the backend extension", () => {
    expect(fileNameForIconLookup("report.pdf", "pdf")).toBe("report.pdf");
    expect(fileNameForIconLookup("REPORT.PDF", "pdf")).toBe("REPORT.PDF");
  });

  it("appends a cleaned backend extension when the name has no extension", () => {
    expect(fileNameForIconLookup("report", " .pdf ")).toBe("report.pdf");
  });

  it("prefers backend extension when a dotted name segment is not the file type", () => {
    expect(fileNameForIconLookup("report.final", "pdf")).toBe(
      "report.final.pdf"
    );
  });

  it("prefers backend extension when the visible name conflicts with it", () => {
    expect(fileNameForIconLookup("report.doc", "pdf")).toBe("report.doc.pdf");
  });
});
