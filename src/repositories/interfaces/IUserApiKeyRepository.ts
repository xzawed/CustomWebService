export interface UserApiKey {
  id: string;
  userId: string;
  apiId: string;
  encryptedKey: string;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IUserApiKeyRepository {
  upsert(userId: string, apiId: string, encryptedKey: string): Promise<UserApiKey>;
  delete(userId: string, apiId: string): Promise<void>;
  findByUserAndApi(userId: string, apiId: string): Promise<UserApiKey | null>;
  findAllByUser(userId: string): Promise<UserApiKey[]>;
  updateVerificationStatus(userId: string, apiId: string, isVerified: boolean): Promise<void>;
}
