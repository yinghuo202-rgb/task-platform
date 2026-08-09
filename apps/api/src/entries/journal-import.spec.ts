import { describe, expect, it } from "vitest";
import { parseJournalImportManifest } from "./journal-import";

const validManifest = {
  version: 1,
  entries: [{
    sourceId: "fragments:2026-03-29",
    file: "entries/fragments/2026-03-29.md",
    title: "2026-03-29",
    date: "2026-03-29",
    authorUsername: "Cristina",
    category: "手帐",
    tags: ["旧手帐"],
    comments: [{ authorUsername: "yinghuo202", content: "回应" }],
  }],
  assets: [{ file: `assets/${"a".repeat(64)}.png`, storageName: `${"a".repeat(64)}.png` }],
};

describe("journal import manifest", () => {
  it("accepts a structured entry with separately attributed comments", () => {
    expect(parseJournalImportManifest(JSON.stringify(validManifest))).toMatchObject({
      version: 1,
      entries: [{ authorUsername: "Cristina", comments: [{ authorUsername: "yinghuo202" }] }],
    });
  });

  it("rejects paths that can escape the import directory", () => {
    const manifest = structuredClone(validManifest);
    manifest.entries[0]!.file = "../private.md";
    expect(() => parseJournalImportManifest(JSON.stringify(manifest))).toThrow("路径不正确");
  });

  it("rejects duplicate source identifiers", () => {
    const manifest = structuredClone(validManifest);
    manifest.entries.push(structuredClone(manifest.entries[0]!));
    expect(() => parseJournalImportManifest(JSON.stringify(manifest))).toThrow("重复来源");
  });
});
