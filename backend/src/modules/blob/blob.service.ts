import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from '@azure/storage-blob';

@Injectable()
export class BlobService implements OnModuleInit {
  private readonly logger = new Logger(BlobService.name);
  private blobServiceClient?: BlobServiceClient;
  private sharedKeyCredential?: StorageSharedKeyCredential;
  private accountName: string;
  private containerName: string;
  private customDomain?: string;

  constructor(private readonly configService: ConfigService) {
    this.accountName = this.configService.get<string>('azureStorageAccountName') || 'devstoreaccount1';
    this.containerName = this.configService.get<string>('azureStorageContainerName') || 'videos';
    this.customDomain = this.configService.get<string>('azureStorageCustomDomain');
  }

  onModuleInit() {
    const connectionString = this.configService.get<string>('azureStorageConnectionString');
    const accountKey = this.configService.get<string>('azureStorageAccountKey');

    if (connectionString) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      // Extract account key & name if possible from connection string
      const matchKey = connectionString.match(/AccountKey=([^;]+)/);
      const matchName = connectionString.match(/AccountName=([^;]+)/);
      if (matchKey && matchName) {
        this.accountName = matchName[1];
        this.sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, matchKey[1]);
      }
    } else if (this.accountName && accountKey) {
      this.sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, accountKey);
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        this.sharedKeyCredential,
      );
    } else {
      this.logger.warn(
        'Azure Storage credentials not configured. Running in mock/development mode.',
      );
    }
  }

  /**
   * Fetches playlist/manifest text content from Azure Blob Storage.
   */
  async downloadBlob(blobPath: string): Promise<string> {
    if (!this.blobServiceClient) {
      throw new Error('BlobServiceClient is not initialized.');
    }

    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    const downloadResponse = await blockBlobClient.download(0);
    const readableStream = downloadResponse.readableStreamBody;
    if (!readableStream) {
      throw new Error(`Failed to download blob at path: ${blobPath}`);
    }

    return await this.streamToString(readableStream);
  }

  /**
   * Generates a direct, short-lived SAS URL for a single segment.
   */
  generateSegmentSasUrl(videoId: string, segmentName: string, ttlSeconds: number): string {
    const blobPath = `videos/${videoId}/${segmentName}`;
    const sasToken = this.createBlobSasToken(blobPath, ttlSeconds);
    return this.buildBlobUrl(blobPath, sasToken);
  }

  /**
   * Batched generation of direct SAS URLs for multiple segments in a single in-memory pass.
   * Performs zero network round trips for SAS token calculation.
   */
  batchGenerateSasUrls(
    videoId: string,
    segmentNames: string[],
    ttlSeconds: number,
  ): Map<string, string> {
    const results = new Map<string, string>();
    const expiresOn = new Date(Date.now() + ttlSeconds * 1000);

    for (const segment of segmentNames) {
      const blobPath = `videos/${videoId}/${segment}`;
      let sasToken = '';

      if (this.sharedKeyCredential) {
        sasToken = generateBlobSASQueryParameters(
          {
            containerName: this.containerName,
            blobName: blobPath,
            permissions: BlobSASPermissions.parse('r'), // Read-only
            startsOn: new Date(Date.now() - 30 * 1000), // 30s clock skew allowance
            expiresOn,
            protocol: SASProtocol.HttpsAndHttp,
          },
          this.sharedKeyCredential,
        ).toString();
      } else {
        // ASSUMPTION: In mock local dev without Azure credentials, generate simulated SAS token
        sasToken = `mock_sas_sig=${Buffer.from(blobPath + expiresOn.getTime()).toString('base64url')}&se=${expiresOn.toISOString()}`;
      }

      results.set(segment, this.buildBlobUrl(blobPath, sasToken));
    }

    return results;
  }

  private createBlobSasToken(blobPath: string, ttlSeconds: number): string {
    if (!this.sharedKeyCredential) {
      const expiresOn = new Date(Date.now() + ttlSeconds * 1000);
      return `mock_sas_sig=${Buffer.from(blobPath + expiresOn.getTime()).toString('base64url')}&se=${expiresOn.toISOString()}`;
    }

    const startsOn = new Date(Date.now() - 30 * 1000);
    const expiresOn = new Date(Date.now() + ttlSeconds * 1000);

    return generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
        protocol: SASProtocol.HttpsAndHttp,
      },
      this.sharedKeyCredential,
    ).toString();
  }

  private buildBlobUrl(blobPath: string, sasQueryString: string): string {
    const base = this.customDomain
      ? `https://${this.customDomain}`
      : `https://${this.accountName}.blob.core.windows.net`;
    const separator = sasQueryString ? (sasQueryString.startsWith('?') ? '' : '?') : '';
    return `${base}/${this.containerName}/${blobPath}${separator}${sasQueryString}`;
  }

  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (data) => {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      readableStream.on('error', reject);
    });
  }
}
