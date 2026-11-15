import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../client';
import { statisticConnections } from '../schema';

type Row = typeof statisticConnections.$inferInsert;
type Executor = Pick<Database, 'select' | 'insert' | 'delete' | 'execute'>;
export class StatisticConnectionRepository {
  constructor(private db: Executor) {}
  async get(guildId: string, provider: string) {
    const [row] = await this.db.select().from(statisticConnections).where(and(eq(statisticConnections.guildId, guildId), eq(statisticConnections.provider, provider))).limit(1);
    return row ?? null;
  }
  async save(row: Row) {
    await this.db.insert(statisticConnections).values(row).onConflictDoUpdate({ target: [statisticConnections.guildId, statisticConnections.provider], set: {
      accountId: row.accountId, accountName: row.accountName, encryptedToken: row.encryptedToken, expiresAt: row.expiresAt, updatedAt: new Date(),
    } });
  }
  async remove(guildId: string, provider: string) {
    await this.db.delete(statisticConnections).where(and(eq(statisticConnections.guildId, guildId), eq(statisticConnections.provider, provider)));
  }
  /** Serializes rotating OAuth refresh tokens across multiple web replicas. */
  static async locked<T>(db: Database, guildId: string, provider: string, fn: (repo: StatisticConnectionRepository) => Promise<T>): Promise<T> {
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`statistics:${guildId}:${provider}`}, 0))`);
      return await fn(new StatisticConnectionRepository(tx));
    });
  }
}
