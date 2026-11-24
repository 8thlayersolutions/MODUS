import { GuildConfigRepository } from "@modus/db";
import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";
import { runAuditedMutation } from "../../utils/admin-audit/service";
import {
  MINECRAFT_VISIBILITY_GUILD,
  MINECRAFT_VISIBILITY_MODULE,
  parseMinecraftDashboardUpdate,
  readMinecraftDashboardVisibility,
} from "../../utils/minecraft-dashboard-visibility";

/** Bot admins can change which Discord guilds show the CHAOS SMP dashboard. */
export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);
  setHeader(event, "Cache-Control", "private, no-store");
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable." });

  const body = await readBody(event);
  let next;
  try {
    next = parseMinecraftDashboardUpdate(body);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : "Invalid Minecraft dashboard settings.",
    });
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 1000) {
    throw createError({ statusCode: 400, statusMessage: "Provide a reason (1–1000 characters) for changing guild visibility." });
  }

  const before = await readMinecraftDashboardVisibility(repos);
  const result = await runAuditedMutation({
    event,
    action: "minecraft.updated",
    target: { type: "minecraft", id: "chaos-smp" },
    before,
    after: next,
    reason,
    mutate: (tx) => new GuildConfigRepository(tx).setModuleSettings(
      MINECRAFT_VISIBILITY_GUILD,
      MINECRAFT_VISIBILITY_MODULE,
      next,
    ),
  });
  return { success: true, auditEventId: result.auditEventId, ...next };
});
