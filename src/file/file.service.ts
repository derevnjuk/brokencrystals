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

    // Validate and sanitize the file path
    if (!this.isValidPath(file) && !this.isAllowedUrl(new URL(file))) {
      throw new Error('Invalid file path or URL');
    }

    if (file.startsWith('/')) {
      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      // Validate URL
      let url;
      try {
        url = new URL(file);
      } catch (err) {
        throw new Error('Invalid URL');
      }

      // Check if the URL is allowed
      if (!this.isAllowedUrl(url)) {
        throw new Error('URL is not allowed');
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

  private isAllowedUrl(url: URL): boolean {
    // Updated allowed hosts to prevent SSRF
    const allowedHosts = [
      'example.com', // Add legitimate domains here
      'another-example.com'
    ];
    return allowedHosts.includes(url.hostname);
  }

  private isValidPath(filePath: string): boolean {
    // Implement a basic allowlist for file paths
    const allowedPaths = [
      path.resolve(process.cwd(), 'config/products/crystals'),
      // Add other allowed directories here
    ];
    return allowedPaths.some(allowedPath => filePath.startsWith(allowedPath));
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
