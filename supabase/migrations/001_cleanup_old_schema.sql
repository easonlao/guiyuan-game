-- ============================================
-- 安全清理旧数据库架构
-- ============================================
-- 此脚本会先检查表是否存在，再执行删除
-- ============================================

-- 禁用触发器（避免删除时出错）
SET session_replication_role = replica;

-- 删除旧表（使用 DO 块安全检查）
DO $$
DECLARE
  table_name text;
BEGIN
  -- 检查并删除 moves 表
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'moves') THEN
    DROP TABLE IF EXISTS moves CASCADE;
    RAISE NOTICE 'Deleted table: moves';
  END IF;

  -- 检查并删除 game_states 表
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'game_states') THEN
    DROP TABLE IF EXISTS game_states CASCADE;
    RAISE NOTICE 'Deleted table: game_states';
  END IF;

  -- 检查并删除 rooms 表
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rooms') THEN
    DROP TABLE IF EXISTS rooms CASCADE;
    RAISE NOTICE 'Deleted table: rooms';
  END IF;

  -- 检查并删除 player_scores 表
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'player_scores') THEN
    DROP TABLE IF EXISTS player_scores CASCADE;
    RAISE NOTICE 'Deleted table: player_scores';
  END IF;

  -- 检查并删除新架构表（如果存在）
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'game_moves') THEN
    DROP TABLE IF EXISTS game_moves CASCADE;
    RAISE NOTICE 'Deleted table: game_moves';
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'turn_snapshots') THEN
    DROP TABLE IF EXISTS turn_snapshots CASCADE;
    RAISE NOTICE 'Deleted table: turn_snapshots';
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'game_sessions') THEN
    DROP TABLE IF EXISTS game_sessions CASCADE;
    RAISE NOTICE 'Deleted table: game_sessions';
  END IF;
END
$$;

-- 删除旧函数
DROP FUNCTION IF EXISTS cleanup_old_rooms CASCADE;
DROP FUNCTION IF EXISTS cleanup_abandoned_sessions CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS validate_game_move CASCADE;
DROP FUNCTION IF EXISTS update_session_state_after_move CASCADE;

-- 删除旧触发器（使用 DO 块安全删除）
DO $$
BEGIN
  -- 删除 game_sessions 上的触发器
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'game_sessions') THEN
    DROP TRIGGER IF EXISTS update_game_sessions_updated_at ON game_sessions;
  END IF;

  -- 删除 rooms 上的触发器
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rooms') THEN
    DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
  END IF;

  -- 删除 game_moves 上的触发器
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'game_moves') THEN
    DROP TRIGGER IF EXISTS validate_game_move_trigger ON game_moves;
    DROP TRIGGER IF EXISTS update_session_state_after_move_trigger ON game_moves;
  END IF;
END
$$;

-- 删除旧视图
DROP VIEW IF EXISTS active_games CASCADE;
DROP VIEW IF EXISTS player_game_history CASCADE;

-- 恢复触发器
SET session_replication_role = DEFAULT;

-- ============================================
-- 清理完成
-- ============================================
-- 显示当前剩余的表
SELECT
  table_name,
  'remaining' as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
