export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: OrganizationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSettings {
  maxProjects?: number;
  maxMembersCount?: number;
  allowedDeployPlatforms?: string[];
  defaultAiProvider?: string;
}

export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: MemberRole;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  language?: string;
  theme?: 'light' | 'dark';
  defaultDeployPlatform?: string;
  emailNotifications?: boolean;
}
