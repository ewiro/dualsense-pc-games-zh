# DualSense PC 游戏兼容性中文资料库

面向 [DS5Dongle](https://github.com/awalol/DS5Dongle) 用户的静态中文索引。只保留 [PCGamingWiki DualSense 兼容性列表](https://www.pcgamingwiki.com/wiki/List_of_games_that_support_DualSense) 中有自适应扳机或 DualSense 触觉反馈记录的游戏；仅支持基本游玩、与普通手柄无明显差异的条目会在生成数据时被剔除。

在线地址：启用 Pages 后为 `https://ewiro.github.io/dualsense-pc-games-zh/`。

## 本地运行

需要 Node.js 20 或更高版本，不依赖第三方 npm 包：

```powershell
npm run fetch  # 从 Cargo API 更新 data/games.json
npm test       # 运行合并、清洗、校验和静态 HTTP smoke test
npm run build  # 生成 dist/ 部署目录
```

`npm run fetch` 使用顺序分页请求（每页 500 条），并发送自定义 User-Agent。遇到 429 会根据 `Retry-After` 最多重试三次。发布前会阻止空响应、坏数据、重复游戏、缺少两种型号，以及相较上一次快照骤降超过 20% 的结果。

## GitHub Pages 与自动更新

仓库的 `.github/workflows/pages.yml` 在以下情况运行：

- 推送到 `main`：使用仓库中已经提交的快照构建并部署；
- 手动 `workflow_dispatch`：抓取最新数据、提交 `data/games.json`，然后构建并部署；
- 每周三北京时间 03:27（UTC 周二 19:27）：抓取、校验、提交快照并部署。

第一次启用时，在仓库 Settings → Pages → Build and deployment 中将 Source 设为 **GitHub Actions**。工作流会使用官方 Pages Actions 发布，不需要额外服务器。GitHub 的定时任务可能延迟；公开仓库若连续 60 天没有活动，GitHub 也可能停用 schedule，因此保留了手动触发入口。

## 数据与许可

`data/games.json` 的 `schemaVersion` 为 2，公开记录 `fetchedAt`、来源、筛选规则和 `games[]`。增强功能状态为“支持 / 有限支持 / 需额外调整 / 始终启用”之一时保留。“有线”表示源站记录的连接方式，不代表本站实测；DS5Dongle 的实际兼容性仍应以具体游戏和设备测试为准。

PCGamingWiki 的派生数据依照 [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) 使用并标注来源。本站自行编写的代码依照 [MIT License](LICENSE) 发布。本项目与 Sony、PCGamingWiki 或 DS5Dongle 作者无隶属关系。
