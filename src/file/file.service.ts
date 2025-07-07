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

  private readonly allowedDirectories = [
    path.resolve(process.cwd(), 'config/products/crystals'),
    // Add other allowed directories here
  ];

  private isPathAllowed(filePath: string): boolean {
    return this.allowedDirectories.some(allowedDir => filePath.startsWith(allowedDir));
  }

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    let resolvedPath;
    if (file.startsWith('/')) {
      resolvedPath = path.resolve(file);
    } else if (file.startsWith('http')) {
      const content = await this.cloudProviders.get(file);

      if (content) {
        return Readable.from(content);
      } else {
        throw new Error(`no such file or directory, access '${file}'`);
      }
    } else {
      resolvedPath = path.resolve(process.cwd(), file);
    }

    if (!this.isPathAllowed(resolvedPath)) {
      throw new Error('Access to this file path is not allowed');
    }

    await fs.promises.access(resolvedPath, R_OK);

    return fs.createReadStream(resolvedPath);
  }

  async deleteFile(file: string): Promise<boolean> {
    if (file.startsWith('/')) {
      throw new Error('cannot delete file from this location');
    } else if (file.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      const resolvedPath = path.resolve(process.cwd(), file);
      if (!this.isPathAllowed(resolvedPath)) {
        throw new Error('Access to this file path is not allowed');
      }
      await fs.promises.unlink(resolvedPath);
      return true;
    }
  }
}
