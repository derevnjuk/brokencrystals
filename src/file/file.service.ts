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
      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      // Validate the URL against allowed cloud provider URLs
      if (!this.isValidCloudProviderUrl(file)) {
        throw new Error('Invalid or unauthorized URL');
      }

      const content = await this.cloudProviders.get(file);

      if (content) {
        return Readable.from(content);
      } else {
        throw new Error(`no such file or directory, access '${file}'`);
      }
    } else {
      file = path.resolve(process.cwd(), file);

      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    }
  }

  private isValidCloudProviderUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      // Ensure the path is not empty and does not contain directory traversal sequences
      if (!parsedUrl.pathname || parsedUrl.pathname.includes('..')) {
        this.logger.error(`Invalid URL path: ${url}`);
        return false;
      }
      return (
        parsedUrl.origin === CloudProvidersMetaData.GOOGLE ||
        parsedUrl.origin === CloudProvidersMetaData.AWS ||
        parsedUrl.origin === CloudProvidersMetaData.AZURE ||
        parsedUrl.origin === CloudProvidersMetaData.DIGITAL_OCEAN
      );
    } catch (error) {
      this.logger.error(`Invalid URL format: ${url}`);
      return false;
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
