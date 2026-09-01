#!/usr/bin/env node
import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { VideoEncoder } from './encoder';

// Load environment variables from .env if present
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

const program = new Command();

program
  .name('secure-encode')
  .description('Encrypt and package video files into AES-128 HLS with optional key rotation')
  .version('1.0.0')
  .requiredOption('-i, --input <path>', 'Path to raw input video file')
  .requiredOption('-v, --videoId <id>', 'Unique video identifier (e.g. vid_12345)')
  .option('-o, --output <dir>', 'Local output directory')
  .option('-s, --segment-duration <seconds>', 'HLS segment duration in seconds', '6')
  .option('-r, --key-rotation <segments>', 'Rotate key every N segments (0 for single key)', '0')
  .option('--upload-azure', 'Upload encrypted .m3u8 and .ts segments to Azure Blob Storage', false)
  .option('--save-db', 'Persist generated AES keys and video record into PostgreSQL DB', false)
  .option('--db-url <url>', 'PostgreSQL database connection URL (or DATABASE_URL env)')
  .option('--azure-conn <string>', 'Azure Blob connection string (or AZURE_STORAGE_CONNECTION_STRING env)')
  .option('--container <name>', 'Azure Blob container name', 'videos')
  .action(async (opts) => {
    try {
      const encoder = new VideoEncoder();
      const result = await encoder.encode({
        inputPath: path.resolve(process.cwd(), opts.input),
        videoId: opts.videoId,
        outputDir: opts.output ? path.resolve(process.cwd(), opts.output) : undefined,
        segmentDuration: parseFloat(opts.segmentDuration),
        keyRotationSegments: parseInt(opts.keyRotation, 10),
        uploadToAzure: opts.uploadAzure,
        saveToDatabase: opts.saveDb,
        databaseUrl: opts.dbUrl,
        azureConnectionString: opts.azureConn,
        azureContainerName: opts.container,
      });

      console.log('\n=============================================');
      console.log('✅ Encoding & Packaging Successfully Completed');
      console.log('=============================================');
      console.log(`Video ID:        ${result.videoId}`);
      console.log(`Playlist Output: ${result.playlistPath}`);
      console.log(`Segments Count:  ${result.segmentFiles.length}`);
      console.log(`Keys Generated:  ${result.keys.length}`);
      console.log(`Azure Uploaded:  ${result.uploadedToAzure}`);
      console.log(`DB Persisted:    ${result.savedToDatabase}`);
      console.log('=============================================\n');
    } catch (error) {
      console.error('\n❌ Encoding failed:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
