var GuiyuanMiniGame = (function(exports) {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  var WuXing = /* @__PURE__ */ ((WuXing2) => {
    WuXing2["WOOD"] = "WOOD";
    WuXing2["FIRE"] = "FIRE";
    WuXing2["EARTH"] = "EARTH";
    WuXing2["METAL"] = "METAL";
    WuXing2["WATER"] = "WATER";
    return WuXing2;
  })(WuXing || {});
  var Polarity = /* @__PURE__ */ ((Polarity2) => {
    Polarity2["YIN"] = "yin";
    Polarity2["YANG"] = "yang";
    return Polarity2;
  })(Polarity || {});
  function getOppositePolarity(polarity) {
    return polarity === "yang" ? "yin" : "yang";
  }
  var ActionType = /* @__PURE__ */ ((ActionType2) => {
    ActionType2["AUTO"] = "AUTO";
    ActionType2["CONVERT"] = "CONVERT";
    ActionType2["TRANS"] = "TRANS";
    ActionType2["ATK"] = "ATK";
    ActionType2["BURST"] = "BURST";
    ActionType2["BURST_ATK"] = "BURST_ATK";
    ActionType2["DISSIPATE"] = "DISSIPATE";
    ActionType2["PASS"] = "PASS";
    return ActionType2;
  })(ActionType || {});
  const TIAN_GAN_LIST = [
    {
      name: "甲",
      element: "WOOD",
      polarity: "yang"
      /* YANG */
    },
    {
      name: "乙",
      element: "WOOD",
      polarity: "yin"
      /* YIN */
    },
    {
      name: "丙",
      element: "FIRE",
      polarity: "yang"
      /* YANG */
    },
    {
      name: "丁",
      element: "FIRE",
      polarity: "yin"
      /* YIN */
    },
    {
      name: "戊",
      element: "EARTH",
      polarity: "yang"
      /* YANG */
    },
    {
      name: "己",
      element: "EARTH",
      polarity: "yin"
      /* YIN */
    },
    {
      name: "庚",
      element: "METAL",
      polarity: "yang"
      /* YANG */
    },
    {
      name: "辛",
      element: "METAL",
      polarity: "yin"
      /* YIN */
    },
    {
      name: "壬",
      element: "WATER",
      polarity: "yang"
      /* YANG */
    },
    {
      name: "癸",
      element: "WATER",
      polarity: "yin"
      /* YIN */
    }
  ];
  const GENERATION_CYCLE = {
    [
      "WOOD"
      /* WOOD */
    ]: "FIRE",
    [
      "FIRE"
      /* FIRE */
    ]: "EARTH",
    [
      "EARTH"
      /* EARTH */
    ]: "METAL",
    [
      "METAL"
      /* METAL */
    ]: "WATER",
    [
      "WATER"
      /* WATER */
    ]: "WOOD"
    /* WOOD */
  };
  const OVERCOMING_CYCLE = {
    [
      "WOOD"
      /* WOOD */
    ]: "EARTH",
    [
      "EARTH"
      /* EARTH */
    ]: "WATER",
    [
      "WATER"
      /* WATER */
    ]: "FIRE",
    [
      "FIRE"
      /* FIRE */
    ]: "METAL",
    [
      "METAL"
      /* METAL */
    ]: "WOOD"
    /* WOOD */
  };
  function createEmptyBoard() {
    return {
      [WuXing.WOOD]: { yin: 0, yang: 0 },
      [WuXing.FIRE]: { yin: 0, yang: 0 },
      [WuXing.EARTH]: { yin: 0, yang: 0 },
      [WuXing.METAL]: { yin: 0, yang: 0 },
      [WuXing.WATER]: { yin: 0, yang: 0 }
    };
  }
  function createInitialPlayer() {
    return {
      score: 0,
      board: createEmptyBoard()
    };
  }
  function createInitialGameState(maxRounds = 30) {
    return {
      round: 1,
      maxRounds,
      currentPlayer: "P1",
      players: {
        P1: createInitialPlayer(),
        P2: createInitialPlayer()
      },
      currentTianGan: null,
      isGameOver: false,
      winner: null,
      endReason: null,
      lockedGuiYuan: {
        P1: false,
        P2: false
      }
    };
  }
  function isNodeGuiYi(node) {
    return node.yin >= 1 && node.yang >= 1;
  }
  function isNodeKangJi(node) {
    return node.yin === 2 && node.yang === 2;
  }
  function isBoardGuiYuan(board) {
    const elements = Object.values(WuXing);
    return elements.every((element) => isNodeGuiYi(board[element]));
  }
  function countLightedSides(board) {
    let count = 0;
    for (const element of Object.values(WuXing)) {
      if (board[element].yin >= 1) count++;
      if (board[element].yang >= 1) count++;
    }
    return count;
  }
  function countUnlightedSides(board) {
    return 10 - countLightedSides(board);
  }
  function isBoardTingPai(board) {
    return countUnlightedSides(board) === 1;
  }
  function getUnlightedSide(board) {
    let unlighted = null;
    let count = 0;
    for (const element of Object.values(WuXing)) {
      if (board[element].yin < 1) {
        unlighted = { element, polarity: Polarity.YIN };
        count++;
      }
      if (board[element].yang < 1) {
        unlighted = { element, polarity: Polarity.YANG };
        count++;
      }
    }
    return count === 1 ? unlighted : null;
  }
  function canTianGanLightUnlightedSide(board, tianGan) {
    const unlighted = getUnlightedSide(board);
    if (!unlighted) {
      return false;
    }
    const { element: targetElement, polarity: targetPolarity } = unlighted;
    const targetCurrentLevel = board[targetElement][targetPolarity];
    if (targetCurrentLevel + 1 < 1) {
      return false;
    }
    if (tianGan.element === targetElement && tianGan.polarity === targetPolarity) {
      return true;
    }
    if (tianGan.element === targetElement && // Stryker disable next-line ConditionalExpression: AUTO 未命中时五行相等即蕴含极性相反，第二个操作数恒真（等价）
    tianGan.polarity !== targetPolarity && // Stryker disable next-line ConditionalExpression: 唯一未点亮侧的对侧必定 >= 1，否则未点亮侧数会是 2（等价）
    board[targetElement][tianGan.polarity] >= 1) {
      return true;
    }
    if (tianGan.polarity === Polarity.YIN && GENERATION_CYCLE[tianGan.element] === targetElement) {
      if (targetPolarity === Polarity.YIN) {
        return true;
      }
      if (targetPolarity === Polarity.YANG && board[targetElement].yin === 2) {
        return true;
      }
    }
    return false;
  }
  function clampNodeLevel(level) {
    if (level <= -1) return -1;
    if (level >= 2) return 2;
    return level;
  }
  function countBoardDamage(board) {
    let count = 0;
    for (const element of Object.values(WuXing)) {
      if (board[element].yin === -1) count++;
      if (board[element].yang === -1) count++;
    }
    return count;
  }
  function countBoardGuiYi(board) {
    let count = 0;
    for (const element of Object.values(WuXing)) {
      if (isNodeGuiYi(board[element])) count++;
    }
    return count;
  }
  const GUI_YI_MILESTONE = 60;
  const DAMAGE_PENALTY = 50;
  const POINTS_CONFIG = {
    // 【行为分】执行动作的基础分
    ACTION: {
      AUTO: 0,
      CONVERT: 50,
      TRANS: 30,
      ATK: 40,
      BURST: 100,
      BURST_ATK: 80
    },
    // 【状态分】节点状态变化的分数（已硬编码 2.5 倍攻击压制得分）
    STATE_CHANGE: {
      // 己方建设提升
      REPAIR_DMG: { yang: 200, yin: 200 },
      // -1 -> 0 修复道损
      LIGHT_UP: 100,
      // 0 -> 1 点亮虚空
      BLESSING: 200,
      // 1 -> 2 加持（归一）
      // 敌方状态破坏（2.5倍强化）
      CAUSE_DMG: { yang: 300, yin: 250 },
      // 0 -> -1 致道损
      BREAK_LIGHT: { yang: 200, yin: 150 },
      // 1 -> 0 破点亮
      WEAKEN: 200
      // 2 -> 1 削弱加持
    },
    // 节点归一里程碑奖励分
    GUI_YI_MILESTONE: 60,
    // 终局残留道损扣分
    DAMAGE_PENALTY: 50,
    // 攻击进度定价（ticket 06 采纳 ticket 05 候选 A）：
    // 攻击状态分乘以 floor + span × (行动前对手归一节点数 / 5)，
    // 让压制的相对回报随对手归一进度上升、在对手尚未归一时下降。
    // 采纳记录与四标准证据见 docs/adr/0011-balance-route-fix-rules.md 追加节。
    ATTACK_PROGRESS_SCALE: { floor: 0.3, span: 0.9 }
  };
  class ScoreCalculator {
    constructor(config = POINTS_CONFIG) {
      __publicField(this, "config");
      this.config = config;
    }
    get guiYiMilestone() {
      return this.config.GUI_YI_MILESTONE ?? GUI_YI_MILESTONE;
    }
    get damagePenalty() {
      return this.config.DAMAGE_PENALTY ?? DAMAGE_PENALTY;
    }
    /**
     * 计算节点归一里程碑奖励分
     * @param count 达成归一的节点数量（增量）
     */
    calculateGuiYiMilestonePoints(count) {
      return count * this.guiYiMilestone;
    }
    /**
     * 计算终局道损扣分
     * @param damageCount 残留道损总数量（每个阴或阳为 -1 记 1 个道损）
     */
    calculateDamagePenalty(damageCount) {
      return damageCount * this.damagePenalty;
    }
    /**
     * 计算指定动作的行为基础分
     */
    calculateActionPoints(actionType) {
      const actionPoints = this.config.ACTION;
      return actionPoints[actionType] ?? 0;
    }
    /**
     * 攻击进度定价系数（ticket 05 候选 A）。
     *
     * 以行动前对手盘面已归一节点数（0–5）线性插值：`floor + span × (count / 5)`。
     * 未配置 `ATTACK_PROGRESS_SCALE` 时返回恒等 1。调用方负责四舍五入与只作用于攻击状态分。
     */
    attackProgressScale(opponentGuiYiCount) {
      const scale = this.config.ATTACK_PROGRESS_SCALE;
      if (!scale) {
        return 1;
      }
      return scale.floor + scale.span * (opponentGuiYiCount / 5);
    }
    /**
     * 根据节点等级跃迁与极性计算状态变化分
     * @param prevLevel 变化前等级
     * @param newLevel 变化后等级
     * @param polarity 极性 (YANG / YIN)
     * @param isAttack 是否为对敌方的攻击破坏
     */
    calculateTransitionPoints(prevLevel, newLevel, polarity = Polarity.YANG, isAttack = false) {
      if (prevLevel === newLevel) {
        return 0;
      }
      if (isAttack) {
        if (prevLevel === 0 && newLevel === -1) {
          return polarity === Polarity.YANG ? this.config.STATE_CHANGE.CAUSE_DMG.yang : this.config.STATE_CHANGE.CAUSE_DMG.yin;
        }
        if (prevLevel === 1 && newLevel === 0) {
          return polarity === Polarity.YANG ? this.config.STATE_CHANGE.BREAK_LIGHT.yang : this.config.STATE_CHANGE.BREAK_LIGHT.yin;
        }
        if (prevLevel === 2 && newLevel === 1) {
          return this.config.STATE_CHANGE.WEAKEN;
        }
        return 0;
      }
      if (prevLevel === -1 && newLevel === 0) {
        return polarity === Polarity.YANG ? this.config.STATE_CHANGE.REPAIR_DMG.yang : this.config.STATE_CHANGE.REPAIR_DMG.yin;
      }
      if (prevLevel === 0 && newLevel === 1) {
        return this.config.STATE_CHANGE.LIGHT_UP;
      }
      if (prevLevel === 1 && newLevel === 2) {
        return this.config.STATE_CHANGE.BLESSING;
      }
      return 0;
    }
  }
  __publicField(ScoreCalculator, "GUI_YI_MILESTONE", 60);
  __publicField(ScoreCalculator, "DAMAGE_PENALTY", 50);
  class ActionResolver {
    constructor(scoreCalculator = new ScoreCalculator()) {
      __publicField(this, "scoreCalculator");
      this.scoreCalculator = scoreCalculator;
    }
    /**
     * 攻击状态分按行动前对手盘面归一进度定价（ticket 05 候选 A）。
     *
     * 只缩放攻击状态分（CAUSE_DMG / BREAK_LIGHT / WEAKEN）；行为分、里程碑与
     * 己方建设分不受影响。`ATTACK_PROGRESS_SCALE` 未配置时恒等。
     */
    scaledAttackTransitionPoints(prevLevel, newLevel, polarity, opponentBoardBeforeAction) {
      const points = this.scoreCalculator.calculateTransitionPoints(
        prevLevel,
        newLevel,
        polarity,
        true
      );
      const scale = this.scoreCalculator.attackProgressScale(
        countBoardGuiYi(opponentBoardBeforeAction)
      );
      return Math.round(points * scale);
    }
    /**
     * 解析动作执行
     */
    resolve(state, payload) {
      if (state.isGameOver) {
        return {
          nextState: state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          // Stryker disable next-line StringLiteral: 终局提示文案不参与断言（不可观测）
          message: "对局已结束"
        };
      }
      const activePlayerId = payload.player;
      const opponentPlayerId = activePlayerId === "P1" ? "P2" : "P1";
      const activePlayer = state.players[activePlayerId];
      const opponentPlayer = state.players[opponentPlayerId];
      let nextActiveBoard = activePlayer.board;
      let nextOpponentBoard = opponentPlayer.board;
      const patchActiveNode = (element, patch) => {
        const current = nextActiveBoard[element];
        nextActiveBoard = {
          ...nextActiveBoard,
          [element]: {
            ...current,
            ...patch
          }
        };
      };
      const patchOpponentNode = (element, patch) => {
        const current = nextOpponentBoard[element];
        nextOpponentBoard = {
          ...nextOpponentBoard,
          [element]: {
            ...current,
            ...patch
          }
        };
      };
      let scoreDelta = 0;
      let extraTurn = false;
      let success = false;
      let message = "";
      switch (payload.actionType) {
        case ActionType.AUTO: {
          const element = payload.element || state.currentTianGan?.element;
          const polarity = payload.polarity || state.currentTianGan?.polarity;
          if (!element || !polarity) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "缺少天干属性或极性" };
          }
          scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.AUTO);
          const node = nextActiveBoard[element];
          const prevLevel = node[polarity];
          if (prevLevel >= 2) {
            message = "节点已达最高加持状态";
            success = true;
          } else {
            const newLevel = clampNodeLevel(prevLevel + 1);
            patchActiveNode(element, { [polarity]: newLevel });
            scoreDelta += this.scoreCalculator.calculateTransitionPoints(
              prevLevel,
              newLevel,
              polarity,
              false
            );
            success = true;
          }
          break;
        }
        case ActionType.CONVERT: {
          const element = payload.element || state.currentTianGan?.element;
          if (!element) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "缺少指定元素" };
          }
          const targetPolarity = payload.polarity || (state.currentTianGan ? getOppositePolarity(state.currentTianGan.polarity) : Polarity.YANG);
          const node = nextActiveBoard[element];
          const prevLevel = node[targetPolarity];
          if (prevLevel >= 1) {
            return {
              nextState: state,
              success: false,
              scoreDelta: 0,
              extraTurn: false,
              message: "目标极性已处于点亮或加持状态，严禁调息"
            };
          }
          scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.CONVERT);
          const newLevel = clampNodeLevel(prevLevel + 1);
          patchActiveNode(element, { [targetPolarity]: newLevel });
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(
            prevLevel,
            newLevel,
            targetPolarity,
            false
          );
          success = true;
          break;
        }
        case ActionType.TRANS: {
          const sourceElement = payload.sourceElement || payload.element || state.currentTianGan?.element;
          if (!sourceElement) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "缺少源五行" };
          }
          scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.TRANS);
          const targetElement = GENERATION_CYCLE[sourceElement];
          const polarity = payload.polarity || Polarity.YANG;
          const targetNode = nextActiveBoard[targetElement];
          const prevLevel = targetNode[polarity];
          if (prevLevel < 2) {
            const newLevel = clampNodeLevel(prevLevel + 1);
            patchActiveNode(targetElement, { [polarity]: newLevel });
            scoreDelta += this.scoreCalculator.calculateTransitionPoints(
              prevLevel,
              newLevel,
              polarity,
              false
            );
          }
          success = true;
          break;
        }
        case ActionType.ATK: {
          const sourceElement = payload.sourceElement || payload.element || state.currentTianGan?.element;
          if (!sourceElement) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "缺少源五行" };
          }
          scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.ATK);
          const targetElement = OVERCOMING_CYCLE[sourceElement];
          const polarity = payload.polarity || Polarity.YANG;
          const targetNode = nextOpponentBoard[targetElement];
          const prevLevel = targetNode[polarity];
          const newLevel = clampNodeLevel(prevLevel - 1);
          patchOpponentNode(targetElement, { [polarity]: newLevel });
          scoreDelta += this.scaledAttackTransitionPoints(
            prevLevel,
            newLevel,
            polarity,
            opponentPlayer.board
          );
          success = true;
          break;
        }
        case ActionType.BURST: {
          const sourceElement = payload.sourceElement;
          const consumePolarity = payload.consumePolarity || Polarity.YIN;
          if (!sourceElement) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "爆发需指定归一源节点" };
          }
          const sourceNode = nextActiveBoard[sourceElement];
          if (!isNodeGuiYi(sourceNode)) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "源节点未达成归一，无法爆发" };
          }
          scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.BURST);
          patchActiveNode(sourceElement, {
            [consumePolarity]: clampNodeLevel(sourceNode[consumePolarity] - 1)
          });
          const targetElement = GENERATION_CYCLE[sourceElement];
          const targetPolarity = payload.polarity || Polarity.YANG;
          const targetNode = nextActiveBoard[targetElement];
          const prevLevel = targetNode[targetPolarity];
          const newLevel = clampNodeLevel(prevLevel + 1);
          patchActiveNode(targetElement, {
            [targetPolarity]: newLevel
          });
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(
            prevLevel,
            newLevel,
            targetPolarity,
            false
          );
          extraTurn = true;
          success = true;
          break;
        }
        case ActionType.BURST_ATK: {
          const sourceElement = payload.sourceElement;
          const consumePolarity = payload.consumePolarity || Polarity.YANG;
          if (!sourceElement) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "强破需指定归一源节点" };
          }
          const sourceNode = nextActiveBoard[sourceElement];
          if (!isNodeGuiYi(sourceNode)) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "源节点未达成归一，无法强破" };
          }
          scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.BURST_ATK);
          patchActiveNode(sourceElement, {
            [consumePolarity]: clampNodeLevel(sourceNode[consumePolarity] - 1)
          });
          const targetElement = OVERCOMING_CYCLE[sourceElement];
          const targetPolarity = payload.polarity || Polarity.YANG;
          const targetNode = nextOpponentBoard[targetElement];
          const prevLevel = targetNode[targetPolarity];
          const newLevel = clampNodeLevel(prevLevel - 1);
          patchOpponentNode(targetElement, {
            [targetPolarity]: newLevel
          });
          scoreDelta += this.scaledAttackTransitionPoints(
            prevLevel,
            newLevel,
            targetPolarity,
            opponentPlayer.board
          );
          extraTurn = true;
          success = true;
          break;
        }
        case ActionType.DISSIPATE: {
          const element = payload.element || state.currentTianGan?.element;
          const polarity = payload.polarity || state.currentTianGan?.polarity;
          if (!element || !polarity) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "缺少天干属性或极性" };
          }
          const node = nextActiveBoard[element];
          const prevLevel = node[polarity];
          const newLevel = clampNodeLevel(prevLevel - 1);
          patchActiveNode(element, { [polarity]: newLevel });
          scoreDelta = 0;
          success = true;
          message = "亢极散气：极位能量满溢回落";
          break;
        }
        case ActionType.PASS: {
          scoreDelta = 0;
          success = true;
          message = "消散过牌：无有效动作，流转回合";
          break;
        }
      }
      if (!success) {
        return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message };
      }
      let guiYiDelta = 0;
      for (const element of Object.values(WuXing)) {
        const prevGuiYi = isNodeGuiYi(activePlayer.board[element]);
        const nextGuiYi = isNodeGuiYi(nextActiveBoard[element]);
        if (!prevGuiYi && nextGuiYi) {
          guiYiDelta++;
        }
      }
      if (guiYiDelta > 0) {
        scoreDelta += this.scoreCalculator.calculateGuiYiMilestonePoints(guiYiDelta);
      }
      const nextScore = activePlayer.score + scoreDelta;
      const hasGuiYuan = isBoardGuiYuan(nextActiveBoard);
      const prevLockedGuiYuan = state.lockedGuiYuan ?? {
        // Stryker disable next-line BooleanLiteral: 同上，不可达兜底
        P1: false,
        // Stryker disable next-line BooleanLiteral: 同上，不可达兜底
        P2: false
      };
      const nextLockedGuiYuan = {
        P1: prevLockedGuiYuan.P1 || activePlayerId === "P1" && hasGuiYuan,
        P2: prevLockedGuiYuan.P2 || activePlayerId === "P2" && hasGuiYuan
      };
      let isGameOver = false;
      let winner = null;
      let endReason = null;
      let finalActiveScore = nextScore;
      let finalOpponentScore = opponentPlayer.score;
      if (activePlayerId === "P1") {
        if (nextLockedGuiYuan.P1) {
          if (!isBoardTingPai(nextOpponentBoard)) {
            isGameOver = true;
            winner = "P1";
            endReason = "GUI_YUAN";
            extraTurn = false;
          } else {
            isGameOver = false;
            extraTurn = false;
          }
        }
      } else {
        if (nextLockedGuiYuan.P2) {
          isGameOver = true;
          winner = "P2";
          endReason = "GUI_YUAN";
          extraTurn = false;
        } else if (!extraTurn) {
          if (nextLockedGuiYuan.P1) {
            isGameOver = true;
            winner = "P1";
            endReason = "GUI_YUAN";
          } else if (state.round >= state.maxRounds) {
            isGameOver = true;
            endReason = "MAX_ROUNDS";
            const activeDamage = countBoardDamage(nextActiveBoard);
            const opponentDamage = countBoardDamage(nextOpponentBoard);
            finalActiveScore -= this.scoreCalculator.calculateDamagePenalty(activeDamage);
            finalOpponentScore -= this.scoreCalculator.calculateDamagePenalty(opponentDamage);
            if (finalActiveScore > finalOpponentScore) {
              winner = activePlayerId;
            } else if (finalOpponentScore > finalActiveScore) {
              winner = opponentPlayerId;
            } else {
              winner = "P2";
            }
          }
        }
      }
      let nextRound = state.round;
      let nextCurrentPlayer = activePlayerId;
      if (isGameOver) {
        nextRound = state.round;
        nextCurrentPlayer = activePlayerId;
      } else if (extraTurn) {
        nextRound = state.round;
        nextCurrentPlayer = activePlayerId;
      } else {
        if (activePlayerId === "P1") {
          nextRound = state.round;
          nextCurrentPlayer = "P2";
        } else {
          nextRound = state.round + 1;
          nextCurrentPlayer = "P1";
        }
      }
      const nextState = {
        ...state,
        round: nextRound,
        currentPlayer: nextCurrentPlayer,
        players: {
          ...state.players,
          [activePlayerId]: {
            ...activePlayer,
            score: finalActiveScore,
            board: nextActiveBoard
          },
          [opponentPlayerId]: {
            ...opponentPlayer,
            score: finalOpponentScore,
            board: nextOpponentBoard
          }
        },
        isGameOver,
        winner,
        endReason,
        lockedGuiYuan: nextLockedGuiYuan
      };
      return {
        nextState,
        success: true,
        scoreDelta,
        extraTurn,
        message
      };
    }
  }
  class EventBus {
    constructor() {
      __publicField(this, "listeners", /* @__PURE__ */ new Map());
    }
    on(event, handler) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, /* @__PURE__ */ new Set());
      }
      this.listeners.get(event).add(handler);
      return () => this.off(event, handler);
    }
    off(event, handler) {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    }
    emit(event, data) {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.forEach((h) => {
          try {
            h(data);
          } catch (e) {
            console.error(`[EventBus] Error handling event ${String(event)}:`, e);
          }
        });
      }
    }
    /**
     * 对比新旧状态，自动向表现层派发差量事件
     */
    diffAndEmit(prevState, nextState) {
      const players = ["P1", "P2"];
      const elements = Object.values(WuXing);
      for (const player of players) {
        const prevBoard = prevState.players[player].board;
        const nextBoard = nextState.players[player].board;
        for (const el of elements) {
          if (prevBoard[el].yin !== nextBoard[el].yin) {
            this.emit("node:stateChanged", {
              player,
              element: el,
              polarity: Polarity.YIN,
              prevLevel: prevBoard[el].yin,
              newLevel: nextBoard[el].yin
            });
          }
          if (prevBoard[el].yang !== nextBoard[el].yang) {
            this.emit("node:stateChanged", {
              player,
              element: el,
              polarity: Polarity.YANG,
              prevLevel: prevBoard[el].yang,
              newLevel: nextBoard[el].yang
            });
          }
        }
      }
      if (!prevState.isGameOver && nextState.isGameOver) {
        this.emit("game:over", {
          winner: nextState.winner,
          endReason: nextState.endReason
        });
      }
    }
  }
  function createPRNG(initialSeed = Date.now()) {
    let state = Math.floor(initialSeed) >>> 0;
    return {
      next() {
        state = state + 1831565813 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      },
      nextInt(min, max) {
        const lower = Math.ceil(min);
        const upper = Math.floor(max);
        if (lower > upper) {
          throw new Error(`Invalid range: min (${min}) must be <= max (${max})`);
        }
        const range = upper - lower + 1;
        return lower + Math.floor(this.next() * range);
      },
      getState() {
        return state;
      }
    };
  }
  function drawTianGan(prng) {
    const index = prng.nextInt(0, TIAN_GAN_LIST.length - 1);
    return TIAN_GAN_LIST[index];
  }
  function getPlusTargetPolarity(node) {
    if (node.yin < 2) {
      return Polarity.YIN;
    }
    if (node.yang < 2) {
      return Polarity.YANG;
    }
    return null;
  }
  function getMinusTargetPolarity(node) {
    if (node.yin > -1) {
      return Polarity.YIN;
    }
    if (node.yang > -1) {
      return Polarity.YANG;
    }
    return null;
  }
  function getAvailableActions(state, tianGan, options) {
    if (state.isGameOver) {
      return [];
    }
    const playerId = state.currentPlayer;
    const opponentId = playerId === "P1" ? "P2" : "P1";
    const playerBoard = state.players[playerId].board;
    const opponentBoard = state.players[opponentId].board;
    const stemElement = tianGan.element;
    const stemPolarity = tianGan.polarity;
    const stemNode = playerBoard[stemElement];
    const stemLevel = stemNode[stemPolarity];
    if (stemLevel <= 0) {
      return [
        {
          actionType: ActionType.AUTO,
          player: playerId,
          element: stemElement,
          polarity: stemPolarity
        }
      ];
    }
    if (isNodeKangJi(stemNode)) {
      return [
        {
          actionType: ActionType.DISSIPATE,
          player: playerId,
          element: stemElement,
          polarity: stemPolarity
        }
      ];
    }
    const actions = [];
    if (stemLevel >= 1) {
      const oppositePolarity = getOppositePolarity(stemPolarity);
      if (stemNode[oppositePolarity] <= 0) {
        actions.push({
          actionType: ActionType.CONVERT,
          player: playerId,
          element: stemElement,
          polarity: oppositePolarity
        });
      }
      if (stemPolarity === Polarity.YANG) {
        const keEl = OVERCOMING_CYCLE[stemElement];
        const targetPolarity = getMinusTargetPolarity(opponentBoard[keEl]);
        if (targetPolarity !== null) {
          actions.push({
            actionType: ActionType.ATK,
            player: playerId,
            sourceElement: stemElement,
            polarity: targetPolarity
          });
        }
      }
      if (stemPolarity === Polarity.YIN) {
        const shengEl = GENERATION_CYCLE[stemElement];
        const targetPolarity = getPlusTargetPolarity(playerBoard[shengEl]);
        if (targetPolarity !== null) {
          actions.push({
            actionType: ActionType.TRANS,
            player: playerId,
            sourceElement: stemElement,
            polarity: targetPolarity
          });
        }
      }
    }
    if (!options?.isExtraTurn && isNodeGuiYi(stemNode)) {
      const shengEl = GENERATION_CYCLE[stemElement];
      const shengTargetPolarity = getPlusTargetPolarity(playerBoard[shengEl]);
      if (shengTargetPolarity !== null) {
        actions.push({
          actionType: ActionType.BURST,
          player: playerId,
          sourceElement: stemElement,
          consumePolarity: Polarity.YIN,
          polarity: shengTargetPolarity
        });
      }
      const keEl = OVERCOMING_CYCLE[stemElement];
      const keTargetPolarity = getMinusTargetPolarity(opponentBoard[keEl]);
      if (keTargetPolarity !== null) {
        actions.push({
          actionType: ActionType.BURST_ATK,
          player: playerId,
          sourceElement: stemElement,
          consumePolarity: Polarity.YANG,
          polarity: keTargetPolarity
        });
      }
    }
    if (actions.length === 0) {
      actions.push({
        actionType: ActionType.PASS,
        player: playerId,
        element: stemElement,
        polarity: stemPolarity
      });
    }
    return actions;
  }
  var TurnPhase = /* @__PURE__ */ ((TurnPhase2) => {
    TurnPhase2["START_TURN"] = "START_TURN";
    TurnPhase2["EXECUTE_ACTION"] = "EXECUTE_ACTION";
    TurnPhase2["RESOLVE_BURST"] = "RESOLVE_BURST";
    TurnPhase2["END_TURN"] = "END_TURN";
    TurnPhase2["GAME_OVER"] = "GAME_OVER";
    return TurnPhase2;
  })(TurnPhase || {});
  class TurnManager {
    constructor(options = {}) {
      __publicField(this, "state");
      __publicField(this, "prng");
      __publicField(this, "resolver");
      __publicField(this, "eventBus");
      __publicField(this, "phase");
      __publicField(this, "currentTianGan", null);
      __publicField(this, "isExtraTurn", false);
      __publicField(this, "candidateActions", []);
      this.state = options.initialState ?? createInitialGameState();
      this.prng = options.prng ?? createPRNG();
      this.resolver = options.resolver ?? new ActionResolver();
      this.eventBus = options.eventBus ?? new EventBus();
      this.phase = this.state.isGameOver ? "GAME_OVER" : "START_TURN";
      this.currentTianGan = this.state.currentTianGan ?? null;
    }
    /**
     * 获取当前游戏全局状态
     */
    getState() {
      return this.state;
    }
    /**
     * 获取当前抽取的天干信息
     */
    getCurrentTianGan() {
      return this.currentTianGan;
    }
    /**
     * 当前是否处于爆发连动带来的额外行动中
     */
    isExtraTurnActive() {
      return this.isExtraTurn;
    }
    /**
     * 获取当前回合所处的生命周期阶段
     */
    getCurrentPhase() {
      return this.phase;
    }
    /**
     * 获取当前阶段的合法候选动作列表
     */
    getAvailableActions() {
      return [...this.candidateActions];
    }
    /**
     * 获取当前使用的 EventBus 实例
     */
    getEventBus() {
      return this.eventBus;
    }
    /**
     * 获取当前使用的 PRNG 实例
     */
    getPRNG() {
      return this.prng;
    }
    /**
     * 开始新回合：抽取天干并生成合法候选动作列表
     * 若当前处于连动额外行动 (isExtraTurn=true)，会自动过滤掉 BURST 与 BURST_ATK
     */
    startTurn() {
      if (this.state.isGameOver) {
        this.phase = "GAME_OVER";
        this.candidateActions = [];
        return [];
      }
      if (this.state.lockedGuiYuan?.P1 && this.state.currentPlayer === "P2") {
        this.phase = "START_TURN";
        this.eventBus.emit("turn:start", {
          round: this.state.round,
          player: "P2",
          isExtraTurn: false
        });
        const tianGan = drawTianGan(this.prng);
        this.currentTianGan = tianGan;
        this.state = {
          ...this.state,
          currentTianGan: tianGan
        };
        this.eventBus.emit("tiangan:draw", {
          tianGan
        });
        const p2Board = this.state.players.P2.board;
        const success = canTianGanLightUnlightedSide(p2Board, tianGan);
        let nextP2Board = p2Board;
        let nextLockedGuiYuan = {
          P1: true,
          P2: false
        };
        let winner = "P1";
        if (success) {
          winner = "P2";
          nextLockedGuiYuan = {
            P1: true,
            P2: true
          };
          const unlighted = getUnlightedSide(p2Board);
          if (unlighted) {
            nextP2Board = {
              ...p2Board,
              [unlighted.element]: {
                ...p2Board[unlighted.element],
                [unlighted.polarity]: clampNodeLevel(
                  p2Board[unlighted.element][unlighted.polarity] + 1
                )
              }
            };
          }
        } else {
          winner = "P1";
        }
        this.eventBus.emit("showdown:draw", {
          round: this.state.round,
          player: "P2",
          tianGan,
          success,
          winner
        });
        const prevState = this.state;
        this.state = {
          ...this.state,
          isGameOver: true,
          winner,
          endReason: "GUI_YUAN",
          lockedGuiYuan: nextLockedGuiYuan,
          players: {
            ...this.state.players,
            P2: {
              ...this.state.players.P2,
              board: nextP2Board
            }
          }
        };
        this.phase = "GAME_OVER";
        this.candidateActions = [];
        this.isExtraTurn = false;
        this.eventBus.diffAndEmit(prevState, this.state);
        this.eventBus.emit("turn:end", {
          round: prevState.round,
          player: "P2"
        });
        return [];
      }
      this.phase = "START_TURN";
      this.eventBus.emit("turn:start", {
        round: this.state.round,
        player: this.state.currentPlayer,
        isExtraTurn: this.isExtraTurn
      });
      this.currentTianGan = drawTianGan(this.prng);
      this.state = {
        ...this.state,
        currentTianGan: this.currentTianGan
      };
      this.eventBus.emit("tiangan:draw", {
        tianGan: this.currentTianGan
      });
      this.candidateActions = getAvailableActions(this.state, this.currentTianGan, {
        isExtraTurn: this.isExtraTurn
      });
      this.phase = "EXECUTE_ACTION";
      return [...this.candidateActions];
    }
    /**
     * 执行指定动作
     * 包含合法性校验、爆发连动限制、状态递增与事件广播
     */
    executeAction(action) {
      if (this.state.isGameOver) {
        this.phase = "GAME_OVER";
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          message: "对局已结束"
        };
      }
      if (this.phase !== "EXECUTE_ACTION" || !this.currentTianGan) {
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          message: "当前不在动作执行阶段，请先调用 startTurn()"
        };
      }
      if (action.player && action.player !== this.state.currentPlayer) {
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          message: `当前不是玩家 ${action.player} 的行动回合`
        };
      }
      if (this.isExtraTurn && (action.actionType === ActionType.BURST || action.actionType === ActionType.BURST_ATK)) {
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          message: "连动行动中禁止再次使用爆发动作"
        };
      }
      const matchedCandidate = this.candidateActions.find((c) => this.isActionMatch(c, action));
      if (!matchedCandidate) {
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          message: "非法动作：不在当前合法候选列表中"
        };
      }
      const fullAction = {
        ...matchedCandidate,
        ...action,
        player: this.state.currentPlayer
      };
      this.eventBus.emit("action:execute", { action: fullAction });
      const prevState = this.state;
      const result = this.resolver.resolve(this.state, fullAction);
      if (!result.success) {
        return result;
      }
      this.phase = "RESOLVE_BURST";
      const wasExtraTurn = this.isExtraTurn;
      if (result.extraTurn && !wasExtraTurn) {
        this.isExtraTurn = true;
        this.eventBus.emit("burst:extra_turn", { player: fullAction.player });
      } else if (wasExtraTurn) {
        this.isExtraTurn = false;
      }
      this.state = result.nextState;
      this.eventBus.emit("action:executed", {
        player: fullAction.player,
        actionType: fullAction.actionType,
        scoreDelta: result.scoreDelta,
        extraTurn: result.extraTurn
      });
      this.eventBus.diffAndEmit(prevState, this.state);
      this.eventBus.emit("turn:end", {
        round: prevState.round,
        player: prevState.currentPlayer
      });
      if (this.state.isGameOver) {
        this.phase = "GAME_OVER";
        this.isExtraTurn = false;
      } else {
        this.phase = "END_TURN";
      }
      return result;
    }
    /**
     * 手动结束当前回合，将状态推进至 START_TURN 准备下一回合
     */
    endTurn() {
      if (this.state.isGameOver) {
        this.phase = "GAME_OVER";
        return;
      }
      this.phase = "START_TURN";
    }
    /**
     * 单步执行驱动方法：自动完成 startTurn 与 executeAction
     * 若未提供 action，则默认选择首个候选动作 (通常为 AUTO)
     */
    step(action) {
      if (this.state.isGameOver) {
        this.phase = "GAME_OVER";
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          // Stryker disable next-line StringLiteral: 终局提示文案不参与断言（不可观测）
          message: "对局已结束"
        };
      }
      if (this.phase === "START_TURN" || this.phase === "END_TURN") {
        this.startTurn();
      }
      if (this.state.isGameOver) {
        return {
          nextState: this.state,
          success: true,
          scoreDelta: 0,
          extraTurn: false,
          message: "终轮天命揭牌决胜已完成"
        };
      }
      const actionToExecute = action ?? this.candidateActions[0];
      if (!actionToExecute) {
        return {
          nextState: this.state,
          // Stryker disable next-line BooleanLiteral: 不可达的兜底返回
          success: false,
          scoreDelta: 0,
          // Stryker disable next-line BooleanLiteral: 不可达的兜底返回
          extraTurn: false,
          // Stryker disable next-line StringLiteral: 不可达的兜底返回
          message: "无可用动作"
        };
      }
      return this.executeAction(actionToExecute);
    }
    /**
     * 策略驱动执行：根据传入的决策策略函数完成当前回合
     */
    executeTurn(strategy) {
      if (this.state.isGameOver) {
        this.phase = "GAME_OVER";
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
          // Stryker disable next-line StringLiteral: 终局提示文案不参与断言（不可观测）
          message: "对局已结束"
        };
      }
      if (this.phase === "START_TURN" || this.phase === "END_TURN") {
        this.startTurn();
      }
      if (this.state.isGameOver) {
        return {
          nextState: this.state,
          success: true,
          scoreDelta: 0,
          extraTurn: false,
          // Stryker disable next-line StringLiteral: 终局提示文案不参与断言（不可观测）
          message: "终轮天命揭牌决胜已完成"
        };
      }
      const chosenAction = strategy(this.state, this.currentTianGan, this.candidateActions);
      return this.executeAction(chosenAction);
    }
    /**
     * 策略驱动执行别名
     */
    executeTurnWithStrategy(strategy) {
      return this.executeTurn(strategy);
    }
    /**
     * 匹配候选动作与传入动作的合法性
     */
    isActionMatch(candidate, action) {
      if (candidate.actionType !== action.actionType) {
        return false;
      }
      const player = action.player ?? this.state.currentPlayer;
      if (candidate.player !== player) {
        return false;
      }
      if (action.element !== void 0 && candidate.element !== action.element) {
        return false;
      }
      if (action.sourceElement !== void 0 && candidate.sourceElement !== action.sourceElement) {
        return false;
      }
      if (action.polarity !== void 0 && candidate.polarity !== action.polarity) {
        return false;
      }
      if (action.consumePolarity !== void 0 && candidate.consumePolarity !== action.consumePolarity) {
        return false;
      }
      if ((candidate.actionType === ActionType.BURST || candidate.actionType === ActionType.BURST_ATK) && action.sourceElement === void 0) {
        return false;
      }
      return true;
    }
  }
  const DEFAULT_STRATEGY_WEIGHTS = {
    repairDamage: 120,
    reachGuiYi: 90,
    lightVoid: 40,
    reachKangJi: 30,
    guiyuanProgress: 35,
    breakOpponentGuiYi: 80,
    causeDamage: 60,
    suppressNode: 30,
    burstExtraTurn: 70,
    scoreDeltaWeight: 1,
    winReward: 1e4,
    baseActionBias: {}
  };
  class ActionEvaluator {
    constructor(resolver = new ActionResolver()) {
      __publicField(this, "resolver");
      this.resolver = resolver;
    }
    /**
     * 评估单个动作的综合价值
     */
    evaluate(state, tianGan, action, weights = DEFAULT_STRATEGY_WEIGHTS, rules) {
      const simulatedState = {
        ...state,
        currentTianGan: tianGan
      };
      const result = this.resolver.resolve(simulatedState, action);
      if (!result.success) {
        return {
          action,
          score: -999999,
          breakdown: {
            repairScore: 0,
            unityScore: 0,
            suppressionScore: 0,
            burstScore: 0,
            scoreDeltaPoints: 0,
            biasScore: 0,
            totalScore: -999999
          }
        };
      }
      const activePlayerId = action.player;
      const opponentPlayerId = activePlayerId === "P1" ? "P2" : "P1";
      const prevActive = state.players[activePlayerId].board;
      const nextActive = result.nextState.players[activePlayerId].board;
      const prevOpponent = state.players[opponentPlayerId].board;
      const nextOpponent = result.nextState.players[opponentPlayerId].board;
      const elements = Object.values(WuXing);
      let repairScore = 0;
      for (const el of elements) {
        if (prevActive[el].yin === -1 && nextActive[el].yin > -1) {
          repairScore += weights.repairDamage;
        }
        if (prevActive[el].yang === -1 && nextActive[el].yang > -1) {
          repairScore += weights.repairDamage;
        }
      }
      let unityScore = 0;
      let prevGuiYiCount = 0;
      let nextGuiYiCount = 0;
      for (const el of elements) {
        const prevNode = prevActive[el];
        const nextNode = nextActive[el];
        const prevIsGuiYi = isNodeGuiYi(prevNode);
        const nextIsGuiYi = isNodeGuiYi(nextNode);
        if (prevIsGuiYi) prevGuiYiCount++;
        if (nextIsGuiYi) nextGuiYiCount++;
        if (!prevIsGuiYi && nextIsGuiYi) {
          unityScore += weights.reachGuiYi;
        } else if (prevIsGuiYi && !nextIsGuiYi) {
          unityScore -= weights.reachGuiYi * 0.5;
        }
        if (prevNode.yin === 0 && nextNode.yin >= 1) {
          unityScore += weights.lightVoid;
        }
        if (prevNode.yang === 0 && nextNode.yang >= 1) {
          unityScore += weights.lightVoid;
        }
        if (prevNode.yin < 2 && nextNode.yin === 2) {
          unityScore += weights.reachKangJi * 0.5;
        }
        if (prevNode.yang < 2 && nextNode.yang === 2) {
          unityScore += weights.reachKangJi * 0.5;
        }
        if (!isNodeKangJi(prevNode) && isNodeKangJi(nextNode)) {
          unityScore += weights.reachKangJi * 0.5;
        }
      }
      const guiYiDelta = nextGuiYiCount - prevGuiYiCount;
      if (guiYiDelta > 0) {
        unityScore += guiYiDelta * weights.guiyuanProgress;
      }
      unityScore += nextGuiYiCount * (weights.guiyuanProgress * 0.2);
      if (isBoardGuiYuan(nextActive)) {
        unityScore += weights.winReward ?? 500;
      }
      let suppressionScore = 0;
      for (const el of elements) {
        const prevOpNode = prevOpponent[el];
        const nextOpNode = nextOpponent[el];
        if (isNodeGuiYi(prevOpNode) && !isNodeGuiYi(nextOpNode)) {
          suppressionScore += weights.breakOpponentGuiYi;
        }
        if (prevOpNode.yin >= 0 && nextOpNode.yin === -1) {
          suppressionScore += weights.causeDamage;
        }
        if (prevOpNode.yang >= 0 && nextOpNode.yang === -1) {
          suppressionScore += weights.causeDamage;
        }
        if (nextOpNode.yin < prevOpNode.yin) {
          const diff = prevOpNode.yin - nextOpNode.yin;
          suppressionScore += diff * weights.suppressNode;
        }
        if (nextOpNode.yang < prevOpNode.yang) {
          const diff = prevOpNode.yang - nextOpNode.yang;
          suppressionScore += diff * weights.suppressNode;
        }
      }
      let burstScore = 0;
      if (result.extraTurn) {
        burstScore += weights.burstExtraTurn;
      }
      const scoreWeight = weights.scoreDeltaWeight ?? 1;
      const scoreDeltaPoints = rules?.isBoardOnly ? 0 : result.scoreDelta * scoreWeight;
      const biasScore = weights.baseActionBias?.[action.actionType] ?? 0;
      const totalScore = repairScore + unityScore + suppressionScore + burstScore + scoreDeltaPoints + biasScore;
      return {
        action,
        score: totalScore,
        breakdown: {
          repairScore,
          unityScore,
          suppressionScore,
          burstScore,
          scoreDeltaPoints,
          biasScore,
          totalScore
        }
      };
    }
    /**
     * 评估一组候选动作并返回打分列表
     */
    evaluateAll(state, tianGan, actions, weights = DEFAULT_STRATEGY_WEIGHTS, rules) {
      return actions.map((action) => this.evaluate(state, tianGan, action, weights, rules));
    }
  }
  const BALANCED_WEIGHTS = {
    repairDamage: 260,
    reachGuiYi: 240,
    lightVoid: 100,
    reachKangJi: 50,
    guiyuanProgress: 140,
    burstExtraTurn: 120,
    breakOpponentGuiYi: 100,
    causeDamage: 60,
    suppressNode: 30,
    scoreDeltaWeight: 0.8,
    winReward: 1e4,
    baseActionBias: {}
  };
  const RUSH_GUIYUAN_WEIGHTS = {
    repairDamage: 60,
    reachGuiYi: 280,
    lightVoid: 120,
    reachKangJi: 70,
    guiyuanProgress: 180,
    burstExtraTurn: 110,
    breakOpponentGuiYi: 25,
    causeDamage: 15,
    suppressNode: 10,
    scoreDeltaWeight: 0.8,
    winReward: 12e3,
    baseActionBias: {}
  };
  const AGGRESSIVE_WEIGHTS = {
    repairDamage: 50,
    reachGuiYi: 40,
    lightVoid: 25,
    reachKangJi: 20,
    guiyuanProgress: 20,
    burstExtraTurn: 80,
    breakOpponentGuiYi: 220,
    causeDamage: 160,
    suppressNode: 90,
    scoreDeltaWeight: 0.8,
    winReward: 1e4,
    baseActionBias: {}
  };
  const DEFENSIVE_WEIGHTS = {
    repairDamage: 320,
    reachGuiYi: 110,
    lightVoid: 70,
    reachKangJi: 40,
    guiyuanProgress: 40,
    burstExtraTurn: 40,
    breakOpponentGuiYi: 50,
    causeDamage: 30,
    suppressNode: 20,
    scoreDeltaWeight: 0.8,
    winReward: 1e4,
    baseActionBias: {}
  };
  const PURE_RUSH_WEIGHTS = {
    repairDamage: 120,
    reachGuiYi: 300,
    lightVoid: 120,
    reachKangJi: 60,
    guiyuanProgress: 200,
    burstExtraTurn: 120,
    breakOpponentGuiYi: 0,
    causeDamage: 0,
    suppressNode: 0,
    scoreDeltaWeight: 0,
    winReward: 1e4,
    baseActionBias: {}
  };
  const PURE_SUPPRESS_WEIGHTS = {
    repairDamage: 0,
    reachGuiYi: 0,
    lightVoid: 0,
    reachKangJi: 0,
    guiyuanProgress: 0,
    burstExtraTurn: 0,
    breakOpponentGuiYi: 300,
    causeDamage: 200,
    suppressNode: 100,
    scoreDeltaWeight: 0,
    winReward: 0,
    baseActionBias: {}
  };
  const SCORE_STRIPPED_WEIGHTS = {
    ...BALANCED_WEIGHTS,
    scoreDeltaWeight: 0
  };
  function createStrategy(weights, options = {}) {
    const mergedWeights = {
      ...DEFAULT_STRATEGY_WEIGHTS,
      ...weights
    };
    const evaluator = options.evaluator ?? new ActionEvaluator();
    return (state, tianGan, availableActions) => {
      const actions = availableActions && availableActions.length > 0 ? availableActions : getAvailableActions(state, tianGan);
      if (actions.length === 0) {
        return {
          actionType: ActionType.AUTO,
          player: state.currentPlayer,
          element: tianGan.element,
          polarity: tianGan.polarity
        };
      }
      if (actions.length === 1) {
        return actions[0];
      }
      const scored = evaluator.evaluateAll(state, tianGan, actions, mergedWeights, options.rules);
      scored.sort((a, b) => b.score - a.score);
      if (options.tieBreaker) {
        const bestScore = scored[0].score;
        const topCandidates = scored.filter((s) => s.score === bestScore);
        if (topCandidates.length > 1) {
          return options.tieBreaker(topCandidates);
        }
      }
      return scored[0].action;
    };
  }
  function createScoreBoundStrategy(weights, config, rules) {
    return createStrategy(weights, {
      evaluator: new ActionEvaluator(new ActionResolver(new ScoreCalculator(config))),
      rules
    });
  }
  createStrategy(BALANCED_WEIGHTS);
  createStrategy(RUSH_GUIYUAN_WEIGHTS);
  createStrategy(AGGRESSIVE_WEIGHTS);
  createStrategy(DEFENSIVE_WEIGHTS);
  createScoreBoundStrategy(
    PURE_RUSH_WEIGHTS,
    POINTS_CONFIG
  );
  createScoreBoundStrategy(
    PURE_SUPPRESS_WEIGHTS,
    POINTS_CONFIG
  );
  createScoreBoundStrategy(
    SCORE_STRIPPED_WEIGHTS,
    POINTS_CONFIG
  );
  const WUXING_PALETTE = {
    [WuXing.WOOD]: { name: "木", main: "#38a169", light: "#68d391", dark: "#22543d" },
    [WuXing.FIRE]: { name: "火", main: "#e53e3e", light: "#fc8181", dark: "#742a2a" },
    [WuXing.EARTH]: { name: "土", main: "#d69e2e", light: "#f6e05e", dark: "#744210" },
    [WuXing.METAL]: { name: "金", main: "#e2e8f0", light: "#ffffff", dark: "#718096" },
    [WuXing.WATER]: { name: "水", main: "#3182ce", light: "#63b3ed", dark: "#2a4365" }
  };
  function drawPixelRect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }
  function drawPixelBox(ctx, x, y, w, h, bgColor, borderColor, pixelSize = 2) {
    drawPixelRect(ctx, x, y, w, h, bgColor);
    drawPixelRect(ctx, x, y, w, pixelSize, borderColor);
    drawPixelRect(ctx, x, y + h - pixelSize, w, pixelSize, borderColor);
    drawPixelRect(ctx, x, y, pixelSize, h, borderColor);
    drawPixelRect(ctx, x + w - pixelSize, y, pixelSize, h, borderColor);
  }
  function drawPixelCharacter(ctx, x, y, isPlayer, state, animTick) {
    const p = 3;
    let bobY = 0;
    if (state === "idle") {
      bobY = Math.sin(animTick * 0.08) * 3;
    } else if (state === "attack") {
      bobY = -2;
    } else if (state === "hurt") {
      bobY = 4;
    }
    const robeColor = isPlayer ? "#3182ce" : "#805ad5";
    const robeTrim = isPlayer ? "#63b3ed" : "#b794f4";
    const skinColor = "#fed7aa";
    const hairColor = isPlayer ? "#1a202c" : "#edf2f7";
    const beltColor = isPlayer ? "#d69e2e" : "#e53e3e";
    ctx.save();
    ctx.translate(x, y + bobY);
    if (!isPlayer) {
      ctx.scale(-1, 1);
    }
    drawPixelRect(ctx, -p * 2, -p * 11, p * 4, p * 3, hairColor);
    if (!isPlayer) {
      drawPixelRect(ctx, -p * 4, -p * 8, p * 2, p * 6, hairColor);
    } else {
      drawPixelRect(ctx, 0, -p * 12, p * 2, p * 2, "#d69e2e");
    }
    drawPixelRect(ctx, -p * 3, -p * 8, p * 6, p * 5, skinColor);
    const eyeColor = isPlayer ? "#2d3748" : "#e53e3e";
    drawPixelRect(ctx, p * 1, -p * 7, p * 1.5, p * 1.5, eyeColor);
    drawPixelRect(ctx, -p * 4, -p * 3, p * 8, p * 7, robeColor);
    drawPixelRect(ctx, -p * 1, -p * 3, p * 2, p * 7, robeTrim);
    drawPixelRect(ctx, -p * 4, p * 1, p * 8, p * 2, beltColor);
    drawPixelRect(ctx, -p * 5, p * 4, p * 10, p * 5, robeColor);
    drawPixelRect(ctx, -p * 3, p * 9, p * 6, p * 2, "#1a202c");
    if (state === "attack") {
      drawPixelRect(ctx, p * 3, -p * 2, p * 6, p * 3, robeColor);
      drawPixelRect(ctx, p * 8, -p * 2, p * 3, p * 3, skinColor);
    } else if (state === "cast") {
      drawPixelRect(ctx, p * 2, -p * 6, p * 3, p * 5, robeColor);
      drawPixelRect(ctx, p * 2, -p * 8, p * 3, p * 2, skinColor);
    } else if (state === "hurt") {
      drawPixelRect(ctx, -p * 3, -p * 5, p * 3, p * 4, robeColor);
    } else {
      drawPixelRect(ctx, p * 2, -p * 1, p * 2.5, p * 4, robeColor);
    }
    ctx.restore();
  }
  function drawCenterTianGanRune(ctx, centerX, centerY, tg, mode, animTick) {
    const elemCfg = WUXING_PALETTE[tg.element] ?? WUXING_PALETTE[WuXing.WOOD];
    const polarityName = tg.polarity === Polarity.YANG ? "阳" : "阴";
    const floatY = Math.sin(animTick * 0.08) * 3;
    const boxY = centerY + floatY;
    ctx.save();
    if (mode === "pixel") {
      const ringRadius = 38;
      ctx.strokeStyle = "#2d3748";
      ctx.lineWidth = 2;
      ctx.strokeRect(centerX - ringRadius, boxY - ringRadius, ringRadius * 2, ringRadius * 2);
      for (let i = 0; i < 4; i++) {
        const angle = animTick * 0.06 + i * Math.PI / 2;
        const px = centerX + Math.cos(angle) * 32;
        const py = boxY + Math.sin(angle) * 32;
        drawPixelRect(ctx, px - 2, py - 2, 4, 4, elemCfg.light);
      }
      const boxSize = 50;
      drawPixelBox(
        ctx,
        centerX - boxSize / 2,
        boxY - boxSize / 2,
        boxSize,
        boxSize,
        "#171e2e",
        elemCfg.main,
        2
      );
      drawPixelRect(
        ctx,
        centerX - boxSize / 2 + 4,
        boxY - boxSize / 2 + 4,
        boxSize - 8,
        2,
        elemCfg.light
      );
      ctx.fillStyle = "#0a0d14";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tg.name, centerX + 1, boxY + 1);
      ctx.fillStyle = elemCfg.light;
      ctx.fillText(tg.name, centerX, boxY);
      const tagW = 46;
      const tagH = 16;
      const tagY = boxY + boxSize / 2 + 4;
      drawPixelBox(ctx, centerX - tagW / 2, tagY, tagW, tagH, "#111827", elemCfg.dark, 1);
      ctx.fillStyle = elemCfg.light;
      ctx.font = "bold 10px monospace";
      ctx.fillText(`${elemCfg.name}·${polarityName}`, centerX, tagY + tagH / 2);
    } else {
      const glowRadius = 46 + Math.sin(animTick * 0.08) * 5;
      const grad = ctx.createRadialGradient(centerX, boxY, 8, centerX, boxY, glowRadius);
      grad.addColorStop(0, elemCfg.light + "66");
      grad.addColorStop(0.6, elemCfg.main + "22");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(centerX, boxY, glowRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(centerX, boxY);
      ctx.rotate(animTick * 0.02);
      ctx.strokeStyle = elemCfg.main + "99";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = elemCfg.light + "cc";
      ctx.beginPath();
      ctx.arc(0, 0, 30, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#162032";
      ctx.beginPath();
      ctx.arc(centerX, boxY, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = elemCfg.light;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = elemCfg.light;
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tg.name, centerX, boxY);
      ctx.restore();
      const tagW = 48;
      const tagH = 18;
      const tagY = boxY + 28;
      ctx.fillStyle = "#111827dd";
      ctx.strokeStyle = elemCfg.main;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(centerX - tagW / 2, tagY, tagW, tagH, 9);
      } else {
        ctx.rect(centerX - tagW / 2, tagY, tagW, tagH);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = elemCfg.light;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${elemCfg.name}·${polarityName}`, centerX, tagY + tagH / 2);
    }
    ctx.restore();
  }
  function drawImpactEffect(ctx, impact) {
    ctx.save();
    const { x, y, radius, maxRadius, color, lightColor, alpha, mode } = impact;
    ctx.globalAlpha = Math.max(0, alpha);
    if (mode === "pixel") {
      const sparkCount = 8;
      const sparkDist = radius;
      for (let i = 0; i < sparkCount; i++) {
        const angle = i * Math.PI * 2 / sparkCount;
        const sx = x + Math.cos(angle) * sparkDist;
        const sy = y + Math.sin(angle) * sparkDist;
        drawPixelRect(ctx, sx - 2, sy - 2, 4, 4, i % 2 === 0 ? lightColor : color);
      }
      if (radius < maxRadius * 0.4) {
        drawPixelRect(ctx, x - 5, y - 5, 10, 10, "#ffffff");
      }
    } else {
      ctx.strokeStyle = lightColor;
      ctx.lineWidth = 3 * (1 - radius / maxRadius) + 1;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, lightColor + "44");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function getActionTargetElement(act, fallbackElement) {
    const srcElem = act.sourceElement ?? act.element ?? fallbackElement ?? WuXing.WOOD;
    if (act.actionType === ActionType.TRANS || act.actionType === ActionType.BURST) {
      return act.targetElement ?? GENERATION_CYCLE[srcElem];
    }
    if (act.actionType === ActionType.ATK || act.actionType === ActionType.BURST_ATK) {
      return act.targetElement ?? OVERCOMING_CYCLE[srcElem];
    }
    return act.targetElement ?? act.element ?? srcElem;
  }
  function formatActionButton(act, isAutoAbsorb = false) {
    let label = "";
    let subLabel = "";
    let color = "#63b3ed";
    let isBurst = false;
    const srcElem = act.sourceElement ?? act.element ?? WuXing.WOOD;
    const srcName = WUXING_PALETTE[srcElem]?.name ?? "";
    switch (act.actionType) {
      case ActionType.AUTO: {
        label = isAutoAbsorb ? "【自动吸纳】" : "【吸纳】";
        subLabel = isAutoAbsorb ? "天干能量自动吸纳中（点击可立即吸纳）" : "天干能量吸纳（充盈虚空/修复道损）";
        color = "#68d391";
        break;
      }
      case ActionType.CONVERT: {
        label = isAutoAbsorb ? "【自动调息】" : "【调息】";
        subLabel = isAutoAbsorb ? `转同属${act.polarity === Polarity.YANG ? "阳" : "阴"}（点击立即调息）` : `转同属${act.polarity === Polarity.YANG ? "阳" : "阴"}`;
        color = "#63b3ed";
        break;
      }
      case ActionType.TRANS: {
        label = isAutoAbsorb ? "【自动化气】" : "【化】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = isAutoAbsorb ? `生${targetName}(${act.polarity === Polarity.YANG ? "阳" : "阴"})+1（点击立即化气）` : `生${targetName}(${act.polarity === Polarity.YANG ? "阳" : "阴"})+1`;
        color = "#4fd1c5";
        break;
      }
      case ActionType.ATK: {
        label = isAutoAbsorb ? "【自动击破】" : "【破】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = isAutoAbsorb ? `克敌${targetName}(${act.polarity === Polarity.YANG ? "阳" : "阴"})-1（点击立即击破）` : `克敌${targetName}(${act.polarity === Polarity.YANG ? "阳" : "阴"})-1`;
        color = "#fc8181";
        break;
      }
      case ActionType.BURST: {
        label = isAutoAbsorb ? "【自动强化】" : "【强化】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = isAutoAbsorb ? `消耗${srcName}·生${targetName}+2（点击立即强化）` : `消耗${srcName}·生${targetName}+2`;
        color = "#f6e05e";
        isBurst = true;
        break;
      }
      case ActionType.BURST_ATK: {
        label = isAutoAbsorb ? "【自动强破】" : "【强破】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = isAutoAbsorb ? `消耗${srcName}·克${targetName}-2（点击立即强破）` : `消耗${srcName}·克${targetName}-2`;
        color = "#f56565";
        isBurst = true;
        break;
      }
      case ActionType.DISSIPATE: {
        label = isAutoAbsorb ? "【亢极散气】" : "【散气】";
        subLabel = isAutoAbsorb ? "亢极满溢自动散气中（点击立即散气）" : `天道满溢则亏·${act.polarity === Polarity.YANG ? "阳" : "阴"}回落至加持(-1)`;
        color = "#e2e8f0";
        break;
      }
      case ActionType.PASS: {
        label = "【消散】";
        subLabel = isAutoAbsorb ? "无有效动作·消散过牌中（点击立即消散）" : "无有效动作·消散过牌交接回合";
        color = "#a0aec0";
        break;
      }
    }
    return {
      label,
      subLabel,
      color,
      isBurst
    };
  }
  class Node {
    constructor() {
      __publicField(this, "x", 0);
      __publicField(this, "y", 0);
      __publicField(this, "scaleX", 1);
      __publicField(this, "scaleY", 1);
      /** 局部透明度，最终渲染透明度是整条祖先链的乘积。 */
      __publicField(this, "alpha", 1);
      __publicField(this, "visible", true);
      /** 局部命中矩形；不设置即不参与命中检测（触摸会穿透到下层节点）。 */
      __publicField(this, "hitArea", null);
      __publicField(this, "onTouchStart");
      __publicField(this, "onTouchEnd");
      __publicField(this, "onTap");
      __publicField(this, "_parent", null);
      __publicField(this, "_children", []);
    }
    get parent() {
      return this._parent;
    }
    get children() {
      return this._children;
    }
    /** 挂载子节点；若子节点已有父节点则先摘除（即「移动」而非「复制」）。 */
    addChild(child) {
      if (isSelfOrAncestorOf(child, this)) {
        throw new Error("场景树不允许成环：不能把自身或祖先挂为自己的子节点。");
      }
      child.removeFromParent();
      child._parent = this;
      this._children.push(child);
      return this;
    }
    /** 摘除子节点；不是自己的孩子时静默忽略。 */
    removeChild(child) {
      const index = this._children.indexOf(child);
      if (index < 0) {
        return;
      }
      this._children.splice(index, 1);
      child._parent = null;
    }
    removeFromParent() {
      this._parent?.removeChild(this);
    }
    /** 递归渲染：应用局部变换与透明度后先画自己，再按挂载顺序画子节点（后者覆盖前者）。 */
    render(ctx) {
      if (!this.visible || this.alpha <= 0) {
        return;
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.scaleX, this.scaleY);
      ctx.globalAlpha *= this.alpha;
      this.renderSelf(ctx);
      for (const child of this._children) {
        child.render(ctx);
      }
      ctx.restore();
    }
    /** 子类在这里画自己；变换与透明度已由 `render` 就位。 */
    renderSelf(_ctx) {
    }
    /**
     * 自顶向下命中检测：`(x, y)` 与 `x` / `y` 同一坐标系（即父节点坐标系，根舞台即屏幕坐标）。
     * 命中时返回该节点，未命中返回 `null`。
     */
    hitTest(x, y) {
      if (!this.visible || this.alpha <= 0 || this.scaleX === 0 || this.scaleY === 0) {
        return null;
      }
      const localX = (x - this.x) / this.scaleX;
      const localY = (y - this.y) / this.scaleY;
      for (let index = this._children.length - 1; index >= 0; index -= 1) {
        const hit = this._children[index].hitTest(localX, localY);
        if (hit !== null) {
          return hit;
        }
      }
      return this.containsPoint(localX, localY) ? this : null;
    }
    /** 局部坐标是否落在命中区（默认取 `hitArea`）；子类可覆盖以实现圆形等异形命中区。 */
    containsPoint(localX, localY) {
      const area = this.hitArea;
      if (area === null) {
        return false;
      }
      return localX >= area.x && localX <= area.x + area.width && localY >= area.y && localY <= area.y + area.height;
    }
  }
  function isSelfOrAncestorOf(candidate, node) {
    for (let current = node; current !== null; current = current.parent) {
      if (current === candidate) {
        return true;
      }
    }
    return false;
  }
  class Container extends Node {
  }
  const EASINGS = {
    /** 线性：进度即比例。 */
    linear: (t) => t,
    /** 先快后慢（二次）。 */
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    /** 先快后慢（三次）：入场与飞行的默认手感。 */
    outCubic: (t) => 1 - (1 - t) ** 3
  };
  class Tween {
    constructor(target, to, options) {
      __publicField(this, "target");
      /** 补间开始（构造）时的起点值：插值始终相对它计算，多次步进不会累积漂移。 */
      __publicField(this, "from", /* @__PURE__ */ new Map());
      __publicField(this, "to");
      __publicField(this, "duration");
      __publicField(this, "easing");
      __publicField(this, "onUpdate");
      __publicField(this, "onComplete");
      __publicField(this, "elapsed", 0);
      __publicField(this, "done", false);
      this.target = target;
      this.to = to;
      if (!(options.duration > 0)) {
        throw new Error(`补间时长必须是正数（秒），收到 ${options.duration}。`);
      }
      this.duration = options.duration;
      this.easing = options.easing ?? EASINGS.linear;
      this.onUpdate = options.onUpdate;
      this.onComplete = options.onComplete;
      const bag = target;
      for (const key of Object.keys(to)) {
        const start = bag[key];
        if (typeof start !== "number") {
          throw new Error(`补间目标上没有数值属性 ${key}。`);
        }
        this.from.set(key, start);
      }
    }
    /** 补间是否还在推进（未完成）。 */
    get isRunning() {
      return !this.done;
    }
    /** 补间是否已抵达终值。 */
    get isComplete() {
      return this.done;
    }
    /** 距终值还差多少秒（已完成为 0）。序列据此把多余的 dt 结转给下一条。 */
    get remaining() {
      return this.done ? 0 : this.duration - this.elapsed;
    }
    /** 用 `dt` 秒推进补间；超出时长的部分会被丢弃（不越过终值）。 */
    update(dt) {
      if (this.done) {
        return;
      }
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      const progress = this.easing(this.elapsed / this.duration);
      this.apply(progress);
      this.onUpdate?.(progress);
      if (this.elapsed >= this.duration) {
        this.done = true;
        this.onComplete?.();
      }
    }
    apply(progress) {
      const bag = this.target;
      for (const [key, start] of this.from) {
        const end = this.to[key];
        if (end === void 0) {
          continue;
        }
        bag[key] = start + (end - start) * progress;
      }
    }
  }
  class TweenSequence {
    constructor(tweens, onComplete) {
      __publicField(this, "tweens");
      __publicField(this, "onComplete");
      __publicField(this, "index", 0);
      __publicField(this, "done", false);
      this.tweens = tweens;
      this.onComplete = onComplete;
    }
    /** 序列是否已跑完（空序列在第一次 `update` 时即算完成）。 */
    get isComplete() {
      return this.done;
    }
    get isRunning() {
      return !this.done;
    }
    /** 用 `dt` 秒推进：时间依次流过序列里的各条补间，多余的 dt 不会丢弃。 */
    update(dt) {
      let remaining = dt;
      while (!this.done) {
        const current = this.tweens[this.index];
        if (current === void 0) {
          this.done = true;
          this.onComplete?.();
          return;
        }
        if (current.isComplete) {
          this.index += 1;
          continue;
        }
        if (remaining <= 0) {
          return;
        }
        const step = Math.min(remaining, current.remaining);
        current.update(step);
        remaining -= step;
      }
    }
  }
  const PADDING_X = 12;
  const PADDING_Y = 8;
  const LABEL_FONT_SIZE = 14;
  const SUB_LABEL_FONT_SIZE = 10;
  const LABEL_LINE_HEIGHT = 20;
  const SUB_LABEL_LINE_HEIGHT = 14;
  const MIN_WIDTH = 72;
  const DEFAULT_PRESS_SCALE = 0.92;
  const DEFAULT_COLOR = "#63b3ed";
  const BACKGROUND_COLOR$1 = "#1a202c";
  const SUB_LABEL_COLOR = "#9ca3af";
  const DISABLED_COLOR = "#6b7280";
  class Button extends Node {
    constructor(options) {
      super();
      __publicField(this, "label");
      __publicField(this, "subLabel");
      __publicField(this, "color");
      /** 按下时的缩放系数。 */
      __publicField(this, "pressScale");
      __publicField(this, "tapHandler");
      __publicField(this, "_disabled");
      __publicField(this, "_width");
      __publicField(this, "_height");
      this.label = options.label;
      this.subLabel = options.subLabel ?? "";
      this.color = options.color ?? DEFAULT_COLOR;
      this.tapHandler = options.onTap;
      this.pressScale = options.pressScale ?? DEFAULT_PRESS_SCALE;
      this._disabled = options.disabled ?? false;
      this._width = options.width ?? autoWidth(this.label, this.subLabel);
      this._height = options.height ?? autoHeight(this.subLabel);
      this.applySize();
      this.onTouchStart = () => this.press();
      this.onTouchEnd = () => this.release();
      this.onTap = () => {
        if (!this._disabled) {
          this.tapHandler?.(this);
        }
      };
    }
    /** 禁用态：置灰、不响应按压、不派发 `onTap`。 */
    get disabled() {
      return this._disabled;
    }
    set disabled(value) {
      this._disabled = value;
      if (value) {
        this.release();
      }
    }
    get width() {
      return this._width;
    }
    /** 改尺寸时同步把命中区重新居中到原点。 */
    set width(value) {
      this._width = value;
      this.applySize();
    }
    get height() {
      return this._height;
    }
    set height(value) {
      this._height = value;
      this.applySize();
    }
    getSize() {
      return { width: this._width, height: this._height };
    }
    /** 按下：进入缩放反馈态（禁用时忽略）。 */
    press() {
      if (this._disabled) {
        return;
      }
      this.scaleX = this.pressScale;
      this.scaleY = this.pressScale;
    }
    /** 抬起（或取消）：恢复常态缩放。 */
    release() {
      this.scaleX = 1;
      this.scaleY = 1;
    }
    /** 画一个底色方块 + 描边 + 标题/副标题；变换与透明度已由 `Node.render` 就位。 */
    renderSelf(ctx) {
      const left = -this._width / 2;
      const top = -this._height / 2;
      const accent = this._disabled ? DISABLED_COLOR : this.color;
      ctx.fillStyle = BACKGROUND_COLOR$1;
      ctx.fillRect(left, top, this._width, this._height);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, this._width, this._height);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = accent;
      ctx.font = `bold ${LABEL_FONT_SIZE}px monospace`;
      ctx.fillText(this.label, 0, top + PADDING_Y + LABEL_LINE_HEIGHT / 2);
      if (this.subLabel !== "") {
        ctx.fillStyle = this._disabled ? DISABLED_COLOR : SUB_LABEL_COLOR;
        ctx.font = `${SUB_LABEL_FONT_SIZE}px monospace`;
        ctx.fillText(
          this.subLabel,
          0,
          top + PADDING_Y + LABEL_LINE_HEIGHT + SUB_LABEL_LINE_HEIGHT / 2
        );
      }
    }
    /** 把命中区重新居中到原点。 */
    applySize() {
      this.hitArea = {
        x: -this._width / 2,
        y: -this._height / 2,
        width: this._width,
        height: this._height
      };
    }
  }
  function autoWidth(label, subLabel) {
    const contentWidth = Math.max(
      measureText(label, LABEL_FONT_SIZE),
      measureText(subLabel, SUB_LABEL_FONT_SIZE)
    );
    return Math.max(MIN_WIDTH, PADDING_X * 2 + contentWidth);
  }
  function autoHeight(subLabel) {
    const lines = subLabel === "" ? LABEL_LINE_HEIGHT : LABEL_LINE_HEIGHT + SUB_LABEL_LINE_HEIGHT;
    return PADDING_Y * 2 + lines;
  }
  function measureText(text, fontSize) {
    let width = 0;
    for (const char of text) {
      width += isFullWidth$1(char) ? fontSize : fontSize / 2;
    }
    return width;
  }
  function isFullWidth$1(char) {
    return (char.codePointAt(0) ?? 0) >= 11904;
  }
  const DEFAULT_MAX_COLUMNS = 2;
  const DEFAULT_GAP_X = 12;
  const DEFAULT_GAP_Y = 10;
  class ActionBarView extends Container {
    constructor(options) {
      super();
      /** 面板是否允许玩家操作；改完需调用 `refresh()` 重新投影。 */
      __publicField(this, "interactive");
      __publicField(this, "turnManager");
      __publicField(this, "availableWidth");
      __publicField(this, "maxColumns");
      __publicField(this, "gapX");
      __publicField(this, "gapY");
      /** 按动作键复用按钮，避免每次重排都重建节点（保住按压反馈与节点身份）。 */
      __publicField(this, "buttonsByKey", /* @__PURE__ */ new Map());
      /** 当前排版顺序的按钮（与 `getAvailableActions()` 顺序一致）。 */
      __publicField(this, "buttons", []);
      __publicField(this, "unsubscribes", []);
      this.turnManager = options.turnManager;
      this.availableWidth = options.width;
      this.maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;
      this.gapX = options.gapX ?? DEFAULT_GAP_X;
      this.gapY = options.gapY ?? DEFAULT_GAP_Y;
      this.interactive = options.interactive ?? true;
      this.y = options.y ?? 0;
      this.unsubscribes.push(
        this.turnManager.getEventBus().on("action:executed", () => this.refresh())
      );
    }
    /** 当前排版的按钮，顺序与候选动作一致。 */
    getButtons() {
      return this.buttons;
    }
    /**
     * 按 `TurnManager` 的最新候选动作重新投影：
     * 新候选补按钮、消失的候选摘按钮、当前不可执行的候选一律置灰。
     */
    refresh() {
      const actions = this.turnManager.getAvailableActions();
      const enabled = this.canExecuteNow();
      const liveKeys = new Set(actions.map(actionKey));
      for (const [key, button] of this.buttonsByKey) {
        if (!liveKeys.has(key)) {
          this.removeChild(button);
          this.buttonsByKey.delete(key);
        }
      }
      this.buttons.length = 0;
      for (const action of actions) {
        const key = actionKey(action);
        let button = this.buttonsByKey.get(key);
        if (button === void 0) {
          button = this.createButton(action);
          this.buttonsByKey.set(key, button);
          this.addChild(button);
        }
        button.disabled = !enabled;
        this.buttons.push(button);
      }
      this.layout();
    }
    /** 退订核心事件（场景销毁时调用）。 */
    dispose() {
      for (const unsubscribe of this.unsubscribes) {
        unsubscribe();
      }
      this.unsubscribes.length = 0;
    }
    createButton(action) {
      const formatted = formatActionButton(action);
      return new Button({
        label: formatted.label,
        subLabel: formatted.subLabel,
        color: formatted.color,
        onTap: () => this.dispatch(action)
      });
    }
    /** 派发前再校验一次：只有仍处于可执行阶段、且仍是候选的动作才会提交给核心。 */
    dispatch(action) {
      if (!this.canExecuteNow()) {
        return;
      }
      if (!this.turnManager.getAvailableActions().some((c) => actionKey(c) === actionKey(action))) {
        return;
      }
      this.turnManager.executeAction(action);
    }
    /** 核心当前是否接受动作提交：面板可交互、非终局，且处于动作执行阶段。 */
    canExecuteNow() {
      if (!this.interactive) {
        return false;
      }
      if (this.turnManager.getState().isGameOver) {
        return false;
      }
      return this.turnManager.getCurrentPhase() === TurnPhase.EXECUTE_ACTION;
    }
    /** 等宽网格排版：`columns` 列、行内垂直居中，行高取该行最高的按钮。 */
    layout() {
      const count = this.buttons.length;
      if (count === 0) {
        return;
      }
      const columns = Math.max(1, Math.min(this.maxColumns, count));
      const cellWidth = Math.floor((this.availableWidth - (columns - 1) * this.gapX) / columns);
      const rowHeights = [];
      for (let index = 0; index < count; index += 1) {
        const row = Math.floor(index / columns);
        rowHeights[row] = Math.max(rowHeights[row] ?? 0, this.buttons[index].height);
      }
      let cursor = 0;
      for (let row = 0; row < rowHeights.length; row += 1) {
        const rowHeight = rowHeights[row];
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;
          if (index >= count) {
            break;
          }
          const button = this.buttons[index];
          button.width = cellWidth;
          button.x = column * (cellWidth + this.gapX) + cellWidth / 2;
          button.y = cursor + rowHeight / 2;
        }
        cursor += rowHeight + this.gapY;
      }
    }
  }
  function actionKey(action) {
    return [
      action.actionType,
      action.player,
      action.element ?? "",
      action.sourceElement ?? "",
      action.polarity ?? "",
      action.consumePolarity ?? ""
    ].join("|");
  }
  const WUXING_COUNT = 5;
  const RING_STEP = Math.PI * 2 / WUXING_COUNT;
  const SEAL_RADIUS_RATIO = 0.26;
  const SLOT_RADIUS_RATIO = 0.37;
  const DEFAULT_BOARD_LAYOUT = {
    centerX: 0,
    centerY: 0,
    sealRadius: 120,
    slotRadius: 170,
    slotSpread: 0.45,
    startAngle: -Math.PI / 2
  };
  const VOID_LEVEL = 0;
  const BOARD_BG_COLOR = "#111827";
  const VOID_COLOR = "#374151";
  const BLESSED_COLOR = "#f6e05e";
  const GUI_YI_COLOR = "#ecc94b";
  const SLOT_TEXT_COLOR = "#e2e8f0";
  const CONNECTION_IDLE = {
    generation: "#2f4f3f",
    overcoming: "#4a2a2a"
  };
  const CONNECTION_ACTIVE = {
    generation: "#48bb78",
    overcoming: "#e53e3e"
  };
  class BoardView extends Container {
    constructor(layout = {}) {
      super();
      __publicField(this, "_layout");
      __publicField(this, "_elements", []);
      __publicField(this, "_slots", []);
      __publicField(this, "_connections", []);
      __publicField(this, "_board", null);
      this._layout = { ...DEFAULT_BOARD_LAYOUT, ...layout };
      this._rebuild();
    }
    /** 当前生效的极坐标布局参数（快照副本）。 */
    get layout() {
      return { ...this._layout };
    }
    /** 按视口自适应：圆心取视口中心，环半径按短边等比缩放。 */
    resize(width, height) {
      const span = Math.min(width, height);
      this._layout = {
        ...this._layout,
        centerX: width / 2,
        centerY: height / 2,
        sealRadius: span * SEAL_RADIUS_RATIO,
        slotRadius: span * SLOT_RADIUS_RATIO
      };
      this._rebuild();
    }
    /** 五个五行主印，按相生环顺序排列。 */
    get elements() {
      return this._elements;
    }
    /** 十个阴阳槽位，按主印环顺序、每个主印先阴后阳排列。 */
    get slots() {
      return this._slots;
    }
    /** 十条生克连线：五条相生环边 + 五条相克星弦。 */
    get connections() {
      return this._connections;
    }
    /** 按主印与极性取一个槽位的投影视图。 */
    getSlot(element, polarity) {
      const elementIndex = this._elements.findIndex((entry) => entry.element === element);
      const slot = this._slots[elementIndex * 2 + (polarity === Polarity.YIN ? 0 : 1)];
      if (slot === void 0) {
        throw new Error(`法盘上不存在五行 ${element} 的 ${polarity} 槽位。`);
      }
      return slot;
    }
    /** 投影一份只读棋盘快照；只读不写回（LLD §4）。 */
    update(board) {
      this._board = board;
      this._rebuild();
    }
    /** 从只读 `GameState` 快照中取指定玩家的棋盘并投影。 */
    updateFromState(state, player) {
      this.update(state.players[player].board);
    }
    _rebuild() {
      this._elements.length = 0;
      this._slots.length = 0;
      this._connections.length = 0;
      const ring = buildGenerationRing();
      ring.forEach((element, index) => {
        const angle = this._layout.startAngle + index * RING_STEP;
        const node = this._board?.[element];
        const yin = node?.yin ?? VOID_LEVEL;
        const yang = node?.yang ?? VOID_LEVEL;
        const isGuiYi = yin >= 1 && yang >= 1;
        const isKangJi = yin === 2 && yang === 2;
        this._elements.push({
          element,
          angle,
          x: this._layout.centerX + this._layout.sealRadius * Math.cos(angle),
          y: this._layout.centerY + this._layout.sealRadius * Math.sin(angle),
          yin,
          yang,
          isGuiYi,
          isKangJi
        });
        this._slots.push(
          this._projectSlot(
            element,
            Polarity.YIN,
            yin,
            angle - this._layout.slotSpread,
            isGuiYi,
            isKangJi
          ),
          this._projectSlot(
            element,
            Polarity.YANG,
            yang,
            angle + this._layout.slotSpread,
            isGuiYi,
            isKangJi
          )
        );
      });
      for (const element of ring) {
        this._connections.push(
          this._projectConnection("generation", element, GENERATION_CYCLE[element]),
          this._projectConnection("overcoming", element, OVERCOMING_CYCLE[element])
        );
      }
    }
    _projectConnection(kind, from, to) {
      const source = this._elementView(from);
      const target = this._elementView(to);
      const node = this._board?.[from];
      return {
        kind,
        from,
        to,
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        active: node !== void 0 && (node.yin >= 1 || node.yang >= 1)
      };
    }
    _elementView(element) {
      const view = this._elements.find((entry) => entry.element === element);
      if (view === void 0) {
        throw new Error(`法盘上不存在五行 ${element}。`);
      }
      return view;
    }
    _projectSlot(element, polarity, level, angle, isGuiYi, isKangJi) {
      return {
        element,
        polarity,
        level,
        angle,
        x: this._layout.centerX + this._layout.slotRadius * Math.cos(angle),
        y: this._layout.centerY + this._layout.slotRadius * Math.sin(angle),
        isGuiYi,
        isKangJi
      };
    }
    /** 先画连线，再画槽位与主印（后者盖在前者之上）。 */
    renderSelf(ctx) {
      this._drawConnections(ctx);
      this._drawSlots(ctx);
      this._drawSeals(ctx);
    }
    /** 外环相生环 + 内星相克弦；源主印任一侧点亮（≥1）时转为活动色。 */
    _drawConnections(ctx) {
      for (const line of this._connections) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.strokeStyle = line.active ? CONNECTION_ACTIVE[line.kind] : CONNECTION_IDLE[line.kind];
        ctx.lineWidth = line.active ? 3 : 1.5;
        ctx.lineCap = "round";
        if (line.kind === "overcoming") {
          ctx.setLineDash([6, 5]);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    /** 十个阴阳槽位：-1 道损 / 0 虚空 / 1 点亮 / 2 加持 四档着色，归一与亢极加金环。 */
    _drawSlots(ctx) {
      const radius = Math.max(8, this._layout.slotRadius * 0.07);
      for (const slot of this._slots) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = BOARD_BG_COLOR;
        ctx.fill();
        ctx.lineWidth = slot.level === 2 ? 4 : 2;
        ctx.strokeStyle = slotColor(slot.level, slot.element);
        ctx.stroke();
        ctx.fillStyle = slot.level >= 1 ? SLOT_TEXT_COLOR : VOID_COLOR;
        ctx.font = `bold ${Math.round(radius)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(slot.polarity === Polarity.YIN ? "阴" : "阳", slot.x, slot.y);
        if (slot.isGuiYi) {
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = slot.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
          ctx.lineWidth = slot.isKangJi ? 3 : 1.5;
          ctx.setLineDash(slot.isKangJi ? [] : [3, 3]);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    /** 五个五行主印：底盘 + 阴/阳半环 + 归一/亢极高亮 + 五行名。 */
    _drawSeals(ctx) {
      const sealRadius = Math.max(14, this._layout.sealRadius * 0.22);
      for (const entry of this._elements) {
        const palette = WUXING_PALETTE[entry.element];
        ctx.save();
        ctx.beginPath();
        ctx.arc(entry.x, entry.y, sealRadius, 0, Math.PI * 2);
        ctx.fillStyle = BOARD_BG_COLOR;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = entry.isKangJi ? BLESSED_COLOR : palette.dark;
        ctx.stroke();
        drawHalfRing(ctx, entry.x, entry.y, sealRadius + 4, true, entry.yin, entry.element);
        drawHalfRing(ctx, entry.x, entry.y, sealRadius + 4, false, entry.yang, entry.element);
        if (entry.isGuiYi) {
          ctx.beginPath();
          ctx.arc(entry.x, entry.y, sealRadius + 9, 0, Math.PI * 2);
          ctx.strokeStyle = entry.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
          ctx.lineWidth = entry.isKangJi ? 3 : 1.5;
          ctx.setLineDash(entry.isKangJi ? [] : [4, 3]);
          ctx.stroke();
        }
        ctx.fillStyle = palette.light;
        ctx.font = `bold ${Math.round(Math.max(10, sealRadius * 0.55))}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(palette.name, entry.x, entry.y);
        if (entry.isGuiYi) {
          ctx.fillStyle = entry.isKangJi ? BLESSED_COLOR : GUI_YI_COLOR;
          ctx.font = `${Math.round(Math.max(9, sealRadius * 0.45))}px monospace`;
          ctx.fillText(entry.isKangJi ? "亢极" : "归一", entry.x, entry.y + sealRadius + 14);
        }
        ctx.restore();
      }
    }
  }
  function slotColor(level, element) {
    const palette = WUXING_PALETTE[element];
    switch (level) {
      case -1:
        return palette.dark;
      case 0:
        return VOID_COLOR;
      case 1:
        return palette.main;
      case 2:
        return BLESSED_COLOR;
    }
  }
  function drawHalfRing(ctx, x, y, radius, isYin, level, element) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      radius,
      isYin ? Math.PI * 0.5 : -Math.PI * 0.5,
      isYin ? Math.PI * 1.5 : Math.PI * 0.5
    );
    ctx.strokeStyle = slotColor(level, element);
    ctx.lineWidth = level === 2 ? 6 : level === 0 ? 2 : 4;
    ctx.lineCap = "round";
    if (level === -1) {
      ctx.setLineDash([4, 3]);
    }
    ctx.stroke();
    ctx.restore();
  }
  function buildGenerationRing() {
    const ring = [];
    let current = WuXing.WOOD;
    for (let index = 0; index < WUXING_COUNT; index += 1) {
      ring.push(current);
      current = GENERATION_CYCLE[current];
    }
    return ring;
  }
  const AVATAR_SIZE = 54;
  const SIDE_MARGIN = 10;
  const TOP_BAR_HEIGHT = 26;
  const BANNER_GAP = 10;
  const BANNER_HEIGHT = 68;
  const PANEL_COLOR = "#111827";
  const PANEL_BORDER = "#374151";
  const ACTIVE_COLOR = "#f6e05e";
  const EXTRA_TURN_COLOR = "#4fd1c5";
  const TEXT_COLOR = "#e2e8f0";
  const MUTED_COLOR = "#9ca3af";
  const P1_COLOR = "#63b3ed";
  const P2_COLOR = "#b794f4";
  const HURT_COLOR = "#fc8181";
  const EXPRESSION_COLOR = {
    idle: null,
    attack: "#f6e05e",
    hurt: HURT_COLOR,
    cast: "#4fd1c5"
  };
  const PLAYER_LABEL = { P1: "玩家 P1", P2: "天道 P2" };
  const PLAYER_COLOR = { P1: P1_COLOR, P2: P2_COLOR };
  class CharacterView extends Container {
    constructor(options) {
      super();
      __publicField(this, "_width");
      __publicField(this, "_height");
      __publicField(this, "_safeTop");
      __publicField(this, "_round", 0);
      __publicField(this, "_maxRounds", 0);
      __publicField(this, "_currentPlayer", null);
      __publicField(this, "_isExtraTurn", false);
      __publicField(this, "_scores", { P1: 0, P2: 0 });
      __publicField(this, "_expressions", { P1: "idle", P2: "idle" });
      __publicField(this, "_expressionTimers", { P1: 0, P2: 0 });
      __publicField(this, "_bubbles", {
        P1: null,
        P2: null
      });
      __publicField(this, "_bannerText", "");
      __publicField(this, "_bannerSubText", "");
      /** 头像呼吸动画的累积时间（秒）。 */
      __publicField(this, "_tick", 0);
      this._width = options.width;
      this._height = options.height;
      this._safeTop = options.safeTop ?? 24;
    }
    /** 当前视口尺寸（投影与安全区自适应的入参）。 */
    get viewport() {
      return { width: this._width, height: this._height };
    }
    /** 回合数（未投影时为 0）。 */
    get round() {
      return this._round;
    }
    /** 回合上限（未投影时为 0）。 */
    get maxRounds() {
      return this._maxRounds;
    }
    /** 当前行动方（未投影时为 null）。 */
    get currentPlayer() {
      return this._currentPlayer;
    }
    /** 当前是否处于连动额外行动。 */
    get isExtraTurn() {
      return this._isExtraTurn;
    }
    /** 指定玩家的比分。 */
    scoreOf(player) {
      return this._scores[player];
    }
    /** 当前横幅主文案。 */
    get bannerText() {
      return this._bannerText;
    }
    /** 当前横幅副文案。 */
    get bannerSubText() {
      return this._bannerSubText;
    }
    /** 按只读快照投影回合、比分与当前行动方。 */
    update(state, options = {}) {
      this._round = state.round;
      this._maxRounds = state.maxRounds;
      this._currentPlayer = state.currentPlayer;
      this._isExtraTurn = options.isExtraTurn ?? false;
      this._scores = { P1: state.players.P1.score, P2: state.players.P2.score };
    }
    /** 视口自适应（安全区与宽度变化时调用）。 */
    resize(width, height, safeTop) {
      this._width = width;
      this._height = height;
      this._safeTop = safeTop ?? this._safeTop;
    }
    /** 表情反馈：`holdSeconds` 秒后自动回落待机；重复触发会重新计时。 */
    setExpression(player, expression, holdSeconds = 0.6) {
      this._expressions[player] = expression;
      this._expressionTimers[player] = expression === "idle" ? 0 : Math.max(0, holdSeconds);
    }
    /** 指定玩家当前的表情。 */
    getExpression(player) {
      return this._expressions[player];
    }
    /** 气泡播报：`holdSeconds` 秒后消散。 */
    announce(player, text, holdSeconds = 1.6) {
      this._bubbles[player] = { text, timer: Math.max(0, holdSeconds) };
    }
    /** 指定玩家当前的气泡文案（无气泡时为 null）。 */
    getBubble(player) {
      return this._bubbles[player]?.text ?? null;
    }
    /** 横幅播报：主文案 + 可选副文案，常驻直到下一次播报。 */
    showBanner(mainText, subText = "") {
      this._bannerText = mainText;
      this._bannerSubText = subText;
    }
    /** 由调用方每帧驱动（秒）：推进呼吸动画与表情/气泡的衰减。 */
    updateTimers(dt) {
      this._tick += dt;
      for (const player of PLAYER_IDS) {
        if (this._expressionTimers[player] > 0) {
          this._expressionTimers[player] -= dt;
          if (this._expressionTimers[player] <= 0) {
            this._expressionTimers[player] = 0;
            this._expressions[player] = "idle";
          }
        }
        const bubble = this._bubbles[player];
        if (bubble !== null) {
          bubble.timer -= dt;
          if (bubble.timer <= 0) {
            this._bubbles[player] = null;
          }
        }
      }
    }
    /** 先画横幅与头像，再画回合信息条（后者盖在上层）。 */
    renderSelf(ctx) {
      this.drawBanner(ctx);
      for (const player of PLAYER_IDS) {
        this.drawAvatar(ctx, player);
      }
      this.drawTurnStrip(ctx);
    }
    drawTurnStrip(ctx) {
      ctx.save();
      ctx.fillStyle = MUTED_COLOR;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `回合 ${this._round}/${this._maxRounds}`,
        this._width / 2,
        this._safeTop + TOP_BAR_HEIGHT / 2
      );
      if (this._isExtraTurn) {
        ctx.fillStyle = EXTRA_TURN_COLOR;
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "left";
        ctx.fillText("连动", SIDE_MARGIN, this._safeTop + TOP_BAR_HEIGHT / 2);
      }
      ctx.restore();
    }
    drawAvatar(ctx, player) {
      const isPlayer = player === "P1";
      const frameX = isPlayer ? SIDE_MARGIN : this._width - SIDE_MARGIN - AVATAR_SIZE;
      const frameY = this._safeTop + TOP_BAR_HEIGHT + 4;
      const isCurrent = this._currentPlayer === player;
      const expression = this._expressions[player];
      const border = EXPRESSION_COLOR[expression] ?? (isCurrent ? ACTIVE_COLOR : isPlayer ? P1_COLOR : P2_COLOR);
      ctx.save();
      drawPixelBox(ctx, frameX, frameY, AVATAR_SIZE, AVATAR_SIZE, PANEL_COLOR, border, 2);
      ctx.save();
      ctx.translate(frameX + AVATAR_SIZE / 2, frameY + AVATAR_SIZE / 2 + 6);
      ctx.scale(0.66, 0.66);
      drawPixelCharacter(ctx, 0, 0, isPlayer, expression, this._tick * 60);
      ctx.restore();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PLAYER_COLOR[player];
      ctx.font = "bold 11px monospace";
      ctx.fillText(PLAYER_LABEL[player], frameX + AVATAR_SIZE / 2, frameY + AVATAR_SIZE + 12);
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "bold 12px monospace";
      ctx.fillText(`${this._scores[player]} 分`, frameX + AVATAR_SIZE / 2, frameY + AVATAR_SIZE + 26);
      if (isCurrent) {
        ctx.fillStyle = this._isExtraTurn ? EXTRA_TURN_COLOR : ACTIVE_COLOR;
        ctx.font = "bold 10px monospace";
        ctx.fillText(
          this._isExtraTurn ? "连动行动中" : "行动中",
          frameX + AVATAR_SIZE / 2,
          frameY + AVATAR_SIZE + 40
        );
      }
      const bubble = this._bubbles[player];
      if (bubble !== null) {
        this.drawBubble(ctx, player, frameX, frameY, bubble.text);
      }
      ctx.restore();
    }
    /** 气泡：挂在头像上方，宽度按头像列夹紧，文本超宽时截断。 */
    drawBubble(ctx, player, frameX, frameY, text) {
      const isPlayer = player === "P1";
      const maxWidth = this._width / 2 - SIDE_MARGIN * 2;
      const fontSize = 10;
      const label = truncateToWidth(text, maxWidth - 12, fontSize);
      const width = estimateTextWidth(label, fontSize) + 12;
      const height = 20;
      const x = isPlayer ? Math.min(frameX, Math.max(SIDE_MARGIN, frameX + AVATAR_SIZE - width)) : Math.max(frameX + AVATAR_SIZE - width, this._width - SIDE_MARGIN - width);
      const y = frameY - height - 4;
      drawPixelRect(ctx, x, y, width, height, "#1a202c");
      drawPixelRect(ctx, x, y, width, 2, EXTRA_TURN_COLOR);
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + width / 2, y + height / 2 + 1);
    }
    /** 横幅：主文案（12px，最多两行）+ 副文案（9px，最多两行）。 */
    drawBanner(ctx) {
      if (this._bannerText === "" && this._bannerSubText === "") {
        return;
      }
      const x = SIDE_MARGIN + AVATAR_SIZE + BANNER_GAP;
      const width = Math.max(80, this._width - 2 * x);
      const y = this._safeTop + TOP_BAR_HEIGHT + 4;
      ctx.save();
      drawPixelBox(ctx, x, y, width, BANNER_HEIGHT, "#171e2e", PANEL_BORDER, 2);
      const textWidth = width - 16;
      const mainLines = wrapText(this._bannerText, textWidth, 12, 2);
      const subLines = wrapText(this._bannerSubText, textWidth, 9, 2);
      const mainLineHeight = 16;
      const subLineHeight = 12;
      const blockHeight = mainLines.length * mainLineHeight + subLines.length * subLineHeight;
      let cursor = y + (BANNER_HEIGHT - blockHeight) / 2 + mainLineHeight / 2;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = "bold 12px monospace";
      for (const line of mainLines) {
        ctx.fillText(line, x + width / 2, cursor);
        cursor += mainLineHeight;
      }
      ctx.fillStyle = MUTED_COLOR;
      ctx.font = "9px monospace";
      for (const line of subLines) {
        ctx.fillText(line, x + width / 2, cursor);
        cursor += subLineHeight;
      }
      ctx.restore();
    }
  }
  const PLAYER_IDS = ["P1", "P2"];
  function estimateTextWidth(text, fontSize) {
    let width = 0;
    for (const char of text) {
      width += isFullWidth(char) ? fontSize * 1.2 : fontSize * 0.6;
    }
    return width;
  }
  function wrapText(text, maxWidth, fontSize, maxLines) {
    if (text === "") {
      return [];
    }
    const lines = [];
    let current = "";
    for (const char of text) {
      const next = current + char;
      if (current !== "" && estimateTextWidth(next, fontSize) > maxWidth) {
        lines.push(current);
        current = char;
        if (lines.length === maxLines) {
          break;
        }
      } else {
        current = next;
      }
    }
    if (lines.length < maxLines && current !== "") {
      lines.push(current);
    }
    if ([...lines.join("")].length < [...text].length) {
      const last = lines[lines.length - 1] ?? "";
      lines[lines.length - 1] = `${truncateToWidth(last, maxWidth, fontSize)}…`;
    }
    return lines;
  }
  function truncateToWidth(text, maxWidth, fontSize) {
    if (estimateTextWidth(text, fontSize) <= maxWidth) {
      return text;
    }
    const chars = [...text];
    while (chars.length > 1 && estimateTextWidth(`${chars.join("")}…`, fontSize) > maxWidth) {
      chars.pop();
    }
    return `${chars.join("")}…`;
  }
  function isFullWidth(char) {
    return (char.codePointAt(0) ?? 0) >= 11904;
  }
  const DEFAULT_ENTRANCE_DURATION = 0.44;
  const DEFAULT_FLIGHT_DURATION = 0.55;
  const DEFAULT_IMPACT_DURATION = 0.35;
  const ENTRANCE_START_SCALE = 0.55;
  const TICK_RATE = 60;
  const METEOR_ARC = 34;
  const SERPENTINE_AMPLITUDE = 16;
  const SERPENTINE_WAVES = 3;
  const IMPACT_MAX_RADIUS = 46;
  const ABSORB_SHRINK = 0.45;
  const CORONA_COLOR = "#f6e05e";
  const CORONA_RAY_COUNT = 12;
  const CORONA_RADIUS = 54;
  const MOONLIGHT_COLOR = "#c3dafe";
  const MOON_RADIUS = 48;
  class RuneFlightView extends Container {
    constructor(options) {
      super();
      __publicField(this, "board");
      __publicField(this, "centerX");
      __publicField(this, "centerY");
      __publicField(this, "entranceDuration");
      __publicField(this, "flightDuration");
      __publicField(this, "impactDuration");
      __publicField(this, "rune");
      __publicField(this, "ripple");
      /** 入场补间写入的进度（0~1），符文透明度与缩放是它的纯投影。 */
      __publicField(this, "entranceState", { progress: 0 });
      /** 飞行补间写入的进度（0~1），符文位置是它的纯投影。 */
      __publicField(this, "flightState", { progress: 0 });
      /** 波纹补间写入的进度（0~1），扩散半径与符文吸收是它的纯投影。 */
      __publicField(this, "impactState", { progress: 0 });
      __publicField(this, "_phase", "hidden");
      __publicField(this, "_tianGan", null);
      __publicField(this, "_haloStyle", "corona");
      __publicField(this, "tick", 0);
      __publicField(this, "entrance", null);
      __publicField(this, "entranceOnComplete");
      __publicField(this, "flight", null);
      __publicField(this, "flightOnComplete");
      this.board = options.board;
      this.centerX = options.centerX ?? 0;
      this.centerY = options.centerY ?? 0;
      this.entranceDuration = options.entranceDuration ?? DEFAULT_ENTRANCE_DURATION;
      this.flightDuration = options.flightDuration ?? DEFAULT_FLIGHT_DURATION;
      this.impactDuration = options.impactDuration ?? DEFAULT_IMPACT_DURATION;
      const mode = options.mode ?? "flow";
      this.rune = new RuneNode(mode);
      this.rune.x = this.centerX;
      this.rune.y = this.centerY;
      this.rune.visible = false;
      this.addChild(this.rune);
      this.ripple = new ImpactNode(mode);
      this.ripple.visible = false;
      this.addChild(this.ripple);
    }
    /** 当前动效阶段。 */
    get phase() {
      return this._phase;
    }
    /** 入场 / 飞行 / 波纹是否仍在播放；为 false 时调用方可交回回合控制权。 */
    get isAnimating() {
      return this._phase === "entering" || this._phase === "flying" || this._phase === "impact";
    }
    /** 当前天干（未入场时为 null）。 */
    get tianGan() {
      return this._tianGan;
    }
    /** 入场光晕样式（阳：金乌日冕，阴：玄阴幽光）。 */
    get haloStyle() {
      return this._haloStyle;
    }
    /** 符文锚点在父坐标系里的位置（浮空摆动是绘制内部的视觉偏移，不体现在这里）。 */
    get position() {
      return { x: this.rune.x, y: this.rune.y };
    }
    /**
     * 回合启动：设定本回合天干并从屏幕中央浮空降临。
     * 入场结束后回调 `onComplete`，此时阶段回到 `ready`（可以接受 `flyTo`）。
     */
    playEntrance(tianGan, options = {}) {
      this.flight = null;
      this.flightOnComplete = void 0;
      this._tianGan = tianGan;
      this._haloStyle = tianGan.polarity === Polarity.YANG ? "corona" : "moonlight";
      this.rune.tianGan = tianGan;
      this.rune.haloStyle = this._haloStyle;
      this.rune.x = this.centerX;
      this.rune.y = this.centerY;
      this.rune.alpha = 0;
      this.rune.scaleX = ENTRANCE_START_SCALE;
      this.rune.scaleY = ENTRANCE_START_SCALE;
      this.rune.visible = true;
      this.ripple.visible = false;
      this.entranceState.progress = 0;
      this.entranceOnComplete = options.onComplete;
      this._phase = "entering";
      this.entrance = new Tween(
        this.entranceState,
        { progress: 1 },
        {
          duration: this.entranceDuration,
          easing: EASINGS.outCubic,
          onUpdate: (progress) => this.applyEntrance(progress),
          onComplete: () => {
            this.finishEntrance();
            const onComplete = this.entranceOnComplete;
            this.entranceOnComplete = void 0;
            onComplete?.();
          }
        }
      );
    }
    /** 由调用方每帧驱动；`dt` 单位为秒。 */
    update(dt) {
      this.tick += dt * TICK_RATE;
      this.rune.tick = this.tick;
      this.entrance?.update(dt);
      this.flight?.update(dt);
    }
    /**
     * 动作选定：符文从当前位置飞向目标槽位（坐标取自 `BoardView.getSlot()`），
     * 命中后触发波纹并让符文被吸收。**波纹也跑完**才回调 `onComplete`，
     * 此时 `isAnimating` 为 false，调用方可以交回回合控制权。
     *
     * 入场还没跑完就调用时，先把入场收尾再起飞（玩家点得比动画快也不会丢飞行）；
     * 从未 `playEntrance()` 或已在飞行中则直接报错。
     */
    flyTo(element, polarity, options = {}) {
      if (this._phase === "entering") {
        this.finishEntrance();
        this.entranceOnComplete = void 0;
      }
      const tianGan = this._tianGan;
      if (this._phase !== "ready" || tianGan === null) {
        throw new Error("符文不在待机态，无法起飞；请先 playEntrance() 并等它落地。");
      }
      const target = this.board.getSlot(element, polarity);
      const startX = this.rune.x;
      const startY = this.rune.y;
      const deltaX = target.x - startX;
      const deltaY = target.y - startY;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const normalX = -deltaY / length;
      const normalY = deltaX / length;
      const isYang = tianGan.polarity === Polarity.YANG;
      this.flightState.progress = 0;
      this._phase = "flying";
      this.flightOnComplete = options.onComplete;
      const flightTween = new Tween(
        this.flightState,
        { progress: 1 },
        {
          duration: this.flightDuration,
          easing: EASINGS.outCubic,
          onUpdate: (progress) => {
            const curve = isYang ? -Math.sin(progress * Math.PI) * METEOR_ARC : Math.sin(progress * Math.PI * SERPENTINE_WAVES) * SERPENTINE_AMPLITUDE;
            this.rune.x = startX + deltaX * progress + normalX * curve;
            this.rune.y = startY + deltaY * progress + normalY * curve;
          },
          onComplete: () => {
            this.rune.x = target.x;
            this.rune.y = target.y;
            this._phase = "impact";
          }
        }
      );
      this.flight = new TweenSequence(
        [flightTween, this.buildImpactTween(target.x, target.y, tianGan.element)],
        () => {
          this.flight = null;
          this.ripple.visible = false;
          this._phase = "absorbed";
          const onComplete = this.flightOnComplete;
          this.flightOnComplete = void 0;
          onComplete?.();
        }
      );
    }
    /** 命中波纹：以目标槽位为圆心扩散，同时符文被吸收（缩小 + 淡出）。 */
    buildImpactTween(targetX, targetY, element) {
      const palette = WUXING_PALETTE[element];
      this.impactState.progress = 0;
      this.ripple.x = targetX;
      this.ripple.y = targetY;
      this.ripple.maxRadius = IMPACT_MAX_RADIUS;
      this.ripple.color = palette.main;
      this.ripple.lightColor = palette.light;
      this.ripple.visible = true;
      return new Tween(
        this.impactState,
        { progress: 1 },
        {
          duration: this.impactDuration,
          easing: EASINGS.outQuad,
          onUpdate: (progress) => this.applyImpact(progress)
        }
      );
    }
    /** 结束入场：符文落到待机态（补间正常跑完与被动作抢跑两条路径共用）。 */
    finishEntrance() {
      this.entrance = null;
      this.applyEntrance(1);
      this._phase = "ready";
    }
    /** 入场进度的投影：透明度与缩放。 */
    applyEntrance(progress) {
      this.rune.alpha = progress;
      const scale = ENTRANCE_START_SCALE + (1 - ENTRANCE_START_SCALE) * progress;
      this.rune.scaleX = scale;
      this.rune.scaleY = scale;
    }
    /** 命中进度的投影：波纹半径 + 符文被吸收。 */
    applyImpact(progress) {
      this.ripple.radius = IMPACT_MAX_RADIUS * progress;
      this.ripple.alpha = 1 - progress;
      this.rune.alpha = 1 - progress;
      const scale = 1 - ABSORB_SHRINK * progress;
      this.rune.scaleX = scale;
      this.rune.scaleY = scale;
    }
  }
  class RuneNode extends Node {
    constructor(mode) {
      super();
      __publicField(this, "tianGan", null);
      __publicField(this, "haloStyle", "corona");
      /** 动画帧计数，交给 `drawCenterTianGanRune` 驱动呼吸与旋转。 */
      __publicField(this, "tick", 0);
      __publicField(this, "mode");
      this.mode = mode;
    }
    renderSelf(ctx) {
      const tianGan = this.tianGan;
      if (tianGan === null) {
        return;
      }
      const palette = WUXING_PALETTE[tianGan.element];
      if (this.haloStyle === "corona") {
        this.drawCorona(ctx, palette.light);
      } else {
        this.drawMoonlight(ctx, palette.light);
      }
      drawCenterTianGanRune(ctx, 0, 0, tianGan, this.mode, this.tick);
    }
    /** 金乌日冕：暖金色放射日珥 + 随呼吸胀缩的光晕。 */
    drawCorona(ctx, elementLight) {
      const radius = CORONA_RADIUS * (1 + Math.sin(this.tick * 0.08) * 0.06);
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
      grad.addColorStop(0, `${CORONA_COLOR}55`);
      grad.addColorStop(0.55, `${elementLight}33`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `${CORONA_COLOR}aa`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let index = 0; index < CORONA_RAY_COUNT; index += 1) {
        const angle = index * Math.PI * 2 / CORONA_RAY_COUNT + this.tick * 0.01;
        ctx.moveTo(Math.cos(angle) * radius * 0.74, Math.sin(angle) * radius * 0.74);
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.stroke();
    }
    /** 玄阴幽光：冷月色光晕 + 缓转的弦月弧。 */
    drawMoonlight(ctx, elementLight) {
      const radius = MOON_RADIUS * (1 + Math.sin(this.tick * 0.05) * 0.05);
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
      grad.addColorStop(0, `${MOONLIGHT_COLOR}44`);
      grad.addColorStop(0.6, `${elementLight}22`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      const phase = this.tick * 0.012;
      ctx.strokeStyle = `${MOONLIGHT_COLOR}cc`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.84, phase, phase + Math.PI * 0.9);
      ctx.stroke();
    }
  }
  class ImpactNode extends Node {
    constructor(mode) {
      super();
      __publicField(this, "radius", 0);
      __publicField(this, "maxRadius", IMPACT_MAX_RADIUS);
      __publicField(this, "color", "#ffffff");
      __publicField(this, "lightColor", "#ffffff");
      __publicField(this, "mode");
      this.mode = mode;
    }
    renderSelf(ctx) {
      if (this.radius <= 0) {
        return;
      }
      drawImpactEffect(ctx, {
        x: 0,
        y: 0,
        radius: this.radius,
        maxRadius: this.maxRadius,
        color: this.color,
        lightColor: this.lightColor,
        // 绘制例程直接赋值 `globalAlpha`，这里把节点自身的淡出值传进去。
        alpha: this.alpha,
        mode: this.mode
      });
    }
  }
  const DEFAULT_SAFE_TOP = 24;
  const DEFAULT_SAFE_BOTTOM = 12;
  const DEFAULT_AUTO_EXECUTE_DELAY = 0.75;
  const DEFAULT_AI_THINK_DELAY = 0.55;
  const DEFAULT_EXPRESSION_HOLD = 0.6;
  const ACTION_BAR_HEIGHT = 130;
  const ACTION_BAR_MARGIN = 14;
  const SHAKE_DURATION = 0.28;
  const SHAKE_BURST = 8;
  const SHAKE_ATTACK = 4;
  const SHAKE_SHOWDOWN = 6;
  const BACKGROUND_COLOR = "#0a0d14";
  const ARENA_GLOW_COLOR = "#1f2937";
  function describeAutoFlow(actionType) {
    switch (actionType) {
      case ActionType.AUTO:
        return "自动吸纳中";
      case ActionType.DISSIPATE:
        return "亢极满溢·散气回落中";
      case ActionType.PASS:
        return "道法受阻·消散过牌中";
      case ActionType.ATK:
        return "唯一机缘·破";
      case ActionType.TRANS:
        return "唯一机缘·化";
      case ActionType.CONVERT:
        return "势在必行·调息";
      case ActionType.BURST:
        return "势在必行·强化";
      case ActionType.BURST_ATK:
        return "势在必行·强破";
    }
  }
  function describeEndReason(endReason) {
    switch (endReason) {
      case "GUI_YUAN":
        return "五行归元";
      case "MAX_ROUNDS":
        return "终局回合结算";
      default:
        return "对局结束";
    }
  }
  class GameScene extends Container {
    constructor(options) {
      super();
      /** 五行法盘视图（与符文层同一父节点、零位移，见 RuneFlightView 的挂载前提）。 */
      __publicField(this, "board");
      /** 天干降临与飞行动效视图；视口变化时会被重建（见 `resize`）。 */
      __publicField(this, "runeFlight");
      /** 双方角色卡视图。 */
      __publicField(this, "characters");
      /** 操作面板视图；唯一候选时整体隐藏（ADR 0008）。 */
      __publicField(this, "actionBar");
      __publicField(this, "_turnManager");
      __publicField(this, "strategy");
      __publicField(this, "rules");
      __publicField(this, "animationMode");
      __publicField(this, "autoExecuteDelay");
      __publicField(this, "aiThinkDelay");
      __publicField(this, "expressionHold");
      __publicField(this, "entranceDuration");
      __publicField(this, "flightDuration");
      __publicField(this, "impactDuration");
      __publicField(this, "_phase", "idle");
      __publicField(this, "width");
      __publicField(this, "height");
      __publicField(this, "safeTop");
      __publicField(this, "safeBottom");
      /** 缓冲倒计时剩余秒数（`auto-pending` / `ai-thinking`）。 */
      __publicField(this, "timer", 0);
      /** 缓冲期结束后要提交的动作（唯一候选或 AI 决策）。 */
      __publicField(this, "pendingAction", null);
      /** `action:execute` 记录的完整载荷，供 `action:executed` 计算飞行落点。 */
      __publicField(this, "actionInFlight", null);
      /** `action:execute` 时点的行动前快照（飞行期间显示它，落点后才投影结算结果）。 */
      __publicField(this, "stateBeforeAction", null);
      __publicField(this, "lastShowdown", null);
      __publicField(this, "unsubscribes", []);
      /** 震屏：补间把幅度衰减到 0，`update` 按幅度换算节点偏移。 */
      __publicField(this, "shakeState", { amount: 0 });
      __publicField(this, "shakeTween", null);
      __publicField(this, "elapsed", 0);
      /** 视口在对局中变化时，符文层延到下一个回合开始前重建（不打断当前动效）。 */
      __publicField(this, "runeFlightStale", false);
      this.width = options.width;
      this.height = options.height;
      this.safeTop = options.safeTop ?? DEFAULT_SAFE_TOP;
      this.safeBottom = options.safeBottom ?? DEFAULT_SAFE_BOTTOM;
      this.rules = options.rules ?? {};
      this.animationMode = options.animationMode ?? "flow";
      this.autoExecuteDelay = options.autoExecuteDelay ?? DEFAULT_AUTO_EXECUTE_DELAY;
      this.aiThinkDelay = options.aiThinkDelay ?? DEFAULT_AI_THINK_DELAY;
      this.expressionHold = options.expressionHold ?? DEFAULT_EXPRESSION_HOLD;
      this.entranceDuration = options.entranceDuration ?? 0.44;
      this.flightDuration = options.flightDuration ?? 0.55;
      this.impactDuration = options.impactDuration ?? 0.35;
      this.strategy = createStrategy(BALANCED_WEIGHTS, { rules: this.rules });
      this._turnManager = options.turnManager ?? new TurnManager({
        prng: options.prng ?? createPRNG(options.seed ?? Date.now()),
        initialState: options.initialState
      });
      this.board = new BoardView();
      this.board.resize(this.width, this.height);
      this.runeFlight = this.buildRuneFlight();
      this.characters = new CharacterView({
        width: this.width,
        height: this.height,
        safeTop: this.safeTop
      });
      this.actionBar = this.buildActionBar(this._turnManager);
      this.actionBar.visible = false;
      this.addChild(this.board);
      this.addChild(this.runeFlight);
      this.addChild(this.characters);
      this.addChild(this.actionBar);
      this.bindTurnManager(this._turnManager);
    }
    /** 核心状态机（只读；`restart()` 会换成新实例）。 */
    get turnManager() {
      return this._turnManager;
    }
    /** 当前表现阶段。 */
    get phase() {
      return this._phase;
    }
    /**
     * 视口自适应：法盘、角色卡与操作台重新排布。
     * 符文层的入场锚点是构造期常量，只能重建；空闲 / 终局时立即重建，对局中则延到下一回合开始前。
     */
    resize(width, height, safeTop, safeBottom) {
      this.width = width;
      this.height = height;
      this.safeTop = safeTop ?? this.safeTop;
      this.safeBottom = safeBottom ?? this.safeBottom;
      this.board.resize(width, height);
      this.characters.resize(width, height, this.safeTop);
      this.actionBar.x = ACTION_BAR_MARGIN;
      this.actionBar.y = this.actionBarY();
      if (this._phase === "idle" || this._phase === "game-over") {
        this.replaceRuneFlight();
        this.runeFlightStale = false;
      } else {
        this.runeFlightStale = true;
      }
    }
    /** 开局：抽第一个天干并播放降临。重复调用无副作用。 */
    start() {
      if (this._phase !== "idle") {
        return;
      }
      this.beginTurn();
    }
    /** 终局后重新开局：换一颗随机源、重置表现态，从第 1 回合重来。 */
    restart(seedOrPrng = Date.now()) {
      this.unbindTurnManager();
      const prng = typeof seedOrPrng === "number" ? createPRNG(seedOrPrng) : seedOrPrng;
      this._turnManager = new TurnManager({ prng });
      this.lastShowdown = null;
      this.actionInFlight = null;
      this.stateBeforeAction = null;
      this.actionBar.dispose();
      this.actionBar.removeFromParent();
      this.actionBar = this.buildActionBar(this._turnManager);
      this.addChild(this.actionBar);
      this.bindTurnManager(this._turnManager);
      this._phase = "idle";
      this.beginTurn();
    }
    /** 退订核心事件（销毁场景时调用）。 */
    dispose() {
      this.unbindTurnManager();
      this.actionBar.dispose();
    }
    /**
     * 主循环步进（秒）：推进动效与缓冲倒计时。
     * `Tween` 不掌握帧循环，时钟完全由这里注入。
     */
    update(dt) {
      this.elapsed += dt;
      this.runeFlight.update(dt);
      this.characters.updateTimers(dt);
      this.updateShake(dt);
      if (this._phase !== "auto-pending" && this._phase !== "ai-thinking") {
        return;
      }
      this.timer -= dt;
      if (this.timer <= 0) {
        this.commitPendingDecision();
      }
    }
    /**
     * 「点击屏幕任意处」的统一入口：
     * - 唯一候选的缓冲期内：立即加速结算（GDD §2.4「允许随时加速」）；
     * - 终局展示：重新开局。
     */
    handleTap() {
      if (this._phase === "auto-pending") {
        this.commitPendingDecision();
        return;
      }
      if (this._phase === "game-over") {
        this.restart();
      }
    }
    /** 抽天干并开始一个回合（连动回合由核心层决定仍是同一行动方）。 */
    beginTurn() {
      if (this.runeFlightStale) {
        this.replaceRuneFlight();
        this.runeFlightStale = false;
      }
      const before = this._turnManager.getState();
      const actions = this._turnManager.startTurn();
      const state = this._turnManager.getState();
      const tianGan = this._turnManager.getCurrentTianGan();
      this.pendingAction = null;
      this.timer = 0;
      this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });
      if (state.isGameOver) {
        this.presentGameOver(before);
        return;
      }
      this.projectBoard(state.currentPlayer, state);
      this.hideActionBar();
      this.announceTurnStart(state, tianGan, actions);
      if (tianGan === null) {
        this.afterEntrance();
        return;
      }
      this._phase = "entrance";
      this.runeFlight.playEntrance(tianGan, { onComplete: () => this.afterEntrance() });
    }
    /** 降临结束：进入玩家抉择 / 自动流转 / 天道推演三者之一。 */
    afterEntrance() {
      const state = this._turnManager.getState();
      const actions = this._turnManager.getAvailableActions();
      if (state.currentPlayer === "P2") {
        this._phase = "ai-thinking";
        this.timer = this.aiThinkDelay;
        return;
      }
      if (actions.length === 1) {
        this._phase = "auto-pending";
        this.timer = this.autoExecuteDelay;
        this.pendingAction = actions[0];
        return;
      }
      this._phase = "awaiting-player";
      this.actionBar.visible = true;
      this.actionBar.interactive = true;
      this.actionBar.refresh();
    }
    /** 缓冲结束（或被点击加速）：把待定动作交给核心层结算。 */
    commitPendingDecision() {
      let action = this.pendingAction;
      if (this._phase === "ai-thinking") {
        action = this.decideAiAction();
      }
      this.pendingAction = null;
      this.timer = 0;
      if (action === null) {
        this.afterEntrance();
        return;
      }
      const result = this._turnManager.executeAction(action);
      if (!result.success) {
        console.warn(`[Guiyuan] 动作提交被核心拒绝：${result.message ?? ""}`);
        this.afterEntrance();
      }
    }
    /** 天道决策：把只读快照与候选交给注入的策略函数。 */
    decideAiAction() {
      const state = this._turnManager.getState();
      const tianGan = this._turnManager.getCurrentTianGan();
      const actions = this._turnManager.getAvailableActions();
      if (tianGan === null || actions.length === 0) {
        return null;
      }
      return this.strategy(state, tianGan, actions);
    }
    /** `action:execute`：记录完整载荷与行动前快照（此时核心尚未结算）。 */
    handleActionExecute(event) {
      this.actionInFlight = event.action;
      this.stateBeforeAction = this._turnManager.getState();
    }
    /** `action:executed`：动作已结算，播放符文飞行并把棋盘变更留到落点之后再投影。 */
    handleActionExecuted(event) {
      const action = this.actionInFlight;
      const before = this.stateBeforeAction ?? this._turnManager.getState();
      this.actionInFlight = null;
      this.stateBeforeAction = null;
      const state = this._turnManager.getState();
      const actor = event.player;
      const target = resolveActionTarget(action, event.actionType, actor, this._turnManager);
      const isAttack = event.actionType === ActionType.ATK || event.actionType === ActionType.BURST_ATK;
      this.hideActionBar();
      this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });
      this.characters.setExpression(actor, isAttack ? "attack" : "cast", this.expressionHold);
      if (action !== null) {
        this.characters.announce(actor, formatActionButton(action).label, this.expressionHold * 2);
      }
      if (isAttack) {
        this.characters.setExpression(opponentOf(actor), "hurt", this.expressionHold);
        this.shake(event.actionType === ActionType.BURST_ATK ? SHAKE_BURST : SHAKE_ATTACK);
      }
      this.board.update(before.players[target.player].board);
      this._phase = "flying";
      this.runeFlight.flyTo(target.element, target.polarity, {
        onComplete: () => this.afterFlight(target.player)
      });
    }
    /** 飞行结束：投影结算后的棋盘，然后进入下一回合或终局。 */
    afterFlight(targetPlayer) {
      const state = this._turnManager.getState();
      this.projectBoard(targetPlayer, state);
      this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });
      if (state.isGameOver) {
        this.presentGameOver(null);
        return;
      }
      this.beginTurn();
    }
    /**
     * 终局展示：天命揭牌保留抽牌横幅与符文揭示动效，常规终局用胜负横幅。
     * `beforeShowdown` 是天命揭牌抽牌前的快照（只有揭牌路径传入），用于「落点才点亮」的定格。
     */
    presentGameOver(beforeShowdown) {
      const state = this._turnManager.getState();
      this._phase = "game-over";
      this.pendingAction = null;
      this.timer = 0;
      this.hideActionBar();
      this.characters.update(state, { isExtraTurn: false });
      const showdown = this.lastShowdown;
      if (showdown !== null && beforeShowdown !== null) {
        const elementName = WUXING_PALETTE[showdown.tianGan.element].name;
        const label = `${showdown.tianGan.name}${elementName}`;
        this.characters.showBanner(
          "【终轮绝杀·天命抽牌】",
          showdown.success ? `【天命逆转】五行归元·后发制人！(抽中【${label}】)` : `【天命难违】差之一线·先手锁定胜局！(抽中【${label}】)`
        );
        this.characters.setExpression(showdown.success ? "P2" : "P1", "cast", this.expressionHold);
        this.characters.setExpression(showdown.success ? "P1" : "P2", "hurt", this.expressionHold);
        if (showdown.success) {
          this.shake(SHAKE_SHOWDOWN);
        }
        this.board.update(beforeShowdown.players.P2.board);
        const { element, polarity } = showdown.tianGan;
        this.runeFlight.playEntrance(showdown.tianGan, {
          onComplete: () => {
            this.runeFlight.flyTo(element, polarity, {
              onComplete: () => {
                this.board.update(state.players.P2.board);
              }
            });
          }
        });
        return;
      }
      this.characters.showBanner(
        state.winner === "P1" ? "★ 五行归元 ★ 玩家大胜！" : "天道通玄 · 遗憾惜败！",
        describeEndReason(state.endReason)
      );
      this.board.update(state.players[state.winner === "P2" ? "P2" : "P1"].board);
    }
    /** 回合开始的播报：连动标记、天干名与「势在必行」的自动流转提示。 */
    announceTurnStart(state, tianGan, actions) {
      const isExtraTurn = this._turnManager.isExtraTurnActive();
      const isPlayer = state.currentPlayer === "P1";
      const who = isPlayer ? "玩家" : "天道";
      const main = isExtraTurn ? `【连动回合】${who}额外行动！` : `${who}回合 · 天干【${tianGan?.name ?? ""}】降临`;
      let sub;
      if (!isPlayer) {
        sub = "天道推演生克决策中...";
      } else if (actions.length === 1) {
        sub = describeAutoFlow(actions[0].actionType);
      } else {
        const elementName = tianGan === null ? "" : WUXING_PALETTE[tianGan.element].name;
        const polarity = tianGan?.polarity === Polarity.YANG ? "阳" : "阴";
        sub = `属性: ${elementName} (${polarity})`;
      }
      this.characters.showBanner(main, sub);
    }
    /** 把指定玩家的棋盘投影到法盘（只读快照，不写回）。 */
    projectBoard(player, state) {
      this.board.update(state.players[player].board);
    }
    hideActionBar() {
      this.actionBar.visible = false;
      this.actionBar.interactive = false;
    }
    actionBarY() {
      return this.height - this.safeBottom - ACTION_BAR_HEIGHT;
    }
    buildActionBar(turnManager) {
      return new ActionBarView({
        turnManager,
        width: this.width - ACTION_BAR_MARGIN * 2,
        y: this.actionBarY()
      });
    }
    buildRuneFlight() {
      return new RuneFlightView({
        board: this.board,
        centerX: this.width / 2,
        centerY: this.height / 2,
        mode: this.animationMode,
        entranceDuration: this.entranceDuration,
        flightDuration: this.flightDuration,
        impactDuration: this.impactDuration
      });
    }
    /** 重建符文层（视口变化时），保持挂载顺序：法盘 -> 符文 -> 角色卡 -> 操作台。 */
    replaceRuneFlight() {
      this.runeFlight.removeFromParent();
      this.runeFlight = this.buildRuneFlight();
      this.addChild(this.runeFlight);
      this.addChild(this.characters);
      this.addChild(this.actionBar);
    }
    bindTurnManager(turnManager) {
      const bus = turnManager.getEventBus();
      this.unsubscribes.push(
        bus.on("action:execute", (event) => this.handleActionExecute(event)),
        bus.on("action:executed", (event) => this.handleActionExecuted(event)),
        bus.on("showdown:draw", (event) => {
          this.lastShowdown = { tianGan: event.tianGan, success: event.success };
        })
      );
    }
    unbindTurnManager() {
      for (const unsubscribe of this.unsubscribes) {
        unsubscribe();
      }
      this.unsubscribes.length = 0;
    }
    /** 触发震屏（幅度补间衰减到 0）。 */
    shake(magnitude) {
      this.shakeState.amount = magnitude;
      this.shakeTween = new Tween(
        this.shakeState,
        { amount: 0 },
        {
          duration: SHAKE_DURATION,
          easing: EASINGS.outQuad
        }
      );
    }
    updateShake(dt) {
      if (this.shakeTween === null) {
        return;
      }
      this.shakeTween.update(dt);
      const amount = this.shakeState.amount;
      if (amount <= 0.01) {
        this.shakeTween = null;
        this.x = 0;
        this.y = 0;
        return;
      }
      this.x = Math.sin(this.elapsed * 62) * amount;
      this.y = Math.cos(this.elapsed * 74) * amount;
    }
    /** 底色与中央道场光晕（各视图画在其上）。 */
    renderSelf(ctx) {
      drawPixelRect(ctx, 0, 0, this.width, this.height, BACKGROUND_COLOR);
      const radius = Math.min(this.width, this.height) * 0.45;
      const gradient = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        0,
        this.width / 2,
        this.height / 2,
        radius
      );
      gradient.addColorStop(0, ARENA_GLOW_COLOR);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.width / 2, this.height / 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function opponentOf(player) {
    return player === "P1" ? "P2" : "P1";
  }
  function resolveActionTarget(action, actionType, actor, turnManager) {
    const tianGan = turnManager.getCurrentTianGan();
    const element = action === null ? tianGan?.element ?? WuXing.WOOD : getActionTargetElement(action, tianGan?.element);
    const polarity = action?.polarity ?? tianGan?.polarity ?? Polarity.YANG;
    const isAttack = actionType === ActionType.ATK || actionType === ActionType.BURST_ATK;
    return { player: isAttack ? opponentOf(actor) : actor, element, polarity };
  }
  class InputManager {
    constructor(stage) {
      __publicField(this, "stage");
      /** 本次触摸按下时命中的节点；抬起时与同一节点重合才算一次点击。 */
      __publicField(this, "pressedNode", null);
      this.stage = stage;
    }
    handleTouchStart(screenX, screenY) {
      const target = this.stage.hitTest(screenX, screenY);
      this.pressedNode = target;
      target?.onTouchStart?.(screenX, screenY);
    }
    handleTouchEnd(screenX, screenY) {
      const target = this.stage.hitTest(screenX, screenY);
      target?.onTouchEnd?.(screenX, screenY);
      const pressed = this.pressedNode;
      this.pressedNode = null;
      if (pressed !== null && pressed === target) {
        pressed.onTap?.(screenX, screenY);
      }
    }
    /** 绑定 `wx.onTouchStart` / `wx.onTouchEnd` 风格的事件源。 */
    bindTouchEvents(source) {
      source.onTouchStart((event) => {
        const point = firstTouch(event, false);
        if (point !== null) {
          this.handleTouchStart(point.x, point.y);
        }
      });
      source.onTouchEnd((event) => {
        const point = firstTouch(event, true);
        if (point !== null) {
          this.handleTouchEnd(point.x, point.y);
        }
      });
    }
  }
  function firstTouch(event, preferChanged) {
    const primary = preferChanged ? event.changedTouches : event.touches;
    const fallback = preferChanged ? event.touches : event.changedTouches;
    const touch = primary?.[0] ?? fallback?.[0];
    return touch === void 0 ? null : { x: touch.clientX, y: touch.clientY };
  }
  const MAX_FRAME_DELTA = 1 / 20;
  function initMiniGame() {
    if (typeof wx === "undefined") {
      console.log("[Guiyuan] 非微信小游戏环境，跳过 Canvas 初始化");
      return;
    }
    const sysInfo = wx.getSystemInfoSync();
    const { windowWidth, windowHeight, pixelRatio } = sysInfo;
    const safeTop = sysInfo.safeArea ? sysInfo.safeArea.top : sysInfo.statusBarHeight || 20;
    const safeBottom = sysInfo.safeArea ? Math.max(0, windowHeight - sysInfo.safeArea.bottom) : 10;
    const canvas = wx.createCanvas();
    canvas.width = windowWidth * pixelRatio;
    canvas.height = windowHeight * pixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.scale(pixelRatio, pixelRatio);
    const stage = new Container();
    stage.hitArea = { x: 0, y: 0, width: windowWidth, height: windowHeight };
    const scene = new GameScene({
      width: windowWidth,
      height: windowHeight,
      safeTop,
      safeBottom
    });
    stage.onTap = () => scene.handleTap();
    stage.addChild(scene);
    const input = new InputManager(stage);
    input.bindTouchEvents(wx);
    scene.start();
    let lastTimestamp = null;
    function loop(timestamp) {
      const now = typeof timestamp === "number" ? timestamp : Date.now();
      const dt = lastTimestamp === null ? 0 : Math.min(MAX_FRAME_DELTA, Math.max(0, (now - lastTimestamp) / 1e3));
      lastTimestamp = now;
      scene.update(dt);
      scene.render(ctx);
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(loop);
      }
    }
    loop();
    console.log("[Guiyuan] 场景树对局初始化成功！");
  }
  initMiniGame();
  exports.initMiniGame = initMiniGame;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
