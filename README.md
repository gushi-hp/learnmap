# 学习路线图 · LearnMap

输入一个领域，AI 帮你拆解学习路径，可交互的 DAG 图谱。

**纯前端**，三个文件，没有任何构建步骤。

## 在线使用（GitHub Pages）

1. 把这个仓库 fork 到你自己的 GitHub
2. 进入仓库 **Settings → Pages**
3. **Source** 选 `Deploy from a branch`，**Branch** 选 `main` / 根目录 `/ (root)`，保存
4. 几十秒后访问 `https://<你的用户名>.github.io/<仓库名>/` 就能用
5. 首次打开会让你填一个 DeepSeek API Key（在 [DeepSeek 官网](https://platform.deepseek.com/api_keys) 注册免费拿），填完保存到本地浏览器，不会上传服务器

## 本地直接打开

下载这个仓库的 zip，解压后双击 `index.html` 即可。

## 功能

- 输入领域 → AI 发散学习节点
- 点节点上的 ➕ 继续往下钻，叶子节点自动停止
- 拖拽节点（子节点弹簧跟随）/ 滚轮缩放 / 空白处拖拽平移
- Ctrl+Z 撤销
- 左下角控件：放大 / 缩小 / 适应视图 / 一键整理 / 导出 Obsidian Vault / 清空
- 同名节点自动去重，画虚线
- 暗色模式（左上角 ☀ / ☾ 切换）
- 数据保存在浏览器 localStorage，刷新不丢
- 设置面板可调排斥力强度和连线长度

## 导出到 Obsidian

点左下角的 ⤓ 按钮，会下载一个 zip。解压后整个文件夹就是一个 Obsidian Vault：

- 每个节点是一个 `.md` 文件
- 父子关系、关联节点用 `[[wikilink]]` 双向连接
- 用 Obsidian 打开这个文件夹，"图谱视图"会自动重现整张学习路线图

## 文件结构

```
index.html    页面骨架
style.css     样式（毛玻璃 + 暗色 CSS 变量）
app.js        全部逻辑（图谱 + DeepSeek API + 存储）
```

## 隐私

- API Key 只保存在你的浏览器 localStorage
- AI 请求直接从你的浏览器发到 DeepSeek，不经过任何中间服务器
- 学习图谱也只存在 localStorage，不上传任何地方
