import { eq, sql, desc, count as drizzleCount } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { Organization, OrganizationSettings } from '@/types/organization';
import type { IOrganizationRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';

type DrizzleDb = NodePgDatabase<typeof schema>;

export class DrizzleOrganizationRepository implements IOrganizationRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, id))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {}
  ): Promise<{ items: Organization[]; total: number }> {
    const { page = 1, limit = 20, orderDirection = 'desc' } = options;
    const offset = (page - 1) * limit;

    const conditions = this.buildConditions(filter);

    const [countResult] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.organizations)
      .where(conditions);

    const rows = await this.db
      .select()
      .from(schema.organizations)
      .where(conditions)
      .orderBy(orderDirection === 'asc' ? schema.organizations.created_at : desc(schema.organizations.created_at))
      .offset(offset)
      .limit(limit);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countResult?.total ?? 0,
    };
  }

  async create(input: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<Organization> {
    const dbData = this.toDatabase(input);

    const [row] = await this.db
      .insert(schema.organizations)
      .values(dbData as typeof schema.organizations.$inferInsert)
      .returning();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<Organization>): Promise<Organization> {
    const dbData = this.toDatabase(input);

    const [row] = await this.db
      .update(schema.organizations)
      .set({ ...dbData, updated_at: new Date() } as Partial<typeof schema.organizations.$inferInsert>)
      .where(eq(schema.organizations.id, id))
      .returning();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.organizations).where(eq(schema.organizations.id, id));
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = this.buildConditions(filter);

    const [result] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.organizations)
      .where(conditions);

    return result?.total ?? 0;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const rows = await this.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<Organization[]> {
    const rows = await this.db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        plan: schema.organizations.plan,
        settings: schema.organizations.settings,
        created_at: schema.organizations.created_at,
        updated_at: schema.organizations.updated_at,
      })
      .from(schema.memberships)
      .innerJoin(
        schema.organizations,
        eq(schema.memberships.organization_id, schema.organizations.id)
      )
      .where(eq(schema.memberships.user_id, userId));

    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: typeof schema.organizations.$inferSelect): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan ?? 'free',
      settings: (row.settings as OrganizationSettings) ?? {},
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private toDatabase(model: Partial<Organization>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(model)) {
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
      result[this.toSnake(key)] = value;
    }
    return result;
  }

  private toSnake(str: string): string {
    return str
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  private buildConditions(filter?: Record<string, unknown>) {
    if (!filter) return undefined;

    const conditions = Object.entries(filter)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const col = this.toSnake(key);
        return sql`${sql.identifier(col)} = ${value}`;
      });

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];

    return sql.join(conditions, sql` AND `);
  }
}
