# 超级本地链接助手 MCP

一个给网页端连接的本地 MCP 服务。它只允许访问 `.env` 里配置的目录，用于让 ChatGPT 一类客户端列目录、搜索文件、读取文本、读取图片/音频，并可选开启写入。

## 快速开始

```bash
pnpm install
pnpm dev
```

默认服务地址：

- Streamable HTTP: `http://127.0.0.1:8787/mcp`
- 兼容 SSE: `http://127.0.0.1:8787/sse`
- 健康检查: `http://127.0.0.1:8787/health`

网页端的新 MCP 连接通常优先填写 `/mcp`。如果客户端只支持 SSE，再填写 `/sse`。

## 配置

复制或直接编辑 `.env`：

```bash
PORT=8787
HOST=127.0.0.1
ALLOWED_DIRECTORIES=/Users/you/Projects,/Users/you/Documents/Notes
AUTH_TOKEN=
ALLOW_WRITE=false
MAX_READ_BYTES=1048576
MAX_SEARCH_RESULTS=200
```

关键配置：

- `ALLOWED_DIRECTORIES`: 逗号分隔的本机目录白名单。所有工具都会校验真实路径，目录外的路径会被拒绝。
- `AUTH_TOKEN`: 可选 Bearer Token。设置后客户端请求需要带 `Authorization: Bearer <token>`。
- `ALLOW_WRITE`: 默认 `false`。只有设为 `true` 才启用写文件和创建目录。
- `MAX_READ_BYTES`: 单次文本或媒体读取上限。

## 提供的工具

- `list_allowed_directories`: 列出当前授权目录。
- `list_directory`: 列目录。
- `get_file_info`: 查看文件或目录信息。
- `read_text_file`: 读取 UTF-8 文本文件。
- `read_media_file`: 读取图片或音频。
- `search_files`: 按名称搜索文件和目录。
- `write_text_file`: 写入文本文件，需要 `ALLOW_WRITE=true`。
- `create_directory`: 创建目录，需要 `ALLOW_WRITE=true`。
- `search`: 连接器风格搜索工具，返回可 fetch 的本地文件 id。
- `fetch`: 连接器风格获取工具，读取 `search` 返回的文件。

## 在网页端填写

本机直接测试可填：

```text
http://127.0.0.1:8787/mcp
```

如果网页端运行在云端，`127.0.0.1` 指的是云端而不是你的电脑，需要用 ngrok、Cloudflare Tunnel、Tailscale Funnel 等方式把本机端口暴露成 HTTPS 地址，再填写：

```text
https://your-domain.example/mcp
```

认证方式没有设置 `AUTH_TOKEN` 时选择无认证；如果设置了 `AUTH_TOKEN`，选择能发送 Bearer Token 的认证方式。
