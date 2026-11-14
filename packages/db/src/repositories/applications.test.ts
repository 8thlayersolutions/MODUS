import { describe, expect, it } from "vitest";
import { ApplicationError, validateAnswers, validateQuestions } from "./applications";
const questions = [
  { id: "name", label: "Name", type: "short", required: true },
  { id: "why", label: "Why?", type: "paragraph", required: false },
  { id: "role", label: "Role", type: "select", required: true, options: ["Staff", "Builder"] },
];
describe("applications validation", () => {
  it("accepts valid answers", () => {
    const parsed = validateQuestions(questions);
    expect(validateAnswers(parsed, { name: "Alex", why: "", role: "Staff" }))
      .toEqual({ name: "Alex", why: "", role: "Staff" });
  });
  it("rejects duplicate questions", () => {
    expect(() => validateQuestions([questions[0], questions[0]])).toThrow(ApplicationError);
  });
  it("rejects invalid choices", () => {
    expect(() => validateQuestions([{ ...questions[2], options: ["Same", "Same"] }])).toThrow(ApplicationError);
    expect(() => validateAnswers(validateQuestions(questions), { name: "Alex", role: "Owner" })).toThrow(ApplicationError);
  });
  it("rejects unknown fields and missing required answers", () => {
    expect(() => validateAnswers(validateQuestions(questions), { name: "", role: "Staff" })).toThrow(ApplicationError);
    expect(() => validateAnswers(validateQuestions(questions), { name: "Alex", role: "Staff", extra: "yes" })).toThrow(ApplicationError);
  });
});
