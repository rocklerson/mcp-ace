/**
 * 索引管理器
 * 负责代码库的索引和搜索功能
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import type {
  Config,
  Blob,
  ProjectMetadata,
  IndexResult,
  BatchUploadRequest,
  BatchUploadResponse,
  SearchRequest,
  SearchResponse,
  RetryOptions,
} from './types.js';

/**
 * 索引管理器类
 */
export class IndexManager {
  private config: Config;
  private projectsFile: string;

  constructor(config: Config) {
    this.config = config;
    this.projectsFile = path.join(config.storagePath, 'projects.json');
  }

  /**
   * 计算 blob 哈希值（SHA-256）
   */
  private calculateHash(filePath: string, content: string): string {
    const hasher = crypto.createHash('sha256');
    hasher.update(filePath);
    hasher.update(content);
    return hasher.digest('hex');
  }

  /**
   * 规范化路径（使用正斜杠）
   */
  private normalizePath(filePath: string): string {
    return path.resolve(filePath).replace(/\\/g, '/');
  }

  /**
   * 判断路径是否应该被排除
   */
  private shouldExclude(filePath: string, rootPath: string): boolean {
    try {
      const relativePath = path.relative(rootPath, filePath);
      const parts = relativePath.split(path.sep);

      for (const pattern of this.config.excludePatterns) {
        // 检查路径的每个部分
        for (const part of parts) {
          if (this.matchPattern(part, pattern)) {
            return true;
          }
        }

        // 检查完整相对路径
        if (this.matchPattern(relativePath, pattern)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 简单的通配符匹配
   */
  private matchPattern(str: string, pattern: string): boolean {
    // 将通配符模式转换为正则表达式
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }

  /**
   * 分割文件内容
   */
  private splitFileContent(filePath: string, content: string): Blob[] {
    const lines = content.split('\n');
    const totalLines = lines.length;

    // 文件在限制内，返回单个 blob
    if (totalLines <= this.config.maxLinesPerBlob) {
      return [{ path: filePath, content }];
    }

    // 分割成多个 blobs
    const blobs: Blob[] = [];
    const numChunks = Math.ceil(totalLines / this.config.maxLinesPerBlob);

    for (let i = 0; i < numChunks; i++) {
      const start = i * this.config.maxLinesPerBlob;
      const end = Math.min(start + this.config.maxLinesPerBlob, totalLines);
      const chunkLines = lines.slice(start, end);
      const chunkContent = chunkLines.join('\n');

      const chunkPath = `${filePath}#chunk${i + 1}of${numChunks}`;
      blobs.push({ path: chunkPath, content: chunkContent });
    }

    console.log(`文件 ${filePath} (${totalLines} 行) 分割为 ${numChunks} 个片段`);
    return blobs;
  }

  /**
   * 递归收集项目中的所有文本文件
   */
  private async collectFiles(projectPath: string): Promise<Blob[]> {
    const blobs: Blob[] = [];
    let excludedCount = 0;

    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // 检查是否应该排除
        if (this.shouldExclude(fullPath, projectPath)) {
          excludedCount++;
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();

          // 检查文件扩展名
          if (!this.config.textExtensions.has(ext)) {
            continue;
          }

          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const relativePath = path.relative(projectPath, fullPath);

            // 分割文件（如有必要）
            const fileBlobs = this.splitFileContent(relativePath, content);
            blobs.push(...fileBlobs);
          } catch (error) {
            console.warn(`读取文件失败: ${fullPath}`, error);
          }
        }
      }
    };

    if (!fs.existsSync(projectPath)) {
      throw new Error(`项目路径不存在: ${projectPath}`);
    }

    walkDir(projectPath);

    console.log(`收集了 ${blobs.length} 个 blobs（排除 ${excludedCount} 个文件/目录）`);
    return blobs;
  }

  /**
   * 加载项目元数据
   */
  private loadProjects(): ProjectMetadata {
    if (!fs.existsSync(this.projectsFile)) {
      return {};
    }

    try {
      const content = fs.readFileSync(this.projectsFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('加载项目元数据失败:', error);
      return {};
    }
  }

  /**
   * 保存项目元数据
   */
  private saveProjects(projects: ProjectMetadata): void {
    try {
      const dir = path.dirname(this.projectsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
    } catch (error) {
      console.error('保存项目元数据失败:', error);
      throw error;
    }
  }

  /**
   * 带重试的请求
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const retryDelay = options.retryDelay ?? 1000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // 判断是否是可重试的错误
        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          const isRetryable =
            axiosError.code === 'ECONNABORTED' ||
            axiosError.code === 'ETIMEDOUT' ||
            axiosError.code === 'ECONNREFUSED' ||
            axiosError.response?.status === 429 ||
            (axiosError.response?.status ?? 0) >= 500;

          if (!isRetryable) {
            throw error;
          }
        }

        if (attempt < maxRetries - 1) {
          const waitTime = retryDelay * Math.pow(2, attempt);
          console.warn(`请求失败 (尝试 ${attempt + 1}/${maxRetries}): ${lastError.message}. 将在 ${waitTime}ms 后重试...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error(`请求在 ${maxRetries} 次尝试后失败`);
    throw lastError;
  }

  /**
   * 索引项目（增量索引）
   */
  async indexProject(projectPath: string): Promise<IndexResult> {
    const normalizedPath = this.normalizePath(projectPath);
    console.log(`开始索引项目: ${normalizedPath}`);

    try {
      // 步骤 1: 收集所有文件
      const blobs = await this.collectFiles(projectPath);

      if (blobs.length === 0) {
        return {
          status: 'error',
          message: '项目中未找到文本文件',
        };
      }

      // 步骤 2: 加载已有索引
      const projects = this.loadProjects();
      const existingHashes = new Set(projects[normalizedPath] || []);

      // 步骤 3: 计算所有 blob 的哈希
      const blobHashMap = new Map<string, Blob>();
      for (const blob of blobs) {
        const hash = this.calculateHash(blob.path, blob.content);
        blob.hash = hash;
        blobHashMap.set(hash, blob);
      }

      // 步骤 4: 集合运算找出新增 blob
      const currentHashes = new Set(blobHashMap.keys());
      const unchangedHashes = new Set(
        Array.from(currentHashes).filter((h) => existingHashes.has(h))
      );
      const newHashes = new Set(
        Array.from(currentHashes).filter((h) => !existingHashes.has(h))
      );

      const blobsToUpload = Array.from(newHashes).map((h) => blobHashMap.get(h)!);

      console.log(`增量索引: total=${blobs.length}, existing=${unchangedHashes.size}, new=${newHashes.size}`);

      // 步骤 5: 批量上传新 blob
      const uploadedHashes: string[] = [];
      const failedBatches: number[] = [];

      if (blobsToUpload.length > 0) {
        const totalBatches = Math.ceil(blobsToUpload.length / this.config.batchSize);
        console.log(`上传 ${blobsToUpload.length} 个新 blobs，分 ${totalBatches} 批（批次大小=${this.config.batchSize}）`);

        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
          const start = batchIdx * this.config.batchSize;
          const end = Math.min(start + this.config.batchSize, blobsToUpload.length);
          const batchBlobs = blobsToUpload.slice(start, end);

          console.log(`上传批次 ${batchIdx + 1}/${totalBatches} (${batchBlobs.length} blobs)`);

          try {
            const uploadBatch = async () => {
              const payload: BatchUploadRequest = {
                blobs: batchBlobs.map((b) => ({ path: b.path, content: b.content })),
              };

              const response = await axios.post<BatchUploadResponse>(
                `${this.config.baseUrl}/batch-upload`,
                payload,
                {
                  headers: {
                    Authorization: `Bearer ${this.config.token}`,
                    'Content-Type': 'application/json',
                  },
                  timeout: 30000,
                }
              );

              return response.data;
            };

            const result = await this.retryRequest(uploadBatch, { maxRetries: 3, retryDelay: 1000 });

            if (result.blob_names && result.blob_names.length > 0) {
              uploadedHashes.push(...result.blob_names);
              console.log(`批次 ${batchIdx + 1} 上传成功，获得 ${result.blob_names.length} 个 blob 名称`);
            } else {
              console.warn(`批次 ${batchIdx + 1} 未返回 blob 名称`);
              failedBatches.push(batchIdx + 1);
            }
          } catch (error) {
            console.error(`批次 ${batchIdx + 1} 失败:`, error);
            failedBatches.push(batchIdx + 1);
          }
        }
      } else {
        console.log('无需上传，所有 blobs 已存在于索引中');
      }

      // 步骤 6: 合并并保存索引
      const allHashes = Array.from(unchangedHashes).concat(uploadedHashes);
      projects[normalizedPath] = allHashes;
      this.saveProjects(projects);

      const status = failedBatches.length === 0 ? 'success' : 'partial_success';
      const message =
        blobsToUpload.length > 0
          ? `项目已索引，共 ${allHashes.length} 个 blobs (已存在: ${unchangedHashes.size}, 新增: ${uploadedHashes.length})`
          : `项目已索引，共 ${allHashes.length} 个 blobs (全部已存在，无需上传)`;

      console.log(message);

      return {
        status,
        message,
        projectPath: normalizedPath,
        failedBatches,
        stats: {
          totalBlobs: allHashes.length,
          existingBlobs: unchangedHashes.size,
          newBlobs: uploadedHashes.length,
          skippedBlobs: unchangedHashes.size,
        },
      };
    } catch (error) {
      console.error(`索引项目失败:`, error);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 搜索代码上下文
   */
  async searchContext(projectPath: string, query: string): Promise<string> {
    const normalizedPath = this.normalizePath(projectPath);
    console.log(`搜索项目 ${normalizedPath}，查询: ${query}`);

    try {
      // 步骤 1: 自动执行增量索引
      console.log(`搜索前自动索引项目...`);
      const indexResult = await this.indexProject(projectPath);

      if (indexResult.status === 'error') {
        return `Error: 索引失败. ${indexResult.message}`;
      }

      if (indexResult.stats) {
        console.log(`自动索引完成: total=${indexResult.stats.totalBlobs}, existing=${indexResult.stats.existingBlobs}, new=${indexResult.stats.newBlobs}`);
      }

      // 步骤 2: 加载已索引的 blob 名称
      const projects = this.loadProjects();
      const blobNames = projects[normalizedPath] || [];

      if (blobNames.length === 0) {
        return `Error: 索引后未找到 blobs`;
      }

      // 步骤 3: 执行搜索
      console.log(`执行搜索，共 ${blobNames.length} 个 blobs...`);

      const searchRequest = async () => {
        const payload: SearchRequest = {
          information_request: query,
          blobs: {
            checkpoint_id: null,
            added_blobs: blobNames,
            deleted_blobs: [],
          },
          dialog: [],
          max_output_length: 0,
          disable_codebase_retrieval: false,
          enable_commit_retrieval: false,
        };

        const response = await axios.post<SearchResponse>(
          `${this.config.baseUrl}/agents/codebase-retrieval`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${this.config.token}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
          }
        );

        return response.data;
      };

      const result = await this.retryRequest(searchRequest, { maxRetries: 3, retryDelay: 2000 });

      const formattedRetrieval = result.formatted_retrieval || '';

      if (!formattedRetrieval) {
        console.warn('搜索返回空结果');
        return '未找到与您的查询相关的代码上下文';
      }

      console.log(`搜索完成`);
      return formattedRetrieval;
    } catch (error) {
      console.error(`搜索失败:`, error);
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
