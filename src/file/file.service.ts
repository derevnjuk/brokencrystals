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

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    if (file.startsWith('/')) {
      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      throw new Error('Access to URLs is not allowed');
    } else {
      // Validate the file path to prevent directory traversal
      const resolvedPath = path.resolve(process.cwd(), file);
      if (!resolvedPath.startsWith(process.cwd())) {
        throw new Error('Invalid file path');
      }

      await fs.promises.access(resolvedPath, R_OK);

      return fs.createReadStream(resolvedPath);
    }
  }

  async deleteFile(file: string): Promise<boolean> {
    if (file.startsWith('/')) {
      throw new Error('cannot delete file from this location');
    } else if (file.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      // Validate the file path to prevent directory traversal
      const resolvedPath = path.resolve(process.cwd(), file);
      if (!resolvedPath.startsWith(process.cwd())) {
        throw new Error('Invalid file path');
      }

      await fs.promises.unlink(resolvedPath);
      return true;
    }
  }
}
