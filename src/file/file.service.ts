import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { Readable, Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  private isValidLocalPath(filePath: string): boolean {
    // Implement a whitelist or validation logic for local paths
    const allowedPaths = ['/allowed/path1', '/allowed/path2']; // Example paths
    return allowedPaths.some(allowedPath => filePath.startsWith(allowedPath));
  }

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    try {
      if (file.startsWith('/')) {
        if (!this.isValidLocalPath(file)) {
          throw new BadRequestException('Access to this file path is not allowed');
        }
        await fs.promises.access(file, R_OK);

        return fs.createReadStream(file);
      } else if (file.startsWith('http')) {
        throw new BadRequestException('HTTP URLs are not allowed');
      } else {
        file = path.resolve(process.cwd(), file);

        if (!this.isValidLocalPath(file)) {
          throw new BadRequestException('Access to this file path is not allowed');
        }

        await fs.promises.access(file, R_OK);

        return fs.createReadStream(file);
      }
    } catch (error) {
      this.logger.error(`Failed to read file: ${error.message}`);
      throw new InternalServerErrorException('Failed to read file');
    }
  }

  async deleteFile(file: string): Promise<boolean> {
    try {
      if (file.startsWith('/')) {
        throw new Error('cannot delete file from this location');
      } else if (file.startsWith('http')) {
        throw new Error('cannot delete file from this location');
      } else {
        file = path.resolve(process.cwd(), file);
        await fs.promises.unlink(file);
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }
}
