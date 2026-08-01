export interface IRateLimitRepository {
  checkAndIncrementDailyLimit(userId: string, limit: number): Promise<boolean>;
  decrementDailyLimit(userId: string): Promise<void>;
  getCurrentUsage(userId: string): Promise<number>;
  checkAndIncrementDailySuggestionLimit(userId: string, limit: number): Promise<boolean>;
  /** Compensating decrement for a failed AI suggestion (mirrors decrementDailyLimit). */
  decrementDailySuggestionLimit(userId: string): Promise<void>;
}
