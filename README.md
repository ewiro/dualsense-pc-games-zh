# DualSense PC 游戏资料库

[![更新数据并部署 GitHub Pages](https://github.com/ewiro/dualsense-pc-games-zh/actions/workflows/pages.yml/badge.svg)](https://github.com/ewiro/dualsense-pc-games-zh/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f766e.svg)](LICENSE)

一个面向中文玩家的 DualSense PC 游戏兼容性索引。项目从 PCGamingWiki 获取数据，只收录明确记录了自适应扳机或 DualSense 触觉反馈的游戏，并提供中文名称、竖版封面、购买平台、商店商品链接、支持型号、连接方式与完整功能适配状态。

**在线访问：** [ewiro.github.io/dualsense-pc-games-zh](https://ewiro.github.io/dualsense-pc-games-zh/)

## 功能

- 中文主标题与英文原名，可同时参与搜索；
- Steam、Epic 购买平台筛选；
- 每个购买平台标签直达对应商店商品页；
- DualSense / DualSense Edge 型号筛选；
- 有线、蓝牙连接方式筛选；
- PlayStation 按键提示、体感、灯条、自适应扳机、DualSense 触觉反馈与手柄小喇叭状态展示及筛选；有额外说明的功能可点击信息图标展开 PCGamingWiki 备注，备注内的参考链接会一并保留；
- 游戏名称链接到 Steam，另提供 PCGamingWiki 数据来源链接；
- 桌面表格、移动卡片和分页；
- 白天 / 黑夜模式，选择会保存在浏览器中；
- 每周自动抓取、校验并部署最新数据。

## 快速开始

需要 Node.js 20 或更高版本。项目不依赖第三方 npm 包。

```powershell
git clone https://github.com/ewiro/dualsense-pc-games-zh.git
cd dualsense-pc-games-zh
npm test
npm run build
```

构建结果位于 `dist/`。如需重新抓取 PCGamingWiki 数据：

```powershell
npm run fetch
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run fetch` | 分页抓取并校验 PCGamingWiki Cargo API 数据 |
| `npm run enrich` | 从游戏页面补充功能状态与说明，并缓存新增说明的中文翻译 |
| `npm test` | 运行数据清洗、合并、保护规则及静态站点 smoke test |
| `npm run build` | 生成可部署的 `dist/` 静态站点 |

## 项目结构

```text
.
├── .github/workflows/pages.yml  # 自动更新与 Pages 部署
├── data/
│   ├── games.json               # 已校验的数据快照
│   └── title-translations.json  # 中英文名称映射
├── scripts/
│   ├── fetch-data.js            # Cargo API 抓取器
│   ├── enrich-features.js       # 游戏页面功能状态补充器
│   ├── note-translations.js      # 功能说明翻译与缓存逻辑
│   ├── feature-note-translations.json # 原文与中文说明缓存
│   ├── data-lib.js              # 清洗、合并与校验逻辑
│   └── build.js                 # 静态构建脚本
├── tests/                       # Node.js 测试
├── index.html
├── app.js
├── styles.css
└── light.css                    # 主题与界面增强样式
```

## 数据更新与保护

抓取器分别分页获取 DualSense 与 DualSense Edge 记录，合并去重后只保留自适应扳机或触觉反馈状态为“支持”“有限支持”“需额外调整”或“始终启用”的游戏。购买平台和商品 ID 来自各游戏页面的 `Availability` 记录；功能状态、模式与说明来自 `Input` 模板。功能说明按原文缓存中文翻译，说明中的 PCGamingWiki 站内链接和外部参考链接会被解析、保留并适配到中文文本，避免浏览器端临时请求翻译服务。PCGamingWiki 暂无稳定的手柄扬声器统一字段，因此仅在页面存在明确控制器扬声器记录时标记支持，其余保留为“未知”。

为避免异常数据被发布，更新流程会拒绝：

- 空响应或格式错误的 API 响应；
- 重复游戏或缺少必要字段的记录；
- 缺少 DualSense 或 DualSense Edge 任一型号的数据；
- 相比上一份同版本快照骤降超过 20% 的结果。

GitHub Actions 在推送到 `main`、手动触发以及每周三北京时间 03:27 时构建和部署站点。定时任务会先更新并提交 `data/games.json`，再发布 GitHub Pages。

## 数据与许可

- 兼容性与封面数据来自 [PCGamingWiki DualSense 列表](https://www.pcgamingwiki.com/wiki/List_of_games_that_support_DualSense)，派生数据遵循 [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/)；
- 中文名称映射的来源与 Apache-2.0 归属见 [data/TITLE_TRANSLATIONS.md](data/TITLE_TRANSLATIONS.md)；
- 项目代码采用 [MIT License](LICENSE)。

## 免责声明

“有线”或“无线（蓝牙）”表示数据源记录的连接方式，不代表本站逐款实测，也不保证两种连接下的自适应扳机、触觉反馈和基础输入表现完全一致。本项目与 Sony、PCGamingWiki、Valve 或 DS5Dongle 作者无隶属关系。
