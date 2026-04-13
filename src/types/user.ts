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
  createdAt: string;
  updatedAt: string;
}
