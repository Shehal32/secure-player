import * as fs from 'fs';
import * as path from 'path';
import { BlobServiceClient } from '@azure/storage-blob';

export class AzureUploader {
  /**
   * Uploads packaged .m3u8 playlists and .ts segments to Azure Blob Storage.
   * NEVER uploads raw key files (.bin or key_info.txt).
   */
  static async uploadVideoAssets(
    outputDir: string,
    videoId: string,
    connectionString: string,
    containerName = 'videos',
  ): Promise<string[]> {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Ensure container exists
    await containerClient.createIfNotExists({ access: undefined }); // private

    const files = fs.readdirSync(outputDir);
    const uploadedBlobPaths: string[] = [];

    for (const file of files) {
      // Strictly only upload media playlists and segments
      if (file.endsWith('.m3u8') || file.endsWith('.ts')) {
        const filePath = path.join(outputDir, file);
        const blobPath = `videos/${videoId}/${file}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

        const contentType = file.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t';

        const fileBuffer = fs.readFileSync(filePath);
        await blockBlobClient.uploadData(fileBuffer, {
          blobHTTPHeaders: {
            blobContentType: contentType,
            blobCacheControl: file.endsWith('.m3u8') ? 'no-cache' : 'public, max-age=31536000',
          },
        });

        uploadedBlobPaths.push(blobPath);
        console.log(`[Azure Upload] Uploaded ${file} -> ${blobPath}`);
      }
    }

    return uploadedBlobPaths;
  }
}
