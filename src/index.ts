#!/usr/bin/env node

/**
 * MCP 服务器入口
 * 基于 @modelcontextprotocol/sdk 实现的 stdio 服务器
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { searchContextTool, searchContextSchema, SearchContextArgs } from './tools/search-context.js';
import type { Config } from './types.js';

/**
 * 解析命令行参数
 */
function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--base-url' && i + 1 < args.length) {
      config.baseUrl = args[++i];
    } else if (arg === '--token' && i + 1 < args.length) {
      config.token = args[++i];
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      config.batchSize = parseInt(args[++i], 10);
    } else if (arg === '--max-lines' && i + 1 < args.length) {
      config.maxLinesPerBlob = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
ACE-JS - MCP 服务器，用于代码库索引和语义搜索

用法:
  ace-js [选项]

选项:
  --base-url <url>       ACE API 基础 URL (必需)
  --token <token>        认证令牌 (必需)
  --batch-size <n>       批次上传大小 (默认: 10)
  --max-lines <n>        每个 blob 最大行数 (默认: 800)
  --help, -h             显示此帮助信息

环境变量:
  ACE_BASE_URL           与 --base-url 相同
  ACE_TOKEN              与 --token 相同
  ACE_BATCH_SIZE         与 --batch-size 相同
  ACE_MAX_LINES_PER_BLOB 与 --max-lines 相同

配置优先级: 命令行参数 > 环境变量 > 配置文件 > 默认值

配置文件位置: ~/.ace-js/settings.json
      `);
      process.exit(0);
    }
  }

  return config;
}

/**
 * 主函数
 */
async function main() {
  console.error('ACE-JS MCP 服务器启动中...');

  try {
    // 解析命令行参数
    const cliOptions = parseArgs();

    // 加载配置
    const config = loadConfig(cliOptions);

    console.error(`配置已加载: baseUrl=${config.baseUrl}`);

    // 创建 MCP 服务器
    const server = new Server(
      {
        name: 'ace-js',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 注册工具列表处理器
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: searchContextSchema.name,
          description: searchContextSchema.description,
          inputSchema: searchContextSchema.inputSchema as any,
        },
      ];

      return { tools };
    });

    // 注册工具调用处理器
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`收到工具调用: ${name}`);

      if (name === 'search_context') {
        const result = await searchContextTool(args as SearchContextArgs, config);

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      throw new Error(`未知工具: ${name}`);
    });

    // 创建 stdio 传输层
    const transport = new StdioServerTransport();

    // 连接服务器和传输层
    await server.connect(transport);

    console.error('MCP 服务器已启动，等待请求...');

    // 保持进程运行
    process.on('SIGINT', async () => {
      console.error('收到 SIGINT 信号，关闭服务器...');
      await server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('收到 SIGTERM 信号，关闭服务器...');
      await server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
}

// 启动服务器
main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});