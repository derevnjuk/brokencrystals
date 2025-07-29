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

    // Validate the file path to prevent Local File Inclusion
    if (!this.isValidFilePath(file)) {
      throw new Error('Invalid file path');
    }

    try {
      if (file.startsWith('/')) {
        await fs.promises.access(file, R_OK);

        return fs.createReadStream(file);
      } else if (file.startsWith('http')) {
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
    } catch (err) {
      this.logger.error(err.message);
      throw new Error('An error occurred while accessing the file.');
    }
  }

  private isValidFilePath(filePath: string): boolean {
    // Implement a whitelist of allowed directories
    const allowedDirectories = [
      path.resolve(process.cwd(), 'config/products/crystals'),
      // Add other allowed directories here
    ];

    const resolvedPath = path.resolve(filePath);
    return allowedDirectories.some(dir => resolvedPath.startsWith(dir));
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
