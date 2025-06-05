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

        // Validate that the file path is not a URL to prevent SSRF and ensure it is a valid path.
        // Additionally, ensure the path is within allowed directories.
        if (!this.isValidPath(file)) {
            throw new Error('Server Side Request Forgery is not allowed');
        }

        // Ensure the file path is within a specific allowed directory
        const allowedBasePath = path.resolve(process.cwd(), 'allowed/directory');
        const resolvedPath = path.resolve(process.cwd(), file);
        if (!resolvedPath.startsWith(allowedBasePath)) {
            throw new Error('Access to this file path is not allowed');
        }

        if (file.startsWith('/')) {
            await fs.promises.access(file, R_OK);

            return fs.createReadStream(file);
       } else if (file.startsWith('http')) {
            throw new Error('Server Side Request Forgery is not allowed');
        } else {
            file = path.resolve(process.cwd(), file);

            await fs.promises.access(file, R_OK);

            return fs.createReadStream(file);
        }
    }

    private isValidPath(filePath: string): boolean {
        // Check if the path is a valid local path and not a URL
        try {
            const url = new URL(filePath);
            return false; // It's a URL, not a valid path
        } catch (e) {
            // If error, it's not a URL, so check for other invalid patterns
            return !filePath.includes('..') && !filePath.includes('\\') && !filePath.includes('%');
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
