/**
 * 配置管理模块
 * 负责加载、验证和管理应用配置
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Config } from './types.js';

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  batchSize: 10,
  maxLinesPerBlob: 800,
  textExtensions: new Set([
    '.py', '.js', '.ts', '.jsx', '.tsx',
    '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.go', '.rs', '.rb', '.php',
    '.swift', '.kt', '.scala', '.sh',
    '.md', '.txt', '.json', '.yaml', '.yml',
    '.xml', '.html', '.css', '.scss', '.less',
    '.sql', '.graphql', '.proto', '.toml', '.ini',
  ]),
  excludePatterns: [
    'node_modules',
    '.git',
    '.venv',
    'venv',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    'coverage',
    '.DS_Store',
    '*.pyc',
    '*.pyo',
    '*.pyd',
    '.env',
    '.env.*',
  ],
};

/**
 * 获取用户配置目录路径
 */
export function getConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.mcp-ace');
}

/**
 * 获取存储路径
 */
export function getStoragePath(): string {
  return path.join(getConfigDir(), 'data');
}

/**
 * 获取配置文件路径
 */
export function getConfigFilePath(): string {
  return path.join(getConfigDir(), 'settings.json');
}

/**
 * 确保目录存在
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 从文件加载配置
 */
function loadConfigFromFile(): Partial<Config> {
  const configPath = getConfigFilePath();

  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);

    // 转换 textExtensions 为 Set
    if (parsed.textExtensions && Array.isArray(parsed.textExtensions)) {
      parsed.textExtensions = new Set(parsed.textExtensions);
    }

    return parsed;
  } catch (error) {
    console.error(`加载配置文件失败: ${error}`);
    return {};
  }
}

/**
 * 从环境变量加载配置
 */
function loadConfigFromEnv(): Partial<Config> {
  const config: Partial<Config> = {};

  if (process.env.MCP_ACE_BASE_URL) {
    config.baseUrl = process.env.MCP_ACE_BASE_URL;
  }

  if (process.env.MCP_ACE_TOKEN) {
    config.token = process.env.MCP_ACE_TOKEN;
  }

  if (process.env.MCP_ACE_BATCH_SIZE) {
    config.batchSize = parseInt(process.env.MCP_ACE_BATCH_SIZE, 10);
  }

  if (process.env.MCP_ACE_MAX_LINES_PER_BLOB) {
    config.maxLinesPerBlob = parseInt(process.env.MCP_ACE_MAX_LINES_PER_BLOB, 10);
  }

  return config;
}

/**
 * 验证配置
 */
function validateConfig(config: Config): void {
  if (!config.baseUrl) {
    throw new Error('配置错误: baseUrl 是必需的。请通过环境变量 MCP_ACE_BASE_URL 或命令行参数 --base-url 设置。');
  }

  if (!config.token) {
    throw new Error('配置错误: token 是必需的。请通过环境变量 MCP_ACE_TOKEN 或命令行参数 --token 设置。');
  }

  if (config.batchSize <= 0) {
    throw new Error('配置错误: batchSize 必须大于 0');
  }

  if (config.maxLinesPerBlob <= 0) {
    throw new Error('配置错误: maxLinesPerBlob 必须大于 0');
  }
}

/**
 * 加载配置
 * 优先级: 命令行参数 > 环境变量 > 配置文件 > 默认值
 */
export function loadConfig(cliOptions: Partial<Config> = {}): Config {
  // 确保配置目录存在
  ensureDirectoryExists(getConfigDir());
  ensureDirectoryExists(getStoragePath());

  // 按优先级合并配置
  const fileConfig = loadConfigFromFile();
  const envConfig = loadConfigFromEnv();

  const config: Config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...cliOptions,
    storagePath: getStoragePath(),
  } as Config;

  // 验证配置
  validateConfig(config);

  console.log(`配置已加载: baseUrl=${config.baseUrl}, batchSize=${config.batchSize}, maxLinesPerBlob=${config.maxLinesPerBlob}`);

  return config;
}

/**
 * 保存配置到文件
 */
export function saveConfig(config: Partial<Config>): void {
  ensureDirectoryExists(getConfigDir());

  const configPath = getConfigFilePath();

  // 将 Set 转换为 Array 以便 JSON 序列化
  const serializable = { ...config };
  if (serializable.textExtensions instanceof Set) {
    (serializable as any).textExtensions = Array.from(serializable.textExtensions);
  }

  fs.writeFileSync(configPath, JSON.stringify(serializable, null, 2), 'utf-8');
  console.log(`配置已保存到: ${configPath}`);
}
