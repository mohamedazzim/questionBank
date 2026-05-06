/**
 * Archive Processing and File Discovery Engine
 *
 * Handles:
 * - ZIP/RAR extraction with security validation (path traversal prevention)
 * - LaTeX file detection and selection
 * - Image file discovery and mapping
 * - Cleanup and security
 */

import { readdir, readFile, stat, rm, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import extractZip from 'extract-zip';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

export interface FileDiscoveryResult {
  primaryTexFile: string;
  imagePaths: Map<string, string>; // filename -> full path
  allFiles: string[];
  supportingFiles: string[];
}

export interface ImageMapping {
  originalReference: string;
  actualFilePath: string;
  fileName: string;
  mimeType: string;
}

const IGNORED_EXTENSIONS = new Set(['.aux', '.log', '.out', '.gz', '.tmp', '.temp', '.dvi', '.fls', '.fdb_latexmk', '.DS_Store']);
const IGNORED_PATTERNS = /^\..*|~$|\.bak$|Thumbs\.db/i;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.gif', '.pdf', '.eps']);
const TEX_EXTENSION = '.tex';
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.rar']);

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const UNRAR_CANDIDATES = [
  'unrar',
  'C:\\Program Files\\WinRAR\\UnRAR.exe',
  'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe',
];

function isDangerousArchivePath(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, '/').trim();
  if (!normalized) return true;
  if (normalized.startsWith('/') || normalized.startsWith('\\')) return true;
  if (/^[a-zA-Z]:/.test(normalized)) return true;
  if (normalized.split('/').includes('..')) return true;
  return false;
}

function assertSafeArchiveEntry(entryPath: string): void {
  if (isDangerousArchivePath(entryPath)) {
    throw new Error(`Path traversal detected in archive entry: ${entryPath}`);
  }
}

async function extractZipArchive(archivePath: string, extractDir: string): Promise<void> {
  await extractZip(archivePath, {
    dir: extractDir,
    onEntry(entry) {
      assertSafeArchiveEntry(entry.fileName || '');
    },
  });
}

function quoteCommandArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function normalizeCommandChunk(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf-8');
  if (value && typeof value === 'object' && 'toString' in value) {
    return String(value);
  }
  return '';
}

