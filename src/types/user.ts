export interface UserPreferences {
  language?: string;
  theme?: 'light' | 'dark';
  defaultDeployPlatform?: string;
  emailNotifications?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  preferences: UserPreferences;
  passwordHash: string | null;
  emailVerified: string | null;
  createdAt: string;
  updatedAt: string;
}
