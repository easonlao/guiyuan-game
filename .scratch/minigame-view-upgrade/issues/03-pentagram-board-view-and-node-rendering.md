# 03: 五行法盘视图与十阴阳节点状态渲染 (Pentagram BoardView & Yin-Yang Node Rendering)

**What to build:** 实现五行法盘组件 `BoardView`。基于极坐标自适应排布金木水火土 5 个五行主印及外围 10 个阴阳槽位，实时响应 `TurnManager.getState()` 只读数据，呈现 -1（道损）、0（虚空）、1（点亮）、2（加持）以及“归一/亢极”高亮视觉效果，并绘制相生相克路径动态连线。

**Blocked by:** 01: 极简场景树基座与触控调度 (Scene Graph Core & Input Dispatcher)

**Status:** ready-for-agent

- [ ] `BoardView` 按五行传统方位环形排列五行（木火土金水），绘制外环相生环与内星相克线。
- [ ] 10 个阴阳节点槽位准确清晰地渲染当前状态（-1 道损破损纹、0 虚空暗淡、1 点亮柔光、2 加持炽盛）。
- [ ] 当某元素阴阳双侧均≥1 时，呈现“归一”高亮标识；双侧达 2 时呈现“亢极”标识。
- [ ] 具备单元测试：输入不同的 `BoardState` 快照，断言 `BoardView` 内部各节点槽位属性投影完全正确。
