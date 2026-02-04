# 简化PVP功能实现计划

## 核心思想

**"用对方的操作替代AI"** - 对手的操作从网络来，而不是AI生成。乐观更新，立即执行，异步写入数据库。

## 当前问题

- 现有PVP系统使用权威服务器架构，过于复杂（~3900行代码）
- 用户操作需要多层确认，响应延迟
- 包含过度设计的功能：状态快照、命令执行队列、复杂重连等

## 简化后的数据流程

```
用户操作 → 立即执行（不等待）→ 异步写入数据库 + Broadcast通知对手
对手操作 → Realtime订阅 → 立即执行（像AI操作一样）
```

---

## 原子任务清单

### 阶段1：准备工作
- [x] 任务1: 创建 `SimplifiedPVPManager.js` - PVP会话管理器
- [x] 任务2: 创建 `OpponentActionHandler.js` - 对手操作处理器（已集成在 SimplifiedPVPManager 中）

### 阶段2：核心修改
- [x] 任务3: 修改 `GameEngine.js` - 实现乐观更新
- [x] 任务4: 修改 `TurnManager.js` - 简化回合切换
- [x] 任务5: 简化 `CommandSender.js` - 改为仅异步写入（已被 SimplifiedPVPManager 替代）

### 阶段3：清理工作
- [x] 任务6: 删除 `AuthorityExecutor.js` 及相关引用
- [x] 任务7: 删除 `GameCommand.js` 及相关引用
- [x] 任务8: 删除 `StateSnapshotManager.js` 及相关引用
- [x] 任务9: 删除 `SyncManager.js`（已被 SimplifiedPVPManager 替代）
- [x] 任务10: 简化 `ReconnectionManager.js`

### 阶段4：测试验证
- [ ] 任务11: 本地测试 - PVP操作流程
- [ ] 任务12: 本地测试 - 回合切换同步
- [ ] 任务13: 本地测试 - 重连机制

### 阶段5：提交
- [x] 任务14: 提交到GitHub

---

## 执行状态

| 任务 | 状态 | 说明 |
|------|------|------|
| 任务1 | 待执行 | 创建 SimplifiedPVPManager.js |
| 任务2 | 待执行 | 创建 OpponentActionHandler.js |
| 任务3 | 待执行 | 修改 GameEngine.js |
| 任务4 | 待执行 | 修改 TurnManager.js |
| 任务5 | 待执行 | 简化 CommandSender.js |
| 任务6 | 待执行 | 删除 AuthorityExecutor.js |
| 任务7 | 待执行 | 删除 GameCommand.js |
| 任务8 | 待执行 | 删除 StateSnapshotManager.js |
| 任务9 | 待执行 | 简化 SyncManager.js |
| 任务10 | 待执行 | 简化 ReconnectionManager.js |
| 任务11 | 待执行 | 本地测试PVP |
| 任务12 | 待执行 | 本地测试回合切换 |
| 任务13 | 待执行 | 本地测试重连 |
| 任务14 | 待执行 | 提交GitHub |

---

## 关键文件清单

### 需要修改的文件
- `src/js/logic/GameEngine.js`
- `src/js/logic/flow/TurnManager.js`
- `src/js/network/CommandSender.js`
- `src/js/network/SyncManager.js`
- `src/js/network/RoomManager.js`
- `src/js/network/ReconnectionManager.js`

### 需要创建的文件
- `src/js/network/SimplifiedPVPManager.js`
- `src/js/network/OpponentActionHandler.js`

### 需要删除的文件
- `src/js/network/AuthorityExecutor.js`
- `src/js/network/GameCommand.js`
- `src/js/network/StateSnapshotManager.js`
