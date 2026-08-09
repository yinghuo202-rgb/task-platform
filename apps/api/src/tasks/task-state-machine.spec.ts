import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./task-state-machine";

describe("task state machine", () => {
  it("allows the core happy path", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransition("PUBLISHED", "CLAIMED")).toBe(true);
    expect(canTransition("CLAIMED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "COMPLETED")).toBe(true);
  });

  it("rejects arbitrary status changes", () => {
    expect(() => assertTransition("DRAFT", "COMPLETED")).toThrow();
    expect(() => assertTransition("COMPLETED", "PUBLISHED")).toThrow();
  });
});
