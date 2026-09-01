export interface KeyPeriodInfo {
  keyIndex: number;
  keyPeriod: number;
  keyBuffer: Buffer;
  keyHex: string;
  ivHex: string;
  keyUri: string;
  keyFilePath: string;
}

export interface EncodeOptions {
  inputPath: string;
  videoId: string;
  outputDir?: string;
  segmentDuration?: number; // default 6s
  keyRotationSegments?: number; // number of segments per key, 0 or undefined for single key
  uploadToAzure?: boolean;
  saveToDatabase?: boolean;
  databaseUrl?: string;
  azureConnectionString?: string;
  azureContainerName?: string;
}

export interface EncodeResult {
  videoId: string;
  outputDir: string;
  playlistPath: string;
  segmentFiles: string[];
  keys: KeyPeriodInfo[];
  uploadedToAzure: boolean;
  savedToDatabase: boolean;
}
