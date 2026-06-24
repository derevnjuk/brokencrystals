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

  private isValidPath(file: string): boolean {
    // Implement a whitelist of allowed paths or patterns
    const allowedPaths = ['/allowed/path1', '/allowed/path2'];
    return allowedPaths.some(allowedPath => file.startsWith(allowedPath));
  }

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    if (!this.isValidPath(file)) {
      throw new Error('Access to this file path is not allowed');
    }

    // Ensure the file path is absolute and resolve it against a base directory
    const baseDir = path.resolve('/base/directory');
    const resolvedPath = path.resolve(baseDir, file);

    if (!resolvedPath.startsWith(baseDir)) {
      throw new Error('Resolved path is outside the allowed base directory');
    }

    if (resolvedPath.startsWith('/')) {
      await fs.promises.access(resolvedPath, R_OK);

      return fs.createReadStream(resolvedPath);
    } else if (resolvedPath.startsWith('http')) {
      throw new Error('Remote file access is not allowed');
    } else {
      await fs.promises.access(resolvedPath, R_OK);

      return fs.createReadStream(resolvedPath);
    }
  }

  async deleteFile(file: string): Promise<boolean> {
    if (!this.isValidPath(file)) {
      throw new Error('Access to this file path is not allowed');
    }

    // Ensure the file path is absolute and resolve it against a base directory
    const baseDir = path.resolve('/base/directory');
    const resolvedPath = path.resolve(baseDir, file);

    if (!resolvedPath.startsWith(baseDir)) {
      throw new Error('Resolved path is outside the allowed base directory');
    }

    if (resolvedPath.startsWith('/')) {
      throw new Error('cannot delete file from this location');
    } else if (resolvedPath.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      await fs.promises.unlink(resolvedPath);
      return true;
    }
  }
}
