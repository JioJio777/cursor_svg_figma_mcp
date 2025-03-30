
# MCP工具与AI的正确交互方式 - `create_ui_page`功能设计

您的理解是正确的，让我重新阐述MCP工具与AI之间的正确交互方式。

## MCP工具的实际作用

在Model Context Protocol中，MCP工具实际上是作为"指导者"而非"执行者"存在。具体到`create_ui_page`功能：

1. **MCP工具返回提示词和指导**：
   - 当用户请求创建UI页面时，AI会调用`create_ui_page`工具
   - 工具返回标准化的提示词(prompt)和指导信息
   - 这些信息告诉AI应该如何处理用户请求

2. **AI根据提示词执行实际操作**：
   - AI接收到提示词后，明确了应创建什么格式的文件
   - 了解文件应该存储在哪个目录
   - 知道使用什么命名规则
   - 然后AI自己执行创建SVG文件的操作

## 工作流程

1. **用户发起请求**：
   ```
   "创建一个电商网站首页"
   ```

2. **AI识别意图调用MCP工具**：
   ```
   调用create_ui_page工具获取指导
   ```

3. **MCP工具返回提示词**：
   ```
   {
     "directory": "svg_pages",
     "naming_convention": "{page_type}_{unique_id}.svg",
     "index_file": "page_index.json",
     "required_format": "SVG",
     "svg_guidelines": "确保SVG包含适当的ID属性和元数据",
     "figma_sync_required": true,
     ...
   }
   ```

4. **AI根据提示词执行操作**：
   - 检查或创建必要的目录结构
   - 生成SVG内容
   - 按命名规则保存文件
   - 更新索引文件
   - 触发Figma同步

5. **AI向用户报告结果**

## 修改的文件

仍然需要修改以下文件：

1. **src/talk_to_figma_mcp/server.ts**：
   - 添加`create_ui_page` MCP工具函数
   - 该函数返回标准化的提示词和指导
   - 可能还包括必要的目录结构检查逻辑

2. **其他文件**：
   - socket.ts和code.js的功能保持不变
   - 确认这些文件能支持AI直接操作文件和Figma同步

## 提示词内容示例

MCP工具应返回的提示词可能包含：

```
作为AI助手，你需要创建一个新的UI页面：

1. 文件格式要求：
   - 使用SVG格式
   - 确保包含适当的ID属性和元数据
   - 遵循W3C SVG标准

2. 文件存储位置：
   - 检查项目根目录下是否存在'svg_pages'目录
   - 如不存在，创建该目录
   - 将SVG文件保存在此目录中

3. 文件命名规则：
   - 格式为：{page_type}_{unique_id}.svg
   - 例如：homepage_001.svg, login_002.svg

4. 索引文件更新：
   - 检查根目录是否存在'page_index.json'
   - 如不存在，创建基本结构
   - 添加新页面的记录，包含id, name, type, svgFile等字段

5. Figma同步：
   - 创建完SVG文件后，触发Figma同步
   - 通过WebSocket发送到Figma插件
   - 获取返回的Figma ID并更新索引

请基于用户的描述创建相应的SVG，并完成上述所有步骤。
```

这种方式下，MCP工具提供了明确的指导和规范，而AI则负责根据这些指导执行具体操作，形成了一个更加合理的职责分工。
