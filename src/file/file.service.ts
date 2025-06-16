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
    const isValidPath = this.allowedPaths.some(allowedPath => file.startsWith(allowedPath));
    if (!isValidPath) {
      throw new Error('Access to this file path is not allowed');
    }

    const resolvedPath = path.resolve(process.cwd(), file);
    await fs.promises.access(resolvedPath, R_OK);

    return fs.createReadStream(resolvedPath);
  }

  async deleteFile(file: string): Promise<boolean> {
    const resolvedPath = path.resolve(process.cwd(), file);
    if (!this.allowedPaths.some(allowedPath => resolvedPath.startsWith(allowedPath))) {
      throw new Error('cannot delete file from this location');
    }
    await fs.promises.unlink(resolvedPath);
    return true;
  }
}
