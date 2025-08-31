import { Injectable, Logger } from '@nestjs/common';
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

    if (file.startsWith('/')) {
      // Prevent access to hidden directories like .git and .hg
      if (file.includes('/.git/') || file.includes('/.hg/')) {
        throw new Error('Access to this directory is forbidden');
      }

      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      // Validate URL
      const url = new URL(file);
      if (!this.isAllowedHost(url.hostname)) {
        throw new Error(`Access to the host '${url.hostname}' is not allowed`);
      }

      // Ensure the URL path is valid and does not access sensitive metadata
      if (url.pathname.startsWith('/computeMetadata/v1/')) {
        throw new Error('Access to metadata paths is forbidden');
      }

      const content = await this.cloudProviders.get(file);

      if (content) {
        return Readable.from(content);
      } else {
        throw new Error(`no such file or directory, access '${file}'`);
      }
    } else {
      file = path.resolve(process.cwd(), file);

      // Prevent access to hidden directories like .git and .hg
      if (file.includes('/.git/') || file.includes('/.hg/')) {
        throw new Error('Access to this directory is forbidden');
      }

      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    }
  }

  private isAllowedHost(hostname: string): boolean {
    const allowedHosts = [
      'example.com', // Add more allowed hosts as needed
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