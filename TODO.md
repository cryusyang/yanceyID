# TODO: 使用 D3.js 替换 Mermaid 渲染思维导图

目标：将 `zettelkasten-navigation` 插件中基于 Mermaid 的卡片笔记思维导图渲染逻辑替换为基于 D3.js 的实现，以提供更好的交互性和性能。

## 1. 准备工作
- [x] 确认 `package.json` 中包含 `d3` 和 `@types/d3` 依赖 (已确认存在)。
- [x] 创建新文件 `src/utils/d3Render.ts` 用于存放 D3.js 相关的渲染逻辑。

## 2. 数据转换逻辑 (`src/utils/d3Render.ts`)
- [x] 实现 `convertZKNodesToTree` 函数：
    - 输入：`ZKNode[]` (扁平数组)。
    - 输出：D3 Hierarchy Node (嵌套对象)。
    - 逻辑：根据 `ZKNode.IDArr` 或 `ZKNode.IDStr` 构建父子关系树。
    - 处理根节点：如果存在多个根节点，可能需要创建一个虚拟根节点。

## 3. D3 渲染实现 (`src/utils/d3Render.ts`)
- [x] 实现 `renderD3MindMap` 函数：
    - 输入：容器 HTMLElement, 数据 TreeData, 配置 Options。
    - 功能：
        - 清空容器。
        - 创建 SVG 元素。
        - 使用 `d3.tree()` 或 `d3.cluster()` 计算布局。
        - 绘制连接线 (Links) - 使用贝塞尔曲线或折线。
        - 绘制节点 (Nodes) - 包含文本、背景框/圆圈。
        - 实现 `d3-zoom` 进行缩放和平移。
    - 样式：
        - 迁移 `styles.css` 中关于节点的样式到 D3 元素。
        - 确保节点宽度自适应文本内容 (可能需要 `foreignObject` 或计算文本宽度)。

## 4. 交互功能迁移
- [x] 在 `renderD3MindMap` 中绑定事件：
    - [x] **点击 (Click)**:
        - 普通点击：不做操作或高亮。
        - Ctrl + 点击：在后台 Tab 打开文件 (`app.workspace.openLinkText`).
        - Alt + 点击：打开局部关系图 (`plugin.openGraphView`).
        - Shift + 点击：设置为当前主笔记 (`plugin.IndexViewInterfaceInit`).
    - [x] **右键 (Context Menu)**:
        - 显示操作菜单 (复制 ID, 复制路径, 执行命令等)。
    - [x] **悬停 (Hover)**:
        - 触发 `hover-link` 事件以显示预览。

## 5. 集成到 `src/view/indexView.ts`
- [x] 修改 `generateFlowchart` 方法：
    - 移除 Mermaid 字符串生成逻辑 (`generateFlowchartStr`).
    - 移除 `addSvgPanZoom` 调用。
    - 调用 `convertZKNodesToTree` 转换数据。
    - 调用 `renderD3MindMap` 渲染图形。
- [x] (可选) 考虑是否保留 Mermaid 作为配置选项，或者完全移除。

## 6. 测试与优化
- [x] 测试不同层级的节点渲染是否正常。
- [x] 测试大量节点时的性能。
- [x] 验证所有交互事件是否工作正常。
- [x] 检查缩放和平移体验。
