/** Shared applications persistence for Discord and web. All writes are guild-scoped. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { requireReturningRow } from "../client";
import {
  applicationForms, applicationSubmissions, applicationAudit,
  type ApplicationQuestion, type ApplicationFormRow, type ApplicationSubmissionRow,
} from "../schema";

export type ApplicationSource = "discord" | "web";
export type ApplicationStatus = "pending" | "in_review" | "approved" | "denied";

export class ApplicationError extends Error {
  constructor(message: string) { super(message); this.name = "ApplicationError"; }
}

export function validateQuestions(value: unknown): ApplicationQuestion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new ApplicationError("Forms must have 1–20 questions.");
  }
  const ids = new Set<string>();
  return value.map((v: any) => {
    if (!v || typeof v !== "object" || typeof v.id !== "string" ||
        !/^[a-z0-9_-]{1,32}$/i.test(v.id) || ids.has(v.id) ||
        typeof v.label !== "string" || !v.label.trim() || v.label.length > 100 ||
        !["short", "paragraph", "select"].includes(v.type) ||
        typeof v.required !== "boolean") {
      throw new ApplicationError("Invalid question definition or duplicate question ID.");
    }
    ids.add(v.id);
    if (v.type === "select" && (!Array.isArray(v.options) || v.options.length < 2 ||
        v.options.length > 20 || v.options.some((x: unknown) => typeof x !== "string" || !x.trim() || x.length > 100))) {
      throw new ApplicationError("Select questions require 2–20 short options.");
    }
    if (v.type === "select" && new Set(v.options).size < 2) { throw new ApplicationError("Select questions need two distinct options."); }
    return { id: v.id, label: v.label.trim(), type: v.type, required: v.required,
      ...(v.type === "select" ? { options: [...new Set(v.options)] } : {}) } as ApplicationQuestion;
  });
}

export function validateAnswers(questions: ApplicationQuestion[], raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApplicationError("Answers must be an object.");
  }
  const incoming = raw as Record<string, unknown>;
  if (Object.keys(incoming).some(key => !questions.some(q => q.id === key))) {
    throw new ApplicationError("Answers contain an unknown question.");
  }
  const result: Record<string, string> = {};
  for (const q of questions) {
    const value = incoming[q.id] ?? "";
    if (typeof value !== "string") throw new ApplicationError("All answers must be text.");
    const answer = value.trim();
    if (q.required && !answer) throw new ApplicationError(`Please answer: ${q.label}`);
    if (answer.length > (q.type === "short" ? 1000 : 4000)) {
      throw new ApplicationError(`Answer is too long: ${q.label}`);
    }
    if (q.type === "select" && answer && !q.options?.includes(answer)) {
      throw new ApplicationError(`Choose a listed option for: ${q.label}`);
    }
    result[q.id] = answer;
  }
  return result;
}

export class ApplicationRepository {
  constructor(private db: Database) {}

  async listForms(guildId: string): Promise<ApplicationFormRow[]> {
    return this.db.select().from(applicationForms)
      .where(eq(applicationForms.guildId, guildId))
      .orderBy(desc(applicationForms.createdAt)).limit(100);
  }

  async getForm(guildId: string, id: string): Promise<ApplicationFormRow | null> {
    const [row] = await this.db.select().from(applicationForms)
      .where(and(eq(applicationForms.guildId, guildId), eq(applicationForms.id, id))).limit(1);
    return row ?? null;
  }

  async createForm(input: {
    guildId: string; title: string; description: string; questions: ApplicationQuestion[];
    open: boolean; approvalRoleId: string | null; cooldownDays: number;
  }): Promise<ApplicationFormRow> {
    const [row] = await this.db.insert(applicationForms).values(input).returning();
    return requireReturningRow(row, "application form insert");
  }

  async updateForm(guildId: string, id: string, input: {
    title: string; description: string; questions: ApplicationQuestion[];
    open: boolean; approvalRoleId: string | null; cooldownDays: number;
  }): Promise<ApplicationFormRow | null> {
    const [row] = await this.db.update(applicationForms).set({
      ...input, version: sql`${applicationForms.version} + 1`, updatedAt: new Date(),
    }).where(and(eq(applicationForms.guildId, guildId), eq(applicationForms.id, id))).returning();
    return row ?? null;
  }

  async setPanel(guildId: string, formId: string, channelId: string, messageId: string) {
    const [row] = await this.db.update(applicationForms).set({
      panelChannelId: channelId, panelMessageId: messageId, updatedAt: new Date(),
    }).where(and(eq(applicationForms.guildId, guildId), eq(applicationForms.id, formId))).returning();
    return row ?? null;
  }

  async submit(input: { guildId: string; formId: string; applicantId: string;
    answers: unknown; source: ApplicationSource }): Promise<ApplicationSubmissionRow> {
    return this.db.transaction(async tx => {
      // Serialize concurrent Discord/web submits for this applicant and form.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.guildId + ":" + input.formId + ":" + input.applicantId}))`);
      const [form] = await tx.select().from(applicationForms).where(and(
        eq(applicationForms.guildId, input.guildId), eq(applicationForms.id, input.formId))).limit(1);
      if (!form || !form.open) throw new ApplicationError("This application is closed.");
      const answers = validateAnswers(form.questions, input.answers);
      const [latest] = await tx.select().from(applicationSubmissions).where(and(
        eq(applicationSubmissions.guildId, input.guildId),
        eq(applicationSubmissions.formId, form.id),
        eq(applicationSubmissions.applicantId, input.applicantId),
      )).orderBy(desc(applicationSubmissions.createdAt)).limit(1);
      if (latest && ["pending", "in_review", "approved"].includes(latest.status)) {
        throw new ApplicationError(latest.status === "approved" ? "Your application was already approved." : "You already have an application awaiting a decision.");
      }
      if (latest?.status === "denied" && Date.now() - (latest.reviewedAt ?? latest.createdAt).getTime() <
          form.cooldownDays * 86_400_000) {
        throw new ApplicationError(`Please wait ${form.cooldownDays} day(s) after a denial before reapplying.`);
      }
      const [row] = await tx.insert(applicationSubmissions).values({
        guildId: input.guildId, formId: form.id, applicantId: input.applicantId,
        answers, questionsSnapshot: form.questions, formVersion: form.version,
        source: input.source,
      }).returning();
      const submission = requireReturningRow(row, "application submission insert");
      await tx.insert(applicationAudit).values({
        guildId: input.guildId, submissionId: submission.id,
        actorId: input.applicantId, action: "submitted", details: { source: input.source },
      });
      return submission;
    });
  }

  async listSubmissions(guildId: string, status?: ApplicationStatus): Promise<ApplicationSubmissionRow[]> {
    return this.db.select().from(applicationSubmissions)
      .where(and(eq(applicationSubmissions.guildId, guildId),
        ...(status ? [eq(applicationSubmissions.status, status)] : [])))
      .orderBy(desc(applicationSubmissions.createdAt)).limit(100);
  }

  async listMine(guildId: string, applicantId: string): Promise<ApplicationSubmissionRow[]> {
    return this.db.select().from(applicationSubmissions)
      .where(and(eq(applicationSubmissions.guildId, guildId),
        eq(applicationSubmissions.applicantId, applicantId)))
      .orderBy(desc(applicationSubmissions.createdAt)).limit(30);
  }

  async review(input: { guildId: string; id: string; actorId: string;
    status: "in_review" | "approved" | "denied"; reason: string | null }): Promise<{
      submission: ApplicationSubmissionRow; form: ApplicationFormRow;
    } | null> {
    return this.db.transaction(async tx => {
      const [updated] = await tx.update(applicationSubmissions).set({
        status: input.status, reason: input.reason, reviewedBy: input.actorId,
        reviewedAt: new Date(),
      }).where(and(
        eq(applicationSubmissions.id, input.id),
        eq(applicationSubmissions.guildId, input.guildId),
        inArray(applicationSubmissions.status, ["pending", "in_review"]),
        // Only one final decision is permitted; re-review is a separate future workflow.
        ...(input.status === "in_review" ? [eq(applicationSubmissions.status, "pending")] : []),
      )).returning();
      if (!updated) return null;
      const [form] = await tx.select().from(applicationForms)
        .where(and(eq(applicationForms.guildId, input.guildId),
          eq(applicationForms.id, updated.formId))).limit(1);
      if (!form) throw new ApplicationError("Application form no longer exists.");
      await tx.insert(applicationAudit).values({
        guildId: input.guildId, submissionId: updated.id, actorId: input.actorId,
        action: input.status, details: { reason: input.reason },
      });
      return { submission: updated, form };
    });
  }

  async listAudit(guildId: string, submissionId: string) {
    return this.db.select().from(applicationAudit).where(and(
      eq(applicationAudit.guildId, guildId),
      eq(applicationAudit.submissionId, submissionId),
    )).orderBy(desc(applicationAudit.createdAt)).limit(100);
  }
}
