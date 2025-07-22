import { Injectable, Logger } from '@nestjs/common';
import { Readable, Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      // Allow only specific protocols
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch (err) {
      return false;
    }
  }

  private isValidPath(filePath: string): boolean {
    // Define a base directory for file access
    const baseDir = path.resolve(process.cwd(), 'allowed_files');
    const resolvedPath = path.resolve(baseDir, filePath);
    return resolvedPath.startsWith(baseDir);
  }

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    if (!this.isValidPath(file)) {
      throw new Error('Access to this file path is not allowed');
    }

    const resolvedPath = path.resolve(process.cwd(), 'allowed_files', file);
    await fs.promises.access(resolvedPath, R_OK);

    return fs.createReadStream(resolvedPath);
  }

  async deleteFile(file: string): Promise<boolean> {
    if (!this.isValidPath(file)) {
      throw new Error('Access to this file path is not allowed');
    }

    const resolvedPath = path.resolve(process.cwd(), 'allowed_files', file);
    await fs.promises.unlink(resolvedPath);
    return true;
  }
}
