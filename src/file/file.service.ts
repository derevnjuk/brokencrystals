import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { Readable, Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';
import { URL } from 'url';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    try {
      if (file.startsWith('/')) {
        const resolvedPath = path.resolve(file);
        if (!this.isValidPath(resolvedPath)) {
          throw new Error('Invalid file path');
        }
        await fs.promises.access(resolvedPath, R_OK);

        return fs.createReadStream(resolvedPath);
      } else if (file.startsWith('http')) {
        // Validate URL
        const url = new URL(file);
        if (!this.isAllowedHost(url.hostname)) {
          throw new Error('Access to this host is not allowed');
        }

        const content = await this.cloudProviders.get(file);

        if (content) {
          return Readable.from(content);
        } else {
          throw new Error(`no such file or directory, access '${file}'`);
        }
      } else {
        const resolvedPath = path.resolve(process.cwd(), file);
        if (!this.isValidPath(resolvedPath)) {
          throw new Error('Invalid file path');
        }
        await fs.promises.access(resolvedPath, R_OK);

        return fs.createReadStream(resolvedPath);
      }
    } catch (error) {
      this.logger.error(`Error accessing file: ${error.message}`);
      throw new InternalServerErrorException('An error occurred while accessing the file.');
    }
  }

  private isValidPath(filePath: string): boolean {
    // Implement a whitelist check for valid file paths
    const validBasePath = path.resolve(process.cwd(), 'config/products/crystals');
    return filePath.startsWith(validBasePath);
  }

  private isAllowedHost(hostname: string): boolean {
    // Implement a whitelist of allowed hosts
    const allowedHosts = [
      'example.com',
      'another-allowed-host.com',
      // Add more allowed hosts as needed
    ];
    return allowedHosts.includes(hostname);
  }

  async deleteFile(file: string): Promise<boolean> {
    if (file.startsWith('/')) {
      throw new Error('cannot delete file from this location');
    } else if (file.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      file = path.resolve(process.cwd(), file);
      await fs.promises.unlink(file);
      return true;
    }
  }
}
