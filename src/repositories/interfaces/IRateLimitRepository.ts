export interface IRateLimitRepository {
  checkAndIncrementDailyLimit(userId: string, limit: number): Promise<boolean>;
  decrementDailyLimit(userId: string): Promise<void>;
  getCurrentUsage(userId: string): Promise<number>;
}
