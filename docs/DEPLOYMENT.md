# 运行与部署

## 在线 Demo：GitHub Pages

本仓库的 [Pages Demo](https://hexing-ai.github.io/eight-ball-web/) 提供同屏双人八球，完全在浏览器运行，不依赖云服务器。关闭页面后不会留下房间；刷新重新开始。

维护者将 Pages 的 Build and deployment 设为 **GitHub Actions**。推送 `main` 后，`.github/workflows/pages.yml` 安装锁定依赖，运行类型检查和测试，再构建、发布 `web-dist/`。

```bash
npm ci
npm run build:demo
npm run preview -- --port 5190
```

构建使用相对资源路径，支持 `/eight-ball-web/` 这样的仓库子路径。`build:demo` 和完整版本共用输出目录，每次构建会替换 `web-dist/`；不要将试玩构建误用于完整联网站点。

## 本地完整联网版

```bash
npm ci
npm run dev
```

访问 `http://127.0.0.1:5188/`，在两个标签页建房和加入。开发脚本同时启动前端与后端；按 Ctrl+C 结束。前端默认端口 5188，后端默认端口 2567。

如 5188 被占用，在 macOS/Linux 使用 `DEV_PORT=5189 npm run dev`。如果后端端口需要调整，还需同步修改 `vite.config.ts` 的代理目标。

## 同一 Wi-Fi 手机联调

查出电脑实际局域网 IPv4 地址，下面以 `192.168.1.20` 为示例，必须替换成自己的地址。

macOS/Linux：

```bash
DEV_HOST=0.0.0.0 \
ALLOWED_ORIGINS=http://localhost:5188,http://127.0.0.1:5188,http://192.168.1.20:5188 \
npm run dev
```

PowerShell：

```powershell
$env:DEV_HOST = '0.0.0.0'
$env:ALLOWED_ORIGINS = 'http://localhost:5188,http://127.0.0.1:5188,http://192.168.1.20:5188'
npm run dev
```

手机打开 `http://192.168.1.20:5188/` 并横屏。电脑需要保持运行，Wi-Fi 不应开启访客设备隔离；若系统弹出网络访问提示，按需允许这个开发服务即可，不必关闭整体防火墙。

## 正式联网部署：一个 Node.js 服务

需要 Node.js 22+、支持 WebSocket 的 HTTPS 反向代理和可写数据目录。生产环境**只运行一个实例**。

先构建完整版：

```bash
npm ci
npm run build
```

用实际域名替换示例。macOS/Linux 启动示例：

```bash
NODE_ENV=production \
HOST=0.0.0.0 PORT=2567 \
STATIC_DIR=./web-dist DATA_DIR=./data \
ALLOWED_ORIGINS=https://pool.example.com \
npm start
```

同一个服务提供页面、`/api/*` 与 `/socket/*`，后者同时支持 Colyseus HTTP 握手与 WebSocket Upgrade。前端默认连接当前域名下的 `/socket`，无需跨域构建变量。

Caddy 反向代理示例（DNS 指向宿主机、80/443 可达）：

```caddyfile
pool.example.com {
    reverse_proxy 127.0.0.1:2567
}
```

HTTPS/WSS、域名和端口开放需要在实际宿主环境验证；仓库的 Pages Demo 不会替你部署这个后端。

### 容器方式

Dockerfile 同时打包 Node.js 22 后端和完整前端：

```bash
docker build -t eight-ball-web .
docker run --rm -p 127.0.0.1:2567:2567 \
  -e ALLOWED_ORIGINS=https://pool.example.com \
  -v eight-ball-data:/app/data \
  eight-ball-web
```

容器构建配置已提供；是否已在实际 Docker 环境验收，见[验证记录](FRONTEND_ACCEPTANCE.md)。

### 配置

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `PORT` | `2567` | HTTP/WS 同端口；也支持平台 `_FAAS_RUNTIME_PORT` |
| `HOST` | `0.0.0.0` | 监听地址 |
| `ALLOWED_ORIGINS` | 开发地址 | 生产必填；逗号分隔的精确来源，不能带路径 |
| `STATIC_DIR` | 未设置 | 提供网站时设为 `./web-dist` |
| `DATA_DIR` | `./data` | 结束/中断检查点；必须可写 |
| `SIMULATION_WORKERS` | `2` | 物理 Worker 数 |
| `TURN_SECONDS` | `60` | 回合时限 |
| `RECONNECT_SECONDS` | `60` | 断线恢复窗口 |
| `WAITING_MINUTES` | `30` | 等待/结束房间清理时限 |
| `MAX_ROOMS` | `100` | 房间上限；不是容量测试结论 |

项目不会自动读取 `.env` 文件；上述变量由 shell、进程管理器或容器注入。前后端分域时，构建前设置 `VITE_BACKEND_URL=https://后端域名`，并把前端 Origin 加入后端白名单。

### 上线验收

1. 首页、Worker、静态许可文件、`/healthz`、`/api/config` 可访问。
2. 两台设备建房、加入、准备、出杆，两端球位和判罚一致。
3. 验证 W 松键、手机拉杆取消、高低杆、双准线及自由球。
4. 测试断线重连、退出、认输、重开与服务器重启中断。
5. 在实际公网代理后测试限流和容量。当前 HTTP 限流按 TCP 对端地址计数，代理后用户可能共享限额；不能未经验证就信任任意转发头。

## 状态与费用

当前发布采用 GitHub 仓库与 Pages 静态 Demo，没有开通火山引擎网关、函数或其他收费游戏服务器。完整联网版的服务器由部署者自行选择和维护。
