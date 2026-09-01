import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { KeyPeriodInfo } from './types';

export class KeyGenerator {
  /**
   * Generates a 16-byte AES-128 key, an IV, and writes the binary key file and key info file.
   */
  static generateKeyPeriod(
    videoId: string,
    keyIndex: number,
    keyPeriod: number,
    outputDirectory: string,
  ): { keyInfo: KeyPeriodInfo; keyInfoFilePath: string } {
    const keyBuffer = crypto.randomBytes(16);
    const ivBuffer = crypto.randomBytes(16);
    const keyHex = keyBuffer.toString('hex');
    const ivHex = ivBuffer.toString('hex');

    // Create keys subdirectory if needed
    const keysDir = path.join(outputDirectory, 'keys');
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }

    // Binary key file (used by FFmpeg locally during encoding)
    const keyFilePath = path.join(keysDir, `key_${keyIndex}.bin`);
    fs.writeFileSync(keyFilePath, keyBuffer);

    // EXT-X-KEY URI written into the HLS manifest
    const keyUri =
      keyIndex === 0
        ? `/keys/${videoId}`
        : `/keys/${videoId}?keyIndex=${keyIndex}`;

    // Key info file format for FFmpeg:
    // Line 1: Key URI
    // Line 2: Path to key file
    // Line 3: IV in hex
    const keyInfoFilePath = path.join(keysDir, `key_info_${keyIndex}.txt`);
    const keyInfoContent = `${keyUri}\n${keyFilePath.replace(/\\/g, '/')}\n${ivHex}\n`;
    fs.writeFileSync(keyInfoFilePath, keyInfoContent, 'utf8');

    return {
      keyInfo: {
        keyIndex,
        keyPeriod,
        keyBuffer,
        keyHex,
        ivHex,
        keyUri,
        keyFilePath,
      },
      keyInfoFilePath,
    };
  }
}
