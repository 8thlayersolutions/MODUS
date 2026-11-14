import { describe, it, expect } from "vitest";
import { mayReviewApplication } from "./application-reviewers";

const staff = { reviewerUserIds: ["staff-owner"], reviewerRoleIds: ["staff-leads"] };
const twitch = { reviewerUserIds: ["twitch-owner"], reviewerRoleIds: ["stream-leads"] };
describe("per-form application moderation", () => {
  it("allows an explicitly assigned user only for their form", () => {
    const actor = { userId: "staff-owner", roleIds: [], isGuildManager: false };
    expect(mayReviewApplication(staff, actor)).toBe(true);
    expect(mayReviewApplication(twitch, actor)).toBe(false);
  });
  it("allows matching roles but not unrelated roles", () => {
    const actor = { userId: "mod", roleIds: ["stream-leads"], isGuildManager: false };
    expect(mayReviewApplication(twitch, actor)).toBe(true);
    expect(mayReviewApplication(staff, actor)).toBe(false);
  });
  it("allows managers to review any form", () => {
    expect(mayReviewApplication(staff, { userId: "owner", roleIds: [], isGuildManager: true })).toBe(true);
  });
  it("defaults to managers only", () => {
    expect(mayReviewApplication({ reviewerUserIds: [], reviewerRoleIds: [] },
      { userId: "mod", roleIds: ["any"], isGuildManager: false })).toBe(false);
  });
});
