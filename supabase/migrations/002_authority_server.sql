-- ============================================
-- 权威服务器架构数据库迁移脚本
-- ============================================
-- 版本: 2.0
-- 说明: 重构为权威服务器架构，服务器作为唯一真相源
-- ============================================

-- ============================================
-- 1. 游戏会话表（核心表）
-- ============================================
-- 替换原有的 rooms 表，增加权威状态管理
CREATE TABLE IF NOT EXISTS game_sessions (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 房间信息
  room_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, playing, finished, abandoned

  -- 玩家信息
  player1_id TEXT NOT NULL,
  player2_id TEXT,

  -- 游戏模式
  game_mode INTEGER NOT NULL DEFAULT 0, -- 0: PvP, 1: PvAI, 2: AIvAI

  -- 权威游戏状态（服务器维护的唯一真相）
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 回合信息
  current_turn INTEGER NOT NULL DEFAULT 0,
  current_player TEXT NOT NULL DEFAULT 'P1', -- 'P1' or 'P2'

  -- 先手信息
  first_player TEXT, -- 'P1' or 'P2'
  initiative_confirmed BOOLEAN DEFAULT FALSE,

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,

  -- 胜负信息
  winner TEXT, -- 'P1', 'P2', or 'DRAW'
  win_reason TEXT,

  -- 索引
  CONSTRAINT valid_status CHECK (status IN ('waiting', 'playing', 'finished', 'abandoned')),
  CONSTRAINT valid_game_mode CHECK (game_mode IN (0, 1, 2)),
  CONSTRAINT valid_first_player CHECK (first_player IS NULL OR first_player IN ('P1', 'P2')),
  CONSTRAINT valid_current_player CHECK (current_player IN ('P1', 'P2'))
);

-- 房间码索引（快速查找）
CREATE INDEX IF NOT EXISTS idx_game_sessions_room_code ON game_sessions(room_code);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_player ON game_sessions(player1_id, player2_id);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_game_sessions_updated_at
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. 游戏命令表（核心表）
-- ============================================
-- 存储所有游戏操作命令，服务器验证后执行
CREATE TABLE IF NOT EXISTS game_moves (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联会话
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  -- 命令信息
  command_id TEXT UNIQUE NOT NULL, -- 客户端生成的命令ID（幂等性）
  command_type TEXT NOT NULL, -- ACTION_MOVE, TURN_END, GAME_END
  player_id TEXT NOT NULL,

  -- 回合信息
  turn_number INTEGER NOT NULL,

  -- 命令数据
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 执行状态
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, rejected, executed
  executed_at TIMESTAMPTZ,

  -- 拒绝原因
  rejection_reason TEXT,

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 约束
  CONSTRAINT valid_command_type CHECK (command_type IN ('ACTION_MOVE', 'TURN_END', 'GAME_END', 'INITIATIVE')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'rejected', 'executed'))
);