async function resolveUnrarCommand(): Promise<string> {
  for (const candidate of UNRAR_CANDIDATES) {
    if (candidate === 'unrar') {
      try {
        await execAsync('where unrar', { windowsHide: true });
        logger.info({ candidate }, 'Using unrar executable');
        return candidate;
      } catch {
        continue;
      }
    }

    try {
      const candidateStats = await stat(candidate);
      if (candidateStats.isFile()) {
        logger.info({ candidate }, 'Using unrar executable');
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error('RAR extraction requires WinRAR or unrar installed');
}

function toCommandOutput(error: unknown): { code?: number; stdout: string; stderr: string; message: string } {
  const candidate = error as {
    code?: number;
    stdout?: unknown;
    stderr?: unknown;
    message?: unknown;
  };

  return {
    code: typeof candidate?.code === 'number' ? candidate.code : undefined,
    stdout: normalizeCommandChunk(candidate?.stdout),
    stderr: normalizeCommandChunk(candidate?.stderr),
    message: normalizeCommandChunk(candidate?.message) || String(error),
  };
}

function classifyRarFailure(error: unknown): Error {
  const output = toCommandOutput(error);
  const combined = `${output.message}\n${output.stdout}\n${output.stderr}`;

  if (combined.includes('RAR extraction requires WinRAR or unrar installed')) {
    return new Error('RAR extraction requires WinRAR or unrar installed');
  }

  if (combined.includes('Invalid or corrupted RAR file')) {
    return new Error('Invalid or corrupted RAR file');
  }

  if (combined.includes('RAR contains no files')) {
    return new Error('RAR contains no files');
  }

  if (combined.includes('Corrupt header') || combined.includes('Main archive header is corrupt') || combined.includes('Unexpected end of archive')) {
    return new Error('Invalid or corrupted RAR file');
  }

  if (combined.includes('No files to extract')) {
    return new Error('RAR contains no files');
  }

  if (typeof output.code === 'number' && output.code !== 0) {
    return new Error('RAR extraction failed: archive is corrupt or unsupported');
  }

  return new Error('RAR extraction failed');
}

function hasNoFilesMessage(output: { stdout: string; stderr: string; message: string }): boolean {
  return `${output.stdout}\n${output.stderr}\n${output.message}`.includes('No files to extract');
}

function hasCorruptHeaderMessage(output: { stdout: string; stderr: string; message: string }): boolean {
  const combined = `${output.stdout}\n${output.stderr}\n${output.message}`;
  return combined.includes('Corrupt header') || combined.includes('Main archive header is corrupt') || combined.includes('Unexpected end of archive');
}

async function extractRarWithSystemUnrar(archivePath: string, extractDir: string): Promise<void> {
  const unrarCommand = await resolveUnrarCommand();
  logger.info({ archivePath, extractDir, unrarCommand }, 'Running system unrar');

  let testOutput: { stdout: string; stderr: string };
  try {
    testOutput = await execFileAsync(unrarCommand, ['t', archivePath], { windowsHide: true });
  } catch (testErr) {
    const output = toCommandOutput(testErr);
    logger.info(
      {
        archivePath,
        stdout: output.stdout.trim(),
        stderr: output.stderr.trim(),
      },
      'RAR test output',
    );

    if (hasCorruptHeaderMessage(output)) {
      throw new Error('Invalid or corrupted RAR file');
    }

    if (hasNoFilesMessage(output)) {
      throw new Error('RAR contains no files');
    }

    throw testErr;
  }

  logger.info(
    {
      archivePath,
      stdout: testOutput.stdout?.trim() || '',
      stderr: testOutput.stderr?.trim() || '',
    },
    'RAR test output',
  );

  if ((testOutput.stderr || '').includes('Corrupt header')) {
    throw new Error('Invalid or corrupted RAR file');
  }

  let listing: { stdout: string; stderr: string };
  try {
    listing = await execFileAsync(unrarCommand, ['lb', archivePath], { windowsHide: true });
  } catch (listErr) {
    const output = toCommandOutput(listErr);
    logger.info(
      {
        archivePath,
        stdout: output.stdout.trim(),
        stderr: output.stderr.trim(),
      },
      'RAR list output',
    );

    if (hasCorruptHeaderMessage(output)) {
      throw new Error('Invalid or corrupted RAR file');
    }

    if (hasNoFilesMessage(output)) {
      throw new Error('RAR contains no files');
    }

    throw listErr;
  }

  const listingStdout = (listing.stdout || '').trim();
  const listingStderr = (listing.stderr || '').trim();
  logger.info(
    {
      archivePath,
      stdout: listingStdout,
      stderr: listingStderr,
    },
    'RAR list output',
  );

  const listedEntries = listing.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (listedEntries.length === 0) {
    throw new Error('RAR contains no files');
  }

  for (const entry of listedEntries) {
    assertSafeArchiveEntry(entry);
  }

  const extractionArgs = ['x', '-o+', '-y', archivePath, `${extractDir}${path.sep}`];
  try {
    const extracted = await execFileAsync(unrarCommand, extractionArgs, { windowsHide: true });
    logger.info(
      {
        archivePath,
        extractDir,
        stdout: extracted.stdout?.trim() || '',
        stderr: extracted.stderr?.trim() || '',
      },
      'RAR extract output',
    );
  } catch (extractErr) {
    const extractedOutput = toCommandOutput(extractErr);
    const combined = `${extractedOutput.stdout}\n${extractedOutput.stderr}\n${extractedOutput.message}`;

    if (combined.includes('No files to extract')) {
      logger.warn({ archivePath, extractDir, stdout: extractedOutput.stdout, stderr: extractedOutput.stderr }, 'RAR x mode found no files, retrying flat extraction');
      try {
        const flatExtracted = await execFileAsync(unrarCommand, ['e', '-o+', '-y', archivePath, `${extractDir}${path.sep}`], { windowsHide: true });
        logger.info(
          {
            archivePath,
            extractDir,
            stdout: flatExtracted.stdout?.trim() || '',
            stderr: flatExtracted.stderr?.trim() || '',
          },
          'RAR flat extract output',
        );
        return;
      } catch (flatErr) {
        const flatOutput = toCommandOutput(flatErr);
        logger.info(
          {
            archivePath,
            extractDir,
            stdout: flatOutput.stdout.trim(),
            stderr: flatOutput.stderr.trim(),
          },
          'RAR flat extract output',
        );

        if (hasNoFilesMessage(flatOutput)) {
          throw new Error('RAR contains no files');
        }

        if (hasCorruptHeaderMessage(flatOutput)) {
          throw new Error('Invalid or corrupted RAR file');
        }

        throw flatErr;
      }
    }

    throw extractErr;
  }
}

export async function extractArchive(filePath: string, extractDir: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.zip') {
    await extractZipArchive(filePath, extractDir);
    return;
  }

  if (ext === '.rar') {
    try {
      await extractRarWithSystemUnrar(filePath, extractDir);
      return;
    } catch (rarErr) {
      const classifiedError = classifyRarFailure(rarErr);
      logger.error({ err: rarErr, filePath, classifiedError: classifiedError.message }, 'RAR extraction failed');
      throw classifiedError;
    }
  }

  throw new Error('Unsupported archive format. Only .zip and .rar are allowed.');
}

/**
 * Validates path for zip slip attacks
 * Ensures no path traversal attempts
 */
function validatePath(basePath: string, filePath: string): boolean {
  try {
    const fullPath = path.resolve(basePath, filePath);
    const normalizedBase = path.normalize(basePath);
    const normalizedFull = path.normalize(fullPath);
    
    // Ensure path is within extraction directory
    if (!normalizedFull.startsWith(normalizedBase)) {
      logger.warn({ basePath, filePath }, 'Zip slip attempt detected');
      return false;
    }
    
    return true;
  } catch (err) {
    logger.warn({ basePath, filePath, err }, 'Path validation error');
    return false;
  }
}

/**
 * Recursively scans directory for all files
 */
async function scanDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    try {
      const entries = await readdir(current, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        const relativePath = path.relative(dir, fullPath);

        // Skip hidden and backup files
        if (IGNORED_PATTERNS.test(entry.name)) continue;

        // Security: validate path
        if (!validatePath(dir, relativePath)) continue;

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          files.push(relativePath);
        }
      }
    } catch (err) {
      logger.warn({ dir: current, err }, 'Error scanning directory');
    }
  }

  await walk(dir);
  return files;
}

