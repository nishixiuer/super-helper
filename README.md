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

## 使用 ngrok 暴露 HTTPS

ngrok 是目前推荐的临时 HTTPS 隧道方式。它比一些匿名隧道更稳定，但需要一个 ngrok 账号和 authtoken。

### 1. 安装 ngrok

macOS + Homebrew：

```bash
brew install ngrok/ngrok/ngrok
```

其他系统可以从 ngrok 官网下载：[ngrok downloads](https://ngrok.com/downloads)

### 2. 配置 authtoken

在 ngrok 控制台获取 authtoken：

```text
https://dashboard.ngrok.com/get-started/your-authtoken
```

然后在本机执行：

```bash
ngrok config add-authtoken <你的 ngrok authtoken>
```

只需要配置一次。不要把 authtoken 提交到 Git。

### 3. 启动本地 MCP 服务

开一个终端，在项目目录运行：

```bash
pnpm install
pnpm dev
```

确认本地服务正常：

```bash
curl http://127.0.0.1:8787/health
```

正常时会看到：

```json
{"ok":true}
```

实际返回里还会包含授权目录和端点信息。

### 4. 启动 ngrok HTTPS 隧道

再开一个终端运行：

```bash
ngrok http 8787
```

ngrok 会显示类似：

```text
Forwarding  https://xxxx.ngrok-free.app -> http://localhost:8787
```

网页端 MCP 服务器 URL 填：

```text
https://xxxx.ngrok-free.app/mcp
```

把 `xxxx.ngrok-free.app` 替换成你终端里实际显示的域名。

### 5. 验证外网地址

```bash
curl https://xxxx.ngrok-free.app/health
```

如果能返回 `ok: true`，说明 HTTPS 隧道已经连到本机 MCP 服务。

### 常见问题

- `ERR_NGROK_4018`: 没有配置 authtoken，先执行 `ngrok config add-authtoken <token>`。
- 网页端填了 URL 但连接失败：确认填的是 `/mcp`，不是 `/health` 或根路径。
- 本地能访问但 ngrok 不能访问：确认 `pnpm dev` 还在运行，且端口是 `8787`。
- 设置了 `AUTH_TOKEN`：网页端需要配置 Bearer Token，否则会返回 `401 Unauthorized`。
