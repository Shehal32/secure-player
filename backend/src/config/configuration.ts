export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  keySessionSecret: string;
  keySessionTtlSeconds: number;
  azureStorageConnectionString: string;
  azureStorageAccountName: string;
  azureStorageAccountKey: string;
  azureStorageContainerName: string;
  azureStorageCustomDomain?: string;
  allowedOrigins: string[];
  segmentSasTtlSeconds: number;
  watermarkSecret: string;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: (process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/secure_player').trim(),
  jwtSecret: (process.env.JWT_SECRET || 'dev_insecure_jwt_secret_change_in_production_32b').trim(),
  keySessionSecret: (process.env.KEY_SESSION_SECRET || 'dev_insecure_key_session_hmac_secret_32b').trim(),
  keySessionTtlSeconds: parseInt(process.env.KEY_SESSION_TTL_SECONDS || '60', 10),
  watermarkSecret: (process.env.WATERMARK_SECRET || 'dev_insecure_watermark_hmac_secret_min_32b').trim(),
  azureStorageConnectionString: (process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim(),
  azureStorageAccountName: (process.env.AZURE_STORAGE_ACCOUNT_NAME || 'devstoreaccount1').trim(),
  azureStorageAccountKey: (process.env.AZURE_STORAGE_ACCOUNT_KEY || '').trim(),
  azureStorageContainerName: (process.env.AZURE_STORAGE_CONTAINER_NAME || 'videos').trim(),
  azureStorageCustomDomain: process.env.AZURE_STORAGE_CUSTOM_DOMAIN ? process.env.AZURE_STORAGE_CUSTOM_DOMAIN.trim() : undefined,
  // ASSUMPTION: Default allowlist includes local dev frontend ports and public ngrok domain
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,https://unlikeable-unhectically-jasiah.ngrok-free.dev')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  segmentSasTtlSeconds: parseInt(process.env.SEGMENT_SAS_TTL_SECONDS || '300', 10),
});
