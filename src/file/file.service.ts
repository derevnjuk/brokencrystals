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

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    if (file.startsWith('/')) {
      throw new Error('Access to absolute paths is not allowed');
    } else if (file.startsWith('http')) {
      if (!this.isValidUrl(file)) {
        throw new Error(`Invalid URL: ${file}`);
      }
      const content = await this.cloudProviders.get(file);

      if (content) {
        return Readable.from(content);
      } else {
        throw new Error(`no such file or directory, access '${file}'`);
      }
    } else {
      file = path.resolve(process.cwd(), file);

      try {
        await fs.promises.access(file, R_OK);
        return fs.createReadStream(file);
      } catch (err) {
        this.logger.error(`File access error: ${err.message}`);
        throw new InternalServerErrorException('File could not be accessed');
      }
    }
  }

  private isValidUrl(url: string): boolean {
    const allowedHosts = ['example.com', 'another-example.com'];
    try {
      const parsedUrl = new URL(url);
      return allowedHosts.includes(parsedUrl.hostname);
    } catch (err) {
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