/**
 * Filters out build artifacts and system files
 */
function filterRelevantFiles(files: string[]): string[] {
  return files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    
    // Skip ignored extensions
    if (IGNORED_EXTENSIONS.has(ext)) return false;
    
    // Skip system files
    if (IGNORED_PATTERNS.test(path.basename(file))) return false;
    
    // Keep tex, image, and text files
    return ext === TEX_EXTENSION || 
           IMAGE_EXTENSIONS.has(ext) || 
           ['.txt', '.md', '.pdf'].includes(ext);
  });
}

/**
 * Selects the primary LaTeX file
 * Prefers files with exam-class structure and rich item density.
 */
async function selectPrimaryTexFile(dir: string, texFiles: string[]): Promise<string | null> {
  if (texFiles.length === 0) return null;
  if (texFiles.length === 1) return texFiles[0];

  let bestFile = texFiles[0];
  let bestScore = -1;

  for (const file of texFiles) {
    try {
      const fullPath = path.join(dir, file);
      const fileStats = await stat(fullPath);
      const content = await readFile(fullPath, 'utf-8');

      // Score based on requested priority:
      // - Presence/frequency of \begin{questions}
      // - Frequency of \item markers
      // - File size as tie-breaker
      const beginQuestionsCount = (content.match(/\\begin\s*\{\s*questions\s*\}/g) || []).length;
      const itemCount = (content.match(/\\item\b/g) || []).length;
      const questionCommandCount = (content.match(/\\question\s*\{/g) || []).length;
      const sizeScore = Math.min(fileStats.size / 1024, 500);

      const score =
        beginQuestionsCount * 2000 +
        itemCount * 25 +
        questionCommandCount * 40 +
        sizeScore;

      if (score > bestScore) {
        bestScore = score;
        bestFile = file;
      }
    } catch (err) {
      logger.warn({ file, err }, 'Error analyzing TeX file');
    }
  }

  return bestFile;
}

/**
 * Discovers images and creates a mapping for resolution
 */
async function discoverImages(dir: string, allFiles: string[]): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();

  for (const file of allFiles) {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const fileName = path.basename(file);
    const fullPath = path.join(dir, file);

    // Store both with and without extension for flexible matching
    imageMap.set(fileName, fullPath);
    imageMap.set(fileName.toLowerCase(), fullPath);

    // Also store without extension for references like "ph1" -> "ph1.png"
    const nameWithoutExt = path.basename(file, ext);
    imageMap.set(nameWithoutExt, fullPath);
    imageMap.set(nameWithoutExt.toLowerCase(), fullPath);
  }

  return imageMap;
}

/**
 * Main archive discovery and processing with security validation
 */
