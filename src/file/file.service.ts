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

  private isValidLocalPath(file: string): boolean {
    // Implement a whitelist or regex to validate local file paths
    const allowedPaths = ['/allowed/path1', '/allowed/path2'];
    return allowedPaths.some(allowedPath => file.startsWith(allowedPath));
  }

  private isValidUrl(url: string): boolean {
    // Implement a whitelist for allowed URLs
    const allowedDomains = ['https://trusted-domain.com'];
    try {
      const parsedUrl = new URL(url);
      return allowedDomains.includes(parsedUrl.origin);
    } catch (e) {
      return false;
    }
  }

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    try {
      if (file.startsWith('/')) {
        if (!this.isValidLocalPath(file)) {
          throw new Error('Access to this file path is not allowed');
        }
        await fs.promises.access(file, R_OK);

        return fs.createReadStream(file);
      } else if (file.startsWith('http')) {
        if (!this.isValidUrl(file)) {
          throw new Error('Access to this URL is not allowed');
        }
        const content = await this.cloudProviders.get(file);

        if (content) {
          return Readable.from(content);
        } else {
          throw new Error(`no such file or directory, access '${file}'`);
        }
      } else {
        file = path.resolve(process.cwd(), file);

        if (!this.isValidLocalPath(file)) {
          throw new Error('Access to this file path is not allowed');
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
