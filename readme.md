# SVG-Figma 双向同步桥接工具

一个实现SVG文件与Figma设计之间双向同步的工具。它允许您以SVG格式创建UI页面，并将它们导入到Figma中进行编辑，同时也可以将Figma中的修改导出回SVG文件。

## 演示视频

查看我们的演示视频，了解工具的基本功能和使用方法：

[![演示视频](https://i0.hdslb.com/bfs/archive/video_image_cover.jpg)](https://www.bilibili.com/video/BV1rodZYLEbr/)

🔗 [在哔哩哔哩观看](https://www.bilibili.com/video/BV1rodZYLEbr/)

## 功能特点

- 通过频道系统实现与Figma的实时通信
- 以SVG格式创建复杂UI界面
- 将SVG文件无缝导入Figma
- 将Figma中的修改导出回本地SVG文件
- 自动维护设计页面索引系统
- 支持多种类型的UI页面创建

## 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/cursor_svg_figma_mcp.git
cd cursor_svg_figma_mcp

# 安装依赖
npm install
```

## 快速开始

首先，安装Bun（如果尚未安装）：

```bash
curl -fsSL https://bun.sh/install | bash
```

运行setup，这将同时在您的Cursor活动项目中安装MCP：

```bash
bun setup
```

启动Websocket服务器：

```bash
bun socket
```

### 配置Figma插件

1. 下载Figma客户端并登录
2. 创建一个新文件或打开现有文件
3. 点击菜单中的"Plugins" > "Development" > "Import plugin from manifest..."

![Figma插件导入](images/figma_import_plugin.png)

4. 选择项目中的manifest.json文件
5. 导入成功后，点击"Run"使用插件
6. 在插件界面中点击"Connect"连接到Websocket服务器



## 目录结构

```
├── svg_pages/                # SVG文件和索引存储目录
│   ├── page_index.json       # 页面索引文件
│   ├── 页面名称_ID.svg       # SVG页面文件
├── src/                      # 源代码目录
├── scripts/                  # 辅助脚本
├── images/                   # 图片资源
```

## 工作流程

1. 创建新的UI页面或加入现有频道
2. 编辑SVG或将SVG导入Figma进行编辑
3. 在Figma中进行设计修改
4. 将修改从Figma导出回SVG文件
5. 通过索引系统管理所有UI页面

## 技术细节

- 使用SVG作为设计文件的基础格式
- 通过MCP（消息通道协议）实现与Figma的通信
- 自动生成唯一ID以关联SVG文件和Figma节点
- 索引系统跟踪所有页面及其对应的Figma节点ID

## 许可证

MIT

## 贡献

欢迎提交Pull Request或创建Issue来改进此项目。