export async function discoverArchiveContents(archivePath: string, extractDir: string): Promise<FileDiscoveryResult> {
  logger.info({ archivePath, extractDir }, 'Archive extraction started');

  try {
    // Security: Validate extraction directory is within expected temp location
    const tmpBase = path.resolve(process.cwd(), 'uploads', 'tmp');
    const normalizedExtractDir = path.resolve(extractDir);
    
    if (!normalizedExtractDir.startsWith(tmpBase)) {
      throw new Error('Invalid extraction directory');
    }

    // Extract archive with security validation
    await extractArchive(archivePath, extractDir);
    logger.info({ extractDir }, 'Archive extraction completed');

    // Scan for all files
    const allFiles = await scanDirectory(extractDir);
    logger.info({ fileCount: allFiles.length }, 'Archive file scan completed');

    // Filter relevant files
    const relevantFiles = filterRelevantFiles(allFiles);
    const texFiles = relevantFiles.filter(f => path.extname(f).toLowerCase() === TEX_EXTENSION);

    if (texFiles.length === 0) {
      throw new Error('No LaTeX (.tex) files found in archive');
    }

    // Select primary TeX file
    const primaryTexFile = await selectPrimaryTexFile(extractDir, texFiles);
    if (!primaryTexFile) {
      throw new Error('Failed to select primary TeX file');
    }

    logger.info({ primaryTexFile }, 'Primary TeX file detected');

    // Discover images
    const imagePaths = await discoverImages(extractDir, relevantFiles);

    const supportingFiles = relevantFiles.filter(
      f => f !== primaryTexFile && 
           path.extname(f).toLowerCase() !== '.png' &&
           path.extname(f).toLowerCase() !== '.jpg' &&
           path.extname(f).toLowerCase() !== '.jpeg' &&
           path.extname(f).toLowerCase() !== '.svg'
    );

    return {
      primaryTexFile: path.join(extractDir, primaryTexFile),
      imagePaths,
      allFiles: relevantFiles,
      supportingFiles,
    };
  } catch (err) {
    logger.error({ err, archivePath }, 'Error discovering archive contents');
    throw err;
  }
}

export async function discoverZipContents(zipPath: string, extractDir: string): Promise<FileDiscoveryResult> {
  return discoverArchiveContents(zipPath, extractDir);
}

/**
 * Resolves an image reference to actual file path
 */
export function resolveImagePath(
  reference: string,
  imageMap: Map<string, string>,
  extractDir: string
): string | null {
  if (!reference) return null;

  // Clean reference
  const cleanRef = reference
    .replace(/\{|\}/g, '')
    .replace(/^images\//i, '')
    .trim()
    .toLowerCase();

  if (!cleanRef) return null;

  // Try direct lookup
  if (imageMap.has(cleanRef)) {
    return imageMap.get(cleanRef) || null;
  }

  // Try common variations
  const refWithoutExt = cleanRef.replace(/\.[a-z0-9]+$/i, '');

  const variations = [
    cleanRef,
    refWithoutExt,
    cleanRef.replace(/\s+/g, '_'),
    cleanRef.replace(/\s+/g, '-'),
    refWithoutExt + '.png',
    refWithoutExt + '.jpg',
    refWithoutExt + '.jpeg',
    refWithoutExt + '.svg',
    cleanRef + '.png',
    cleanRef + '.jpg',
    cleanRef + '.jpeg',
    cleanRef + '.svg',
  ];

  for (const variant of variations) {
    if (imageMap.has(variant)) {
      return imageMap.get(variant) || null;
    }
  }

  logger.warn({ reference: cleanRef, availableKeys: Array.from(imageMap.keys()).slice(0, 10) }, 'Image reference not resolved');
  return null;
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.eps': 'application/postscript',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Cleanup extraction directory
 */
export async function cleanupExtraction(extractDir: string): Promise<void> {
  try {
    await rm(extractDir, { recursive: true, force: true });
    logger.debug({ extractDir }, 'Cleaned up extraction directory');
  } catch (err) {
    logger.warn({ err, extractDir }, 'Error cleaning up extraction directory');
  }
}

/**
 * Validates archive file before processing
 */
export async function validateArchiveFile(filePath: string, maxSizeBytes: number = 100 * 1024 * 1024): Promise<boolean> {
  try {
    const fileStats = await stat(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (!ARCHIVE_EXTENSIONS.has(ext)) {
      throw new Error('Unsupported archive format. Only .zip and .rar are allowed.');
    }
    
    if (fileStats.size === 0) {
      throw new Error('Archive file is empty');
    }

    if (fileStats.size > maxSizeBytes) {
      throw new Error(`Archive file exceeds maximum size of ${maxSizeBytes / (1024 * 1024)}MB`);
    }

    // Check magic number for ZIP/RAR file
    const buffer = Buffer.alloc(8);
    const fd = await (await import('fs')).promises.open(filePath, 'r');
    await fd.read(buffer, 0, 8, 0);
    await fd.close();

    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    const isRar =
      buffer[0] === 0x52 &&
      buffer[1] === 0x61 &&
      buffer[2] === 0x72 &&
      buffer[3] === 0x21;

    if (ext === '.zip' && !isZip) {
      throw new Error('Invalid ZIP file format');
    }

    if (ext === '.rar' && !isRar) {
      throw new Error('Invalid RAR file format');
    }

    return true;
  } catch (err) {
    logger.error({ err, filePath }, 'Archive validation failed');
    throw err;
  }
}

export async function validateZipFile(filePath: string, maxSizeBytes: number = 100 * 1024 * 1024): Promise<boolean> {
  return validateArchiveFile(filePath, maxSizeBytes);
}
