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

  private readonly allowedPaths = ['config/products/crystals']; // Define allowed base paths

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    // Validate the file path against allowed paths
    if (!this.isValidPath(file)) {
      throw new Error('Access to this file path is not allowed');
    }

    const resolvedPath = path.resolve(process.cwd(), file);
    await fs.promises.access(resolvedPath, R_OK);

    return fs.createReadStream(resolvedPath);
  }

  isValidPath(file: string): boolean {
    // Ensure the file path is within the allowed paths
    const resolvedPath = path.resolve(process.cwd(), file);
    return this.allowedPaths.some(allowedPath => resolvedPath.startsWith(path.resolve(process.cwd(), allowedPath)));
  }

  async deleteFile(file: string): Promise<boolean> {
    const resolvedPath = path.resolve(process.cwd(), file);
    if (!this.isValidPath(file)) {
      throw new Error('cannot delete file from this location');
    }
    await fs.promises.unlink(resolvedPath);
    return true;
  }
}
