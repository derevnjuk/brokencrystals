import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { Readable, Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  private isValidPath(filePath: string): boolean {
    // Define a base directory for file access
    const baseDir = path.resolve(process.cwd(), 'allowed_files');
    const resolvedPath = path.resolve(baseDir, filePath);
    return resolvedPath.startsWith(baseDir);
  }

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    if (!this.isValidPath(file)) {
      throw new Error('Access to this file is not allowed');
    }

    try {
      const resolvedPath = path.resolve(process.cwd(), 'allowed_files', file);
      await fs.promises.access(resolvedPath, R_OK);

      return fs.createReadStream(resolvedPath);
    } catch (err) {
      this.logger.error(`Failed to read file: ${err.message}`);
      throw new InternalServerErrorException('Failed to read the file');
    }
  }

  async deleteFile(file: string): Promise<boolean> {
    if (!this.isValidPath(file)) {
      throw new Error('cannot delete file from this location');
    }

    const resolvedPath = path.resolve(process.cwd(), 'allowed_files', file);
    await fs.promises.unlink(resolvedPath);
    return true;
  }
}