-- 索引（查询优化）
CREATE INDEX IF NOT EXISTS idx_game_moves_session ON game_moves(session_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_command_id ON game_moves(command_id);
CREATE INDEX IF NOT EXISTS idx_game_moves_turn ON game_moves(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_game_moves_status ON game_moves(status);
CREATE INDEX IF NOT EXISTS idx_game_moves_created ON game_moves(created_at);

-- ============================================
-- 3. 回合状态快照表
-- ============================================
-- 每回合结束保存状态快照，支持断线重连
CREATE TABLE IF NOT EXISTS turn_snapshots (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联会话
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,

  -- 回合信息
  turn_number INTEGER NOT NULL,

  -- 状态快照
  state_snapshot JSONB NOT NULL,

  -- 确认信息（双方都确认后回合才算完成）
  confirmed_by TEXT[], -- ['player1_id', 'player2_id']

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 唯一约束（每会话每回合只有一个快照）
  UNIQUE(session_id, turn_number)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_turn_snapshots_session ON turn_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_turn_snapshots_turn ON turn_snapshots(session_id, turn_number);

-- ============================================
-- 4. 玩家排行榜表（用于排行榜功能）
-- ============================================
CREATE TABLE IF NOT EXISTS player_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT UNIQUE NOT NULL,
  player_name TEXT DEFAULT '玩家',
  total_score INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  game_mode INTEGER DEFAULT 1, -- 0: PvP, 1: PvAI, 2: AIvAI
  last_played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_player_scores_total_score ON player_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_player_scores_player_id ON player_scores(player_id);

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE player_scores;

-- RLS 策略
ALTER TABLE player_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to player_scores" ON player_scores
  FOR ALL USING (true);

-- ============================================
-- 5. 清理函数（定期清理过期数据）
-- ============================================
-- 清理超过24小时的 abandoned 状态会话
CREATE OR REPLACE FUNCTION cleanup_abandoned_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM game_sessions
  WHERE status = 'abandoned'
    AND updated_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. 命令验证触发器
-- ============================================
-- 验证命令合法性（服务器端验证）
CREATE OR REPLACE FUNCTION validate_game_move()
RETURNS TRIGGER AS $$
DECLARE
  session_state JSONB;
  session_current_turn INTEGER;
  session_current_player TEXT;
  session_status TEXT;
  session_player1_id TEXT;
  session_player2_id TEXT;
  expected_player_id TEXT;
BEGIN
  -- 获取会话状态
  SELECT current_state, current_turn, current_player, status, player1_id, player2_id
  INTO session_state, session_current_turn, session_current_player, session_status, session_player1_id, session_player2_id
  FROM game_sessions
  WHERE id = NEW.session_id;

  -- 验证会话存在
  IF session_status IS NULL THEN
    NEW.status = 'rejected';
    NEW.rejection_reason = 'Session not found';
    RETURN NEW;
  END IF;

  -- INITIATIVE 命令特殊处理（允许在 waiting 状态和第 0 回合发送）
  IF NEW.command_type = 'INITIATIVE' THEN
    -- 只有房主（P1）可以发送先手判定命令
    IF NEW.player_id != session_player1_id THEN
      NEW.status = 'rejected';
      NEW.rejection_reason = 'Only host can determine initiative';
      RETURN NEW;
    END IF;

    -- 允许在 waiting 或 playing 状态发送
    NEW.status = 'confirmed';
    RETURN NEW;
  END IF;

  -- 其他命令类型验证
  IF session_status != 'playing' THEN
    NEW.status = 'rejected';
    NEW.rejection_reason = 'Session not in playing status';
    RETURN NEW;
  END IF;

  -- 验证回合匹配
  IF NEW.turn_number != session_current_turn THEN
    NEW.status = 'rejected';
    NEW.rejection_reason = 'Turn mismatch: expected ' || session_current_turn || ', got ' || NEW.turn_number;
    RETURN NEW;
  END IF;

  -- 验证玩家匹配
  IF session_current_player = 'P1' THEN
    expected_player_id := session_player1_id;
  ELSIF session_current_player = 'P2' THEN
    expected_player_id := session_player2_id;
  ELSE
    NEW.status = 'rejected';
    NEW.rejection_reason = 'Invalid current_player role: ' || session_current_player;
    RETURN NEW;
  END IF;

  IF NEW.player_id != expected_player_id THEN
    NEW.status = 'rejected';
    NEW.rejection_reason = 'Not your turn: current role is ' || session_current_player || ' (expected ' || expected_player_id || '), got ' || NEW.player_id;
    RETURN NEW;
  END IF;

  -- 命令通过验证
  NEW.status = 'confirmed';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_game_move_trigger
  BEFORE INSERT ON game_moves
  FOR EACH ROW
  EXECUTE FUNCTION validate_game_move();

-- ============================================
-- 7. 命令执行后更新会话状态
-- ============================================
-- 当命令标记为 executed 时，更新会话的 current_state
CREATE OR REPLACE FUNCTION update_session_state_after_move()
RETURNS TRIGGER AS $$
BEGIN
  -- 只在状态变为 executed 时触发
  IF NEW.status = 'executed' AND OLD.status != 'executed' THEN
    -- 更新会话的当前回合和玩家（由 payload 中的新状态决定）
    UPDATE game_sessions
    SET
      current_state = NEW.payload#>>'{newState}',
      current_turn = NEW.payload#>>'{newTurn}',
      current_player = NEW.payload#>>'{newPlayer}',
      updated_at = NOW()
    WHERE id = NEW.session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_session_state_after_move_trigger
  AFTER UPDATE ON game_moves
  FOR EACH ROW
  WHEN (NEW.status = 'executed')
  EXECUTE FUNCTION update_session_state_after_move();

-- ============================================
-- 8. Realtime 启用
-- ============================================
-- 启用 game_sessions 的 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;

-- 启用 game_moves 的 Realtime（关键：客户端订阅此表接收命令确认）
ALTER PUBLICATION supabase_realtime ADD TABLE game_moves;

-- 启用 turn_snapshots 的 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE turn_snapshots;

-- ============================================
-- 9. RLS 策略（开发阶段完全开放）
-- ============================================
-- 开发阶段：允许所有操作
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE turn_snapshots ENABLE ROW LEVEL SECURITY;

-- 开放所有策略（后续可收紧）
CREATE POLICY "Allow all access to game_sessions" ON game_sessions
  FOR ALL USING (true);

CREATE POLICY "Allow all access to game_moves" ON game_moves
  FOR ALL USING (true);

CREATE POLICY "Allow all access to turn_snapshots" ON turn_snapshots
  FOR ALL USING (true);

-- ============================================
-- 10. 辅助视图
-- ============================================
-- 当前活跃游戏视图
CREATE OR REPLACE VIEW active_games AS
SELECT
  id,
  room_code,
  player1_id,
  player2_id,
  current_turn,
  current_player,
  status,
  created_at
FROM game_sessions
WHERE status IN ('waiting', 'playing')
ORDER BY created_at DESC;

-- 玩家游戏历史视图
CREATE OR REPLACE VIEW player_game_history AS
SELECT
  gs.id,
  gs.room_code,
  gs.player1_id,
  gs.player2_id,
  gs.game_mode,
  gs.status,
  gs.current_turn,
  gs.winner,
  gs.win_reason,
  gs.created_at,
  gs.finished_at
FROM game_sessions gs
WHERE gs.status = 'finished'
ORDER BY gs.finished_at DESC;

-- ============================================
-- 11. 测试数据（可选）
-- ============================================
-- 插入测试玩家分数
INSERT INTO player_scores (player_id, player_name, total_score, best_score, games_played, wins)
VALUES
  ('test_player_1', '测试玩家1', 5000, 800, 50, 25),
  ('test_player_2', '测试玩家2', 4500, 750, 45, 20)
ON CONFLICT (player_id) DO NOTHING;

-- 插入测试用的游戏会话（可选）
-- INSERT INTO game_sessions (room_code, player1_id, game_mode, current_state)
-- VALUES ('TEST01', 'test_player_1', 0, '{"phase": "HOME"}'::jsonb);

-- ============================================
-- 迁移完成
-- ============================================
-- 验证表创建
SELECT
  'game_sessions' as table_name,
  COUNT(*) as row_count
FROM game_sessions
UNION ALL
SELECT
  'game_moves',
  COUNT(*)
FROM game_moves
UNION ALL
SELECT
  'turn_snapshots',
  COUNT(*)
FROM turn_snapshots
UNION ALL
SELECT
  'player_scores',
  COUNT(*)
FROM player_scores;
