/**
 * MCP 搜索上下文工具
 * 提供语义搜索功能，自动执行增量索引
 */

import { IndexManager } from '../manager.js';
import type { Config } from '../types.js';

/**
 * 搜索上下文工具的参数接口
 */
export interface SearchContextArgs {
  project_root_path: string;
  query: string;
}

/**
 * 搜索上下文工具实现
 */
export async function searchContextTool(
  args: SearchContextArgs,
  config: Config
): Promise<string> {
  try {
    // 验证必需参数
    if (!args.project_root_path) {
      return 'Error: project_root_path 参数是必需的';
    }

    if (!args.query) {
      return 'Error: query 参数是必需的';
    }

    // console.log(`执行搜索上下文工具: project=${args.project_root_path}, query=${args.query}`);

    // 创建索引管理器实例
    const manager = new IndexManager(config);

    // 执行搜索（自动包含增量索引）
    const result = await manager.searchContext(args.project_root_path, args.query);

    return result;
  } catch (error) {
    // console.error('搜索上下文工具执行失败:', error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * 工具的 JSON Schema 定义
 */
export const searchContextSchema = {
  name: 'search_context',
  description: '在代码库中搜索相关代码上下文。自动执行增量索引以确保搜索基于最新代码。',
  inputSchema: {
    type: 'object',
    properties: {
      project_root_path: {
        type: 'string',
        description: '项目根目录的绝对路径（使用正斜杠，例如: C:/workspace/myproject）',
      },
      query: {
        type: 'string',
        description: '搜索查询（自然语言描述您要查找的内容）',
      },
    },
    required: ['project_root_path', 'query'],
  },
};