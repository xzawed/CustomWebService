export interface IRateLimitRepository {
  checkAndIncrementDailyLimit(userId: string, limit: number): Promise<boolean>;
  decrementDailyLimit(userId: string): Promise<void>;
  getCurrentUsage(userId: string): Promise<number>;
  checkAndIncrementDailyDeployLimit(userId: string, limit: number): Promise<boolean>;
  /** Compensating decrement for a failed deployment (mirrors decrementDailyLimit). */
  decrementDailyDeployLimit(userId: string): Promise<void>;
  checkAndIncrementDailySuggestionLimit(userId: string, limit: number): Promise<boolean>;
  /** Compensating decrement for a failed AI suggestion (mirrors decrementDailyLimit). */
  decrementDailySuggestionLimit(userId: string): Promise<void>;
}
