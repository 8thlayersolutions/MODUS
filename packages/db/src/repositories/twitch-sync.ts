import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { twitchSyncBroadcasters, twitchSyncMembers, twitchSyncGrants } from "../schema";

export type BroadcasterLink = typeof twitchSyncBroadcasters.$inferSelect;
export type MemberLink = typeof twitchSyncMembers.$inferSelect;
export type TwitchSyncGrant = typeof twitchSyncGrants.$inferSelect;

/** Only DB rows, not token plaintext, leave this repository. */
export class TwitchSyncRepository {
  constructor(private db: Database) {}

  async getBroadcaster(guildId: string): Promise<BroadcasterLink | null> {
    const [row] = await this.db.select().from(twitchSyncBroadcasters)
      .where(eq(twitchSyncBroadcasters.guildId, guildId)).limit(1);
    return row || null;
  }
  async setBroadcaster(input: {
    guildId: string; twitchId: string; twitchLogin: string;
    encryptedToken: string; expiresAt: Date;
  }): Promise<void> {
    await this.db.insert(twitchSyncBroadcasters).values(input).onConflictDoUpdate({
      target: twitchSyncBroadcasters.guildId,
      set: { twitchId: input.twitchId, twitchLogin: input.twitchLogin,
        encryptedToken: input.encryptedToken, expiresAt: input.expiresAt, updatedAt: new Date() },
    });
  }
  async setMember(input: {
    guildId: string; discordId: string; twitchId: string; twitchLogin: string;
    encryptedToken: string; expiresAt: Date;
  }): Promise<void> {
    await this.db.insert(twitchSyncMembers).values(input).onConflictDoUpdate({
      target: [twitchSyncMembers.guildId, twitchSyncMembers.discordId],
      set: { twitchId: input.twitchId, twitchLogin: input.twitchLogin,
        encryptedToken: input.encryptedToken, expiresAt: input.expiresAt, updatedAt: new Date() },
    });
  }
  async listMembers(guildId: string): Promise<MemberLink[]> {
    return this.db.select().from(twitchSyncMembers)
      .where(eq(twitchSyncMembers.guildId, guildId));
  }
  async removeMember(guildId: string, discordId: string): Promise<void> {
    await this.db.delete(twitchSyncMembers).where(
      and(eq(twitchSyncMembers.guildId, guildId), eq(twitchSyncMembers.discordId, discordId)));
  }
  async getGrants(guildId: string, discordId: string): Promise<TwitchSyncGrant[]> {
    return this.db.select().from(twitchSyncGrants).where(
      and(eq(twitchSyncGrants.guildId, guildId), eq(twitchSyncGrants.discordId, discordId)));
  }
  async addGrant(guildId: string, discordId: string, roleId: string): Promise<void> {
    await this.db.insert(twitchSyncGrants).values({ guildId, discordId, roleId })
      .onConflictDoNothing();
  }
  async removeGrant(guildId: string, discordId: string, roleId: string): Promise<void> {
    await this.db.delete(twitchSyncGrants).where(and(
      eq(twitchSyncGrants.guildId, guildId),
      eq(twitchSyncGrants.discordId, discordId),
      eq(twitchSyncGrants.roleId, roleId),
    ));
  }
}
