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
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid URL protocol');
      }

      // Ensure the URL is within allowed domains
      const allowedDomains = ['example.com', 'another-example.com'];
      if (!allowedDomains.includes(url.hostname)) {
        throw new Error('URL domain is not allowed');
      }

      // Ensure the URL path is within allowed paths
      const allowedPaths = ['/allowed-path/'];
      if (!allowedPaths.some(allowedPath => url.pathname.startsWith(allowedPath))) {
        throw new Error('URL path is not allowed');
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