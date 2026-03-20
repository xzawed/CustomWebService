import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base/BaseRepository';
import type { Organization, OrganizationSettings } from '@/types/organization';

export class OrganizationRepository extends BaseRepository<Organization> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'organizations');
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this.toDomain(data);
  }

  async findByUserId(userId: string): Promise<Organization[]> {
    const { data, error } = await this.supabase
      .from('memberships')
      .select('organization_id, organizations(*)')
      .eq('user_id', userId);

    if (error) throw error;
    return (data ?? [])
      .filter((row) => row.organizations)
      .map((row) => this.toDomain(row.organizations as unknown as Record<string, unknown>));
  }

  protected toDomain(row: Record<string, unknown>): Organization {
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      plan: (row.plan as string) ?? 'free',
      settings: (row.settings as OrganizationSettings) ?? {},
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
