# 多人在线文本编辑网站（Google Docs 风格）

这是一个可本地运行的多人实时协作文档网站，核心能力包括：

- Yjs + WebSocket 实时协同编辑（多人同时输入自动合并）
- Quill 富文本编辑器（标题、加粗、列表、链接）
- 文档列表、创建文档、切换文档
- 在线协作者状态显示
- 本地数据库持久化：用户、文档、增量更新、版本快照

## 技术栈

- 前端：Vanilla JS + Quill + Yjs
- 后端：Node.js + Express + y-websocket
- 存储：JSON 文件数据库（`data/db.json`）

> 你给出的 MySQL 设计思想已保留为同名逻辑表结构（users/documents/document_updates/version_history），在本项目中用 JSON 文件实现，方便直接运行。后续如需切换 MySQL，只需要将这些表结构映射到 SQL 即可。

## 本地启动

```bash
npm install
npm start
```

启动后打开：

- `http://localhost:3000`

## 数据模型（对应你给出的数据库设计）

项目在 `data/db.json` 中维护以下逻辑表：

- `users`
- `documents`
- `document_updates`
- `version_history`

说明：

- 文档实时内容以 **Yjs 增量 update** 保存在 `document_updates`
- WebSocket 会话结束时会自动写入 `version_history` 快照
