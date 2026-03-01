# 🦞 LinkClawCN

<p align="center">
  <img src="docs/assets/openclaw-logo-text.png" alt="LinkClawCN" width="500">
</p>

<p align="center">
  <strong>多通道 AI 网关与个人助手</strong>
</p>

<p align="center">
  <a href="https://github.com/gzxh-ll/linkclawcn/releases">
    <img src="https://img.shields.io/github/v/release/gzxh-ll/linkclawcn?include_prereleases&style=for-the-badge" alt="GitHub release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License">
  </a>
</p>

## 简介

**LinkClawCN** 是一个运行在您自有设备上的**个人 AI 助手**。

它可以在您已使用的通讯渠道上回复您（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、Microsoft Teams、WebChat），还支持 BlueBubbles、Matrix、Zalo 等扩展渠道。它可以在 macOS/iOS/Android 上进行语音对话，并可以渲染您控制的实时 Canvas。Gateway 是控制平面——产品本身就是助手。

如果您想要一个感觉本地、快速、始终在线的个人助手，这就是它。

## 功能特性

- 🌐 **多渠道支持** - WhatsApp、Telegram、Discord、Slack 等
- 🎙️ **语音交互** - 支持 macOS/iOS/Android 语音输入输出
- 🎨 **实时 Canvas** - AI 驱动的可视化交互
- 🔌 **插件扩展** - 支持自定义插件和技能
- 🔒 **本地部署** - 数据保存在本地设备
- ⚡ **快速响应** - 本地运行，无网络延迟

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/gzxh-ll/linkclawcn.git
cd linkclawcn

# 安装依赖
pnpm install

# 构建项目
pnpm build

# 运行初始化向导
pnpm openclaw onboard
```

### Windows 服务安装

```powershell
# 安装为 Windows 服务（用户模式）
openclaw service install

# 安装为 Windows 服务（管理员模式）
openclaw service install --mode machine
```

## 文档

- [中文文档](https://docs.openclaw.ai) - 完整的中文使用指南
- [入门指南](https://docs.openclaw.ai/start/getting-started) - 快速上手
- [配置说明](https://docs.openclaw.ai/gateway/configuration) - 详细配置选项
- [Windows 服务](docs/platforms/windows.md) - Windows 安装指南

## 技术栈

- **运行时**: Node.js 22+
- **包管理器**: pnpm
- **语言**: TypeScript (ESM)
- **测试**: Vitest

## 项目结构

```
linkclawcn/
├── src/              # 源代码
│   ├── cli/          # CLI 命令
│   ├── daemon/       # 网关服务
│   ├── commands/     # 命令实现
│   └── ...
├── apps/             # 应用程序
│   ├── macos/        # macOS 应用
│   ├── ios/          # iOS 应用
│   └── android/      # Android 应用
├── extensions/       # 插件扩展
├── docs/             # 文档
└── scripts/          # 脚本工具
```

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 相关链接

- [官网](https://openclaw.ai)
- [文档](https://docs.openclaw.ai)
- [GitHub](https://github.com/gzxh-ll/linkclawcn)
- [问题反馈](https://github.com/gzxh-ll/linkclawcn/issues)
