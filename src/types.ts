/**
 * 类型定义文件
 * 定义整个项目使用的 TypeScript 接口和类型
 */

/**
 * 配置接口
 */
export interface Config {
  /** API 基础 URL */
  baseUrl: string;
  /** 认证令牌 */
  token: string;
  /** 批次上传大小 */
  batchSize: number;
  /** 每个 blob 最大行数 */
  maxLinesPerBlob: number;
  /** 支持的文本文件扩展名 */
  textExtensions: Set<string>;
  /** 排除模式列表 */
  excludePatterns: string[];
  /** 存储路径 */
  storagePath: string;
  /** 默认项目路径 */
  defaultProject?: string;
}

/**
 * Blob 数据结构
 */
export interface Blob {
  /** 文件路径（相对于项目根目录）*/
  path: string;
  /** 文件内容 */
  content: string;
  /** SHA-256 哈希值（可选，用于标识）*/
  hash?: string;
}

/**
 * 项目元数据
 */
export interface ProjectMetadata {
  /** 项目路径到 blob 哈希列表的映射 */
  [projectPath: string]: string[];
}

/**
 * 索引结果
 */
export interface IndexResult {
  /** 状态：success | partial_success | error */
  status: 'success' | 'partial_success' | 'error';
  /** 结果消息 */
  message: string;
  /** 项目路径 */
  projectPath?: string;
  /** 失败的批次索引 */
  failedBatches?: number[];
  /** 统计信息 */
  stats?: {
    /** 总 blob 数 */
    totalBlobs: number;
    /** 已存在 blob 数 */
    existingBlobs: number;
    /** 新增 blob 数 */
    newBlobs: number;
    /** 跳过 blob 数 */
    skippedBlobs: number;
  };
}

/**
 * 批量上传请求
 */
export interface BatchUploadRequest {
  blobs: Array<{
    path: string;
    content: string;
  }>;
}

/**
 * 批量上传响应
 */
export interface BatchUploadResponse {
  blob_names: string[];
}

/**
 * 搜索请求
 */
export interface SearchRequest {
  /** 用户查询 */
  information_request: string;
  /** Blob 信息 */
  blobs: {
    checkpoint_id: null;
    added_blobs: string[];
    deleted_blobs: string[];
  };
  /** 对话历史 */
  dialog: any[];
  /** 最大输出长度 */
  max_output_length: number;
  /** 是否禁用代码库检索 */
  disable_codebase_retrieval: boolean;
  /** 是否启用提交检索 */
  enable_commit_retrieval: boolean;
}

/**
 * 搜索响应
 */
export interface SearchResponse {
  /** 格式化的检索结果 */
  formatted_retrieval: string;
}

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 初始延迟（毫秒）*/
  retryDelay?: number;
}
