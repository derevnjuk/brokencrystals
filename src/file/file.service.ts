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

    // Validate the file path to prevent directory traversal
    const basePath = path.resolve(process.cwd(), 'files'); // Assuming 'files' is the base directory
    const resolvedPath = path.resolve(basePath, file);

    if (!resolvedPath.startsWith(basePath)) {
      throw new Error('Invalid file path: Access to this resource is not allowed');
    }

    await fs.promises.access(resolvedPath, R_OK);

    return fs.createReadStream(resolvedPath);
  }

  private isValidCloudProviderUrl(url: string): boolean {
    return (
      url.startsWith(CloudProvidersMetaData.GOOGLE) ||
      url.startsWith(CloudProvidersMetaData.AWS) ||
      url.startsWith(CloudProvidersMetaData.AZURE) ||
      url.startsWith(CloudProvidersMetaData.DIGITAL_OCEAN)
    );
  }

  async deleteFile(file: string): Promise<boolean> {
    if (file.startsWith('/')) {
      throw new Error('cannot delete file from this location');
    } else if (file.startsWith('http')) {
      throw new Error('cannot delete file from this location');
    } else {
      const basePath = path.resolve(process.cwd(), 'files'); // Assuming 'files' is the base directory
      const resolvedPath = path.resolve(basePath, file);

      if (!resolvedPath.startsWith(basePath)) {
        throw new Error('Invalid file path: Access to this resource is not allowed');
      }

      await fs.promises.unlink(resolvedPath);
      return true;
    }
  }
}
