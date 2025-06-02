import { Injectable, Logger } from '@nestjs/common';
import { Readable, Stream } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { CloudProvidersMetaData } from './cloud.providers.metadata';
import { R_OK } from 'constants';
import axios from 'axios'; // Import axios for HTTP requests

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private cloudProviders = new CloudProvidersMetaData();

  private isValidLocalPath(filePath: string): boolean {
    // Ensure the path is within a specific directory, e.g., 'uploads'
    const baseDir = path.resolve(process.cwd(), 'uploads');
    const resolvedPath = path.resolve(process.cwd(), filePath);
    return resolvedPath.startsWith(baseDir);
  }

  private isValidUrl(url: string): boolean {
    // Implement a whitelist of allowed URLs or domains
    const allowedDomains = ['https://trusted-domain.com'];
    return allowedDomains.some(domain => url.startsWith(domain));
  }

  private isValidCloudProviderUrl(url: string): boolean {
    // Implement a whitelist of allowed cloud provider base URLs
    const allowedCloudProviderUrls = [
      CloudProvidersMetaData.GOOGLE,
      CloudProvidersMetaData.AWS,
      CloudProvidersMetaData.AZURE,
      CloudProvidersMetaData.DIGITAL_OCEAN
    ];
    return allowedCloudProviderUrls.some(baseUrl => url.startsWith(baseUrl));
  }

  async getFile(file: string): Promise<Stream> {
    this.logger.log(`Reading file: ${file}`);

    if (file.startsWith('/')) {
      if (!this.isValidLocalPath(file)) {
        throw new Error('Access to this file path is not allowed');
      }
      await fs.promises.access(file, R_OK);

      return fs.createReadStream(file);
    } else if (file.startsWith('http')) {
      if (!this.isValidUrl(file) && !this.isValidCloudProviderUrl(file)) {
        throw new Error('Remote file access is not allowed');
      }
      // Fetch the file from the URL safely using axios
      const response = await axios.get(file, { responseType: 'stream' });
      return response.data;
    } else {
      if (!this.isValidLocalPath(file)) {
        throw new Error('Access to this file path is not allowed');
      }
      file = path.resolve(process.cwd(), file);

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
