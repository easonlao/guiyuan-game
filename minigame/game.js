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
      actions.push({
        actionType: ActionType.BURST,
        player: playerId,
        sourceElement: stemElement,
        consumePolarity: Polarity.YIN
      });
      actions.push({
        actionType: ActionType.BURST_ATK,
        player: playerId,
        sourceElement: stemElement,
        consumePolarity: Polarity.YANG
      });
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
  const GUI_YI_MILESTONE = 60;
  const DAMAGE_PENALTY = 50;
  const POINTS_CONFIG = {
    // 【行为分】执行动作的基础分
    ACTION: {
      AUTO: 0,
      CONVERT: 50,
      // burst-plus-two 后【强化】单次作用两级并给连动，【化】成了唯一安全的单级相生建设路径。
      // 平衡重调把【化】的行为分从 30 抬到 160，缓和 AI 对爆发的过度偏好，
      // 并让【平衡】对【激进压制】重新持平（理由与证据见 docs/headless/burst-plus-two-balance.md）。
      TRANS: 160,
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
  const BURST_PASSES = 2;
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
          for (let pass = 0; pass < BURST_PASSES; pass++) {
            const targetNode = nextActiveBoard[targetElement];
            const boostPolarity = getPlusTargetPolarity(targetNode);
            const targetPolarity = boostPolarity ?? Polarity.YIN;
            const levelStep = boostPolarity === null ? -1 : 1;
            const prevLevel = targetNode[targetPolarity];
            const newLevel = clampNodeLevel(prevLevel + levelStep);
            patchActiveNode(targetElement, {
              [targetPolarity]: newLevel
            });
            scoreDelta += this.scoreCalculator.calculateTransitionPoints(
              prevLevel,
              newLevel,
              targetPolarity,
              false
            );
          }
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
          for (let pass = 0; pass < BURST_PASSES; pass++) {
            const targetNode = nextOpponentBoard[targetElement];
            const targetPolarity = getMinusTargetPolarity(targetNode);
            if (targetPolarity === null) {
              break;
            }
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
          }
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
  const THEME = {
    ink: "#081b22",
    deep: "#0c252d",
    panel: "#102e35",
    panelRaised: "#183a40",
    edge: "#36565a",
    ivory: "#f4ead2",
    muted: "#a3b8b3",
    gold: "#d8b876",
    goldDim: "#8d7852",
    jade: "#80d6ba",
    rival: "#86b8cb",
    damage: "#ee8d77",
    font: '"PingFang SC", "Microsoft YaHei", sans-serif'
  };
  function drawPanel(ctx, x, y, width, height, accent = THEME.edge, fill = THEME.panel) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.strokeStyle = "rgba(244,234,210,0.10)";
    ctx.strokeRect(x + 4.5, y + 4.5, width - 9, height - 9);
    ctx.fillStyle = accent;
    for (const cornerX of [x, x + width - 7]) {
      for (const cornerY of [y, y + height - 2]) {
        ctx.fillRect(cornerX, cornerY, 7, 2);
      }
    }
  }
  function drawLandscape(ctx, width, height) {
    ctx.fillStyle = THEME.ink;
    ctx.fillRect(0, 0, width, height);
    const span = Math.min(width, height);
    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      8,
      width * 0.5,
      height * 0.48,
      span * 0.75
    );
    glow.addColorStop(0, "#1d4448");
    glow.addColorStop(0.65, "#102e35");
    glow.addColorStop(1, THEME.ink);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    for (let layer = 0; layer < 3; layer += 1) {
      const base = height * (0.72 + layer * 0.075);
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let step = 0; step <= 20; step += 1) {
        const x = width * step / 20;
        const crest = Math.sin(step * 1.42 + layer * 2) * 0.5 + Math.sin(step * 0.73 + layer) * 0.5;
        ctx.lineTo(x, base - (crest + 1) * span * (0.09 - layer * 0.018));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = ["#18383d", "#102e34", "#0a232b"][layer];
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(163,184,179,0.09)";
    ctx.lineWidth = 1;
    for (let ribbon = 0; ribbon < 6; ribbon += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 24; step += 1) {
        const x = width * step / 24;
        const y = height * (0.24 + ribbon * 0.12) + Math.sin(step * 0.4 + ribbon) * 8;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(244,234,210,0.035)";
    for (let index = 0; index < 96; index += 1) {
      ctx.fillRect((index * 97 + 17) % width, (index * 173 + 31) % height, 1, 1);
    }
  }
  const WUXING_PALETTE = {
    [WuXing.WOOD]: { name: "木", main: "#63ba8c", light: "#b4e7be", dark: "#294f42" },
    [WuXing.FIRE]: { name: "火", main: "#e38c70", light: "#ffd0aa", dark: "#653e37" },
    [WuXing.EARTH]: { name: "土", main: "#c3a16a", light: "#ecdbab", dark: "#60543a" },
    [WuXing.METAL]: { name: "金", main: "#cbd5cd", light: "#f5f1de", dark: "#5e7378" },
    [WuXing.WATER]: { name: "水", main: "#75b4cb", light: "#bce4eb", dark: "#315363" }
  };
  function drawPixelRect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }
  const CHARACTER_PIXEL_SIZE = 4;
  const CHARACTER_SPRITE_BOUNDS = {
    top: -15,
    bottom: 12
  };
  function drawPixelCharacter(ctx, x, y, isPlayer, state, animTick) {
    const p = CHARACTER_PIXEL_SIZE;
    const dir = isPlayer ? 1 : -1;
    const bob = {
      idle: Math.sin(animTick * 0.08) * 2,
      attack: -2,
      cast: Math.sin(animTick * 0.06) * 1.5,
      hurt: 2,
      celebrate: -Math.abs(Math.sin(animTick * 0.12)) * 3,
      win: Math.sin(animTick * 0.08) * 1.5,
      lose: 2
    };
    const ink = "#203c40";
    const robe = isPlayer ? "#4b9b86" : "#648da0";
    const shade = isPlayer ? "#2c665c" : "#3e6178";
    const light = isPlayer ? "#b5dfc4" : "#c5e1df";
    const hair = isPlayer ? "#263c43" : "#e2ede8";
    const hairShade = isPlayer ? "#45606a" : "#9eb9bc";
    const skin = "#f5d9ba";
    const gold = "#d8b876";
    const shape = (points, color, outline = true) => {
      ctx.beginPath();
      const first = points[0];
      ctx.moveTo(first[0] * p * dir, first[1] * p);
      for (const point of points.slice(1)) {
        if (point.length === 2) ctx.lineTo(point[0] * p * dir, point[1] * p);
        else ctx.quadraticCurveTo(point[0] * p * dir, point[1] * p, point[2] * p * dir, point[3] * p);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      if (outline) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    };
    const oval = (cx, cy, rx, ry, color, outline = false) => {
      shape(
        [
          [cx - rx, cy],
          [cx - rx, cy - ry, cx, cy - ry],
          [cx + rx, cy - ry, cx + rx, cy],
          [cx + rx, cy + ry, cx, cy + ry],
          [cx - rx, cy + ry, cx - rx, cy]
        ],
        color,
        outline
      );
    };
    const line = (points, color, width = 1.2) => {
      ctx.beginPath();
      ctx.moveTo(points[0][0] * p * dir, points[0][1] * p);
      for (const point of points.slice(1)) ctx.lineTo(point[0] * p * dir, point[1] * p);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    ctx.save();
    ctx.translate(x, y + bob[state]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (!isPlayer) {
      shape(
        [
          [-4.8, -10],
          [-7, -8, -6.1, 4.5],
          [-4.2, 3.8],
          [-3.4, -7],
          [3.4, -7],
          [4.3, 4.7],
          [6.8, 4.1, 5.7, -9]
        ],
        hair
      );
      line(
        [
          [-5.2, -5],
          [-5.3, 2.7]
        ],
        hairShade
      );
      line(
        [
          [4.8, -5],
          [5.1, 3]
        ],
        hairShade
      );
    } else {
      shape(
        [
          [-2.8, -8],
          [-5, -5, -4.3, 2],
          [-3.2, 0.7],
          [-2.3, -5]
        ],
        shade
      );
    }
    const spread = state === "celebrate" ? 0.8 : 0;
    oval(-2.9 - spread, 10.2, 1.8, 1.1, ink, true);
    oval(2.9 + spread, 10.2, 1.8, 1.1, ink, true);
    line(
      [
        [-4 - spread, 10.4],
        [-2.1 - spread, 10.4]
      ],
      gold
    );
    line(
      [
        [2.1 + spread, 10.4],
        [4 + spread, 10.4]
      ],
      gold
    );
    shape(
      [
        [-3.6, 1],
        [-5.2, 5, -6.1, 9],
        [-2.2, 10, 0, 9.6],
        [3.8, 10, 6.1, 9],
        [5.1, 5, 3.6, 1]
      ],
      shade
    );
    shape(
      [
        [-3.4, 1.2],
        [-4.3, 5.5, -4.7, 8.9],
        [0, 9.7, 4.9, 8.9],
        [3.6, 5.3, 2.8, 1.2]
      ],
      robe
    );
    shape(
      [
        [0, 2],
        [0.2, 6, -0.8, 9.2],
        [1.1, 9.4, 2.3, 9.1],
        [1.8, 5, 1.2, 2]
      ],
      light,
      false
    );
    line(
      [
        [-4.8, 8.7],
        [-1.1, 9.1]
      ],
      gold
    );
    line(
      [
        [2.5, 9],
        [4.9, 8.6]
      ],
      gold
    );
    line(
      [
        [-2.6, 4],
        [-3.3, 7.6]
      ],
      shade
    );
    shape(
      [
        [-2.3, -4.8],
        [-4.5, -4.7, -4.8, -2.2],
        [-3.9, 2.5],
        [3.9, 2.5],
        [4.8, -2.2],
        [4.2, -4.8, 2.1, -4.8]
      ],
      robe
    );
    oval(0, -5.1, 1.2, 1.3, skin, true);
    shape(
      [
        [-2.6, -4.8],
        [-1.5, -3.5, 1.3, -1.4],
        [2.7, -4.8],
        [1.2, -4.2],
        [0, -2.7],
        [-1.4, -4.6]
      ],
      light,
      false
    );
    line(
      [
        [-2.4, -4.5],
        [1.1, -1.4],
        [0.4, 1.5]
      ],
      shade
    );
    if (!isPlayer) {
      shape(
        [
          [-4.4, -4.1],
          [-3.7, -5.3, -2.5, -4.5],
          [-1.4, -3.4],
          [-3.3, -2.5],
          [-4.4, -3]
        ],
        light
      );
      shape(
        [
          [4.4, -4.1],
          [3.7, -5.3, 2.5, -4.5],
          [1.4, -3.4],
          [3.3, -2.5],
          [4.4, -3]
        ],
        light
      );
    }
    shape(
      [
        [-4, 1.4],
        [4, 1.4],
        [3.9, 2.5],
        [-3.9, 2.5]
      ],
      shade
    );
    oval(0, 1.9, 0.8, 0.7, gold, true);
    line(
      [
        [1.8, 2.5],
        [2.1, 4.4]
      ],
      gold
    );
    oval(2.1, 4.8, 0.65, 0.9, light, true);
    const arm = (side, wristX, wristY) => {
      const shoulderX = side * 3.7;
      const dx = wristX - shoulderX;
      const dy = wristY + 3.2;
      const length = Math.hypot(dx, dy);
      const nx = -dy / length;
      const ny = dx / length;
      shape(
        [
          [shoulderX + nx * 1.2, -3.2 + ny * 1.2],
          [
            shoulderX + dx * 0.55 + nx * 2.1,
            -3.2 + dy * 0.55 + ny * 2.1,
            wristX + nx * 1.25,
            wristY + ny * 1.25
          ],
          [wristX - nx * 1.25, wristY - ny * 1.25],
          [
            shoulderX + dx * 0.45 - nx * 1.9,
            -3.2 + dy * 0.45 - ny * 1.9,
            shoulderX - nx * 1.2,
            -3.2 - ny * 1.2
          ]
        ],
        side > 0 ? robe : shade
      );
      line(
        [
          [wristX + nx * 1.2, wristY + ny * 1.2],
          [wristX - nx * 1.2, wristY - ny * 1.2]
        ],
        gold,
        1.8
      );
      oval(wristX + dx / length * 0.65, wristY + dy / length * 0.65, 0.85, 1, skin, true);
    };
    const drop = state === "lose" ? 1.2 : state === "hurt" ? 0.4 : 0;
    ctx.save();
    ctx.translate(0, drop * p);
    oval(-4.3, -7.8, 0.8, 1.2, skin, true);
    oval(4.3, -7.8, 0.8, 1.2, skin, true);
    shape(
      [
        [-4.4, -10.5],
        [-3.6, -12.5, 0, -12.5],
        [4, -12.4, 4.5, -10.1],
        [4.8, -6.4, 2.5, -5.2],
        [0, -4.3, -2.4, -5.2],
        [-4.8, -6.4, -4.4, -10.5]
      ],
      skin
    );
    oval(-2.8, -6.8, 0.8, 0.35, "#e9b8a0");
    oval(2.9, -6.8, 0.8, 0.35, "#e9b8a0");
    if (isPlayer) {
      oval(-1.1, -13.2, 1.9, 0.8, hair, true);
      shape(
        [
          [-4.5, -8.3],
          [-5.2, -12.5, -1.4, -12.6],
          [2.8, -13.3, 4.5, -10.5],
          [4.9, -9.1, 4.3, -8.2],
          [3.4, -8.8, 2.7, -10.4],
          [1.4, -9.1, 0.1, -9.7],
          [-1.2, -10.4],
          [-2.6, -8.9, -3.5, -9.5],
          [-4.5, -8.3]
        ],
        hair
      );
      line(
        [
          [-2.7, -11.4],
          [-0.7, -11.9],
          [1.1, -11.5]
        ],
        hairShade
      );
      line(
        [
          [-2.8, -13.1],
          [1.3, -13.1]
        ],
        gold,
        2
      );
      oval(1.5, -13.1, 0.45, 0.45, light);
    } else {
      shape(
        [
          [-4.5, -7.5],
          [-5.7, -12, -1.1, -12.8],
          [2.9, -13, 4.5, -10.8],
          [5.4, -8.8, 4.6, -7.3],
          [3.8, -8.5, 3.1, -10.5],
          [1.9, -9.3, 0.4, -9.8],
          [-0.7, -10.6],
          [-2.8, -8.8, -3.8, -9.2],
          [-4.5, -7.5]
        ],
        hair
      );
      line(
        [
          [-3.6, -11.2],
          [-1.5, -11.8]
        ],
        hairShade
      );
      line(
        [
          [0.8, -11.9],
          [2.8, -11]
        ],
        hairShade
      );
      shape(
        [
          [-0.6, -11.7],
          [0, -12.5],
          [0.6, -11.7],
          [0, -11]
        ],
        gold,
        false
      );
    }
    const happy = state === "celebrate" || state === "win";
    const closed = state === "hurt" || state === "lose" || state === "cast";
    for (const ex of [-1.9, 2]) {
      const ey = -7.9;
      if (happy)
        line(
          [
            [ex - 0.65, ey + 0.2],
            [ex, ey - 0.35],
            [ex + 0.65, ey + 0.2]
          ],
          ink,
          1.6
        );
      else if (closed)
        line(
          [
            [ex - 0.65, ey],
            [ex, ey + 0.2],
            [ex + 0.65, ey]
          ],
          ink,
          1.5
        );
      else {
        oval(ex, ey, 0.62, 0.85, ink);
        oval(ex + 0.16, ey - 0.28, 0.19, 0.25, "#fff8e9");
      }
      line(
        [
          [ex - 0.65, -9],
          [ex + 0.6, state === "attack" ? -8.7 : -9.1]
        ],
        hairShade
      );
    }
    line(
      [
        [0.2, -7.1],
        [0.55, -6.9]
      ],
      "#ce9d82",
      1
    );
    if (happy)
      shape(
        [
          [-0.7, -6.2],
          [0, -5.3, 0.9, -6.2]
        ],
        "#ac6c59",
        false
      );
    else
      line(
        [
          [-0.5, -6.1],
          [0.7, state === "lose" ? -6.3 : -6.1]
        ],
        "#ac6c59",
        1.2
      );
    ctx.restore();
    switch (state) {
      case "idle":
        arm(-1, -5.8, 2.4);
        arm(1, 5.8, 2.4);
        break;
      case "attack":
        arm(-1, -6.2, 0.2);
        arm(1, 8.8, -2.8);
        break;
      case "cast":
        arm(-1, -1.1, -2.6);
        arm(1, 1.1, -2.6);
        oval(0, -3.5, 0.55, 0.55, gold);
        break;
      case "hurt":
        arm(-1, -4.5, -9.4);
        arm(1, 4.5, -9.4);
        break;
      case "celebrate":
        arm(-1, -6.4, -11.8);
        arm(1, 6.4, -11.8);
        line(
          [
            [-8, -9.3],
            [-8, -8]
          ],
          gold,
          1.8
        );
        line(
          [
            [8, -10.3],
            [8, -9]
          ],
          gold,
          1.8
        );
        break;
      case "win":
        arm(-1, -5.1, -0.5);
        arm(1, 6.4, -11.8);
        break;
      case "lose":
        arm(-1, -6, 3.7);
        arm(1, 6, 3.7);
        break;
      default: {
        const unhandled = state;
        throw new Error(`未处理的角色姿势：${String(unhandled)}`);
      }
    }
    ctx.restore();
  }
  function drawCenterTianGanRune(ctx, centerX, centerY, tg, animTick, radius = 25) {
    const elemCfg = WUXING_PALETTE[tg.element] ?? WUXING_PALETTE[WuXing.WOOD];
    const polarityName = tg.polarity === Polarity.YANG ? "阳" : "阴";
    ctx.save();
    ctx.fillStyle = THEME.deep;
    ctx.strokeStyle = elemCfg.main;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = THEME.ivory;
    ctx.font = `bold ${Math.min(22, radius)}px ${THEME.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tg.name, centerX, centerY - 5);
    ctx.fillStyle = elemCfg.light;
    ctx.font = `11px ${THEME.font}`;
    if (radius >= 22) ctx.fillText(`${elemCfg.name} · ${polarityName}`, centerX, centerY + 14);
    ctx.restore();
  }
  function isAttackAction(actionType) {
    switch (actionType) {
      case ActionType.ATK:
      case ActionType.BURST_ATK:
        return true;
      case ActionType.AUTO:
      case ActionType.CONVERT:
      case ActionType.TRANS:
      case ActionType.BURST:
      case ActionType.DISSIPATE:
      case ActionType.PASS:
        return false;
      default: {
        const unhandled = actionType;
        throw new Error(`未处理的动作类型：${String(unhandled)}`);
      }
    }
  }
  function getActionTargetElement(act, fallbackElement) {
    const srcElem = act.sourceElement ?? act.element ?? fallbackElement ?? WuXing.WOOD;
    if (act.actionType === ActionType.TRANS || act.actionType === ActionType.BURST) {
      return act.targetElement ?? GENERATION_CYCLE[srcElem];
    }
    if (isAttackAction(act.actionType)) {
      return act.targetElement ?? OVERCOMING_CYCLE[srcElem];
    }
    return act.targetElement ?? act.element ?? srcElem;
  }
  function formatActionButton(act) {
    let label = "";
    let subLabel = "";
    let color = "#63b3ed";
    let isBurst = false;
    const srcElem = act.sourceElement ?? act.element ?? WuXing.WOOD;
    const srcName = WUXING_PALETTE[srcElem]?.name ?? "";
    switch (act.actionType) {
      case ActionType.AUTO: {
        label = "【吸纳】";
        subLabel = "天干能量吸纳（充盈虚空/修复道损）";
        color = "#68d391";
        break;
      }
      case ActionType.CONVERT: {
        label = "【调息】";
        subLabel = `转同属${act.polarity === Polarity.YANG ? "阳" : "阴"}`;
        color = "#63b3ed";
        break;
      }
      case ActionType.TRANS: {
        label = "【化】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = `生${targetName}(${act.polarity === Polarity.YANG ? "阳" : "阴"})+1`;
        color = "#4fd1c5";
        break;
      }
      case ActionType.ATK: {
        label = "【破】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = `克敌${targetName}(${act.polarity === Polarity.YANG ? "阳" : "阴"})-1`;
        color = "#fc8181";
        break;
      }
      case ActionType.BURST: {
        label = "【强化】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = `消耗${srcName}·生${targetName}+2`;
        color = "#f6e05e";
        isBurst = true;
        break;
      }
      case ActionType.BURST_ATK: {
        label = "【强破】";
        const targetElem = getActionTargetElement(act);
        const targetName = WUXING_PALETTE[targetElem]?.name ?? "";
        subLabel = `消耗${srcName}·克${targetName}-2`;
        color = "#f56565";
        isBurst = true;
        break;
      }
      case ActionType.DISSIPATE: {
        label = "【散气】";
        subLabel = `天道满溢则亏·${act.polarity === Polarity.YANG ? "阳" : "阴"}回落至加持(-1)`;
        color = "#e2e8f0";
        break;
      }
      case ActionType.PASS: {
        label = "【消散】";
        subLabel = "无有效动作·消散过牌交接回合";
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
  const FULL_WIDTH_RATIO = 1.2;
  const HALF_WIDTH_RATIO = 0.6;
  function isFullWidth(char) {
    return (char.codePointAt(0) ?? 0) >= 11904;
  }
  function estimateTextWidth(text, fontSize) {
    let fullWidthCount = 0;
    let totalCount = 0;
    for (const char of text) {
      totalCount += 1;
      if (isFullWidth(char)) {
        fullWidthCount += 1;
      }
    }
    const halfWidthCount = totalCount - fullWidthCount;
    return (fullWidthCount * FULL_WIDTH_RATIO + halfWidthCount * HALF_WIDTH_RATIO) * fontSize;
  }
  const PADDING_X = 12;
  const PADDING_Y = 8;
  const LABEL_FONT_SIZE = 14;
  const SUB_LABEL_FONT_SIZE = 10;
  const LABEL_LINE_HEIGHT = 20;
  const SUB_LABEL_LINE_HEIGHT = 14;
  const MIN_WIDTH = 72;
  const DEFAULT_PRESS_SCALE = 0.92;
  const DEFAULT_COLOR = THEME.jade;
  const SUB_LABEL_COLOR = THEME.muted;
  const DISABLED_COLOR = THEME.edge;
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
      drawPanel(
        ctx,
        left,
        top,
        this._width,
        this._height,
        accent,
        this._disabled ? THEME.deep : this.scaleX < 1 ? THEME.panelRaised : THEME.panel
      );
      ctx.fillStyle = accent;
      ctx.fillRect(left + 8, top + 9, 3, this._height - 18);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = this._disabled ? DISABLED_COLOR : THEME.ivory;
      ctx.font = `bold ${LABEL_FONT_SIZE}px ${THEME.font}`;
      ctx.fillText(this.label, 0, top + PADDING_Y + LABEL_LINE_HEIGHT / 2);
      if (this.subLabel !== "") {
        ctx.fillStyle = this._disabled ? DISABLED_COLOR : SUB_LABEL_COLOR;
        ctx.font = `${SUB_LABEL_FONT_SIZE}px ${THEME.font}`;
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
    const contentWidth = Math.ceil(
      Math.max(
        estimateTextWidth(label, LABEL_FONT_SIZE),
        estimateTextWidth(subLabel, SUB_LABEL_FONT_SIZE)
      )
    );
    return Math.max(MIN_WIDTH, PADDING_X * 2 + contentWidth);
  }
  function autoHeight(subLabel) {
    const lines = subLabel === "" ? LABEL_LINE_HEIGHT : LABEL_LINE_HEIGHT + SUB_LABEL_LINE_HEIGHT;
    return PADDING_Y * 2 + lines;
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
      /** 最近一次排版的实测内容高度（按钮总高 + 行间距）；无按钮时为 0。 */
      __publicField(this, "_contentHeight", 0);
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
    /** 最近一次排版的实测内容高度：调用方据此把面板底对齐到安全区，不预留空高。 */
    get contentHeight() {
      return this._contentHeight;
    }
    /** Reflow existing buttons and their hit regions when the viewport changes. */
    resize(width) {
      this.availableWidth = width;
      this.layout();
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
        this._contentHeight = 0;
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
      this._contentHeight = cursor - this.gapY;
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
  const OWN_PLAYER = "P1";
  const OPPONENT_PLAYER = "P2";
  const BOARD_PLAYERS = [OWN_PLAYER, OPPONENT_PLAYER];
  const OUTER_RING_OFFSET = 2;
  const INNER_RADIUS_RATIO = 0.24;
  const OUTER_RADIUS_RATIO = 0.4;
  const SEAL_SIZE_RATIO = 0.062;
  const OPPONENT_SEAL_SCALE = 0.82;
  const VOID_OUTLINE_ALPHA = 0.55;
  const GUIYI_RING_WIDTH_RATIO = 0.07;
  const GUIYI_RING_WIDTH_MIN = 1;
  const GUIYI_RING_OUTSET_RATIO = 0.26;
  const GUIYI_RING_COLOR = THEME.gold;
  const SLOT_SIDE_RATIO = 0.7;
  const DEFAULT_BOARD_LAYOUT = {
    centerX: 0,
    centerY: 0,
    innerRadius: 90,
    outerRadius: 150,
    sealSize: 23.25,
    startAngle: -Math.PI / 2
  };
  const VOID_LEVEL = 0;
  const VOID_NODE = { yin: VOID_LEVEL, yang: VOID_LEVEL };
  const BOARD_BG_COLOR = THEME.deep;
  const OWN_BAND_EDGE = THEME.goldDim;
  const OWN_RING_COLOR = THEME.gold;
  const OPPONENT_BAND_EDGE = THEME.edge;
  const OPPONENT_RING_COLOR = THEME.rival;
  const RING_LABEL_ANGLE = Math.PI / 2;
  const RING_LABEL_PADDING_X = 8;
  const RING_LABEL_PADDING_Y = 4;
  class BoardView extends Container {
    constructor(layout = {}) {
      super();
      __publicField(this, "_layout");
      __publicField(this, "_elements", []);
      __publicField(this, "_slots", []);
      __publicField(this, "_connections", []);
      __publicField(this, "_boards", { P1: null, P2: null });
      /** 当前动作会走的连线（键为 `kind:from`）；高亮与盘面等级无关（票 02）。 */
      __publicField(this, "_activePaths", /* @__PURE__ */ new Set());
      this._layout = { ...DEFAULT_BOARD_LAYOUT, ...layout };
      this._rebuild();
    }
    /** 当前生效的极坐标布局参数（快照副本）。 */
    get layout() {
      return { ...this._layout };
    }
    /** 按视口自适应：圆心取视口中心，内外环半径与主印半径按短边等比缩放。 */
    resize(width, height, bounds) {
      let span = Math.min(width, height);
      let centerY = height / 2;
      let sealSize = span * SEAL_SIZE_RATIO;
      let innerRadius = span * INNER_RADIUS_RATIO;
      let outerRadius = span * OUTER_RADIUS_RATIO;
      if (bounds !== void 0) {
        const available = Math.max(100, bounds.bottom - bounds.top);
        const minInner = available < 244 ? Math.min(40, Math.max(30, (available - 80) / 3.3)) : 40;
        const minSeal = available < 244 ? Math.max(4, (available - minInner * 2 - 46) / 6.54) : 18;
        const dimensions = (size) => {
          const seal = Math.max(minSeal, size * SEAL_SIZE_RATIO);
          const inner = Math.max(minInner, size * INNER_RADIUS_RATIO);
          const outer = Math.max(
            size * OUTER_RADIUS_RATIO,
            inner + seal * (1 + OPPONENT_SEAL_SCALE) + 3
          );
          return { seal, inner, outer, height: outer * 2 + seal * 2.9 + 40 };
        };
        let low = 0;
        let high = span;
        for (let i = 0; i < 20; i++) {
          const mid = (low + high) / 2;
          if (dimensions(mid).height <= available) low = mid;
          else high = mid;
        }
        span = low;
        const fitted = dimensions(span);
        sealSize = fitted.seal;
        innerRadius = fitted.inner;
        outerRadius = fitted.outer;
        centerY = bounds.top + outerRadius + sealSize + 14;
      }
      this._layout = {
        ...this._layout,
        centerX: width / 2,
        centerY,
        innerRadius,
        outerRadius,
        sealSize
      };
      this._rebuild();
    }
    /** 十个五行主印：内环（己方）五个在前、外环（对方）五个在后，各按相生环顺序。 */
    get elements() {
      return this._elements;
    }
    /** 二十个阴阳槽位：十个主印各带阴/阳两个，按主印顺序排列（内环在前）。 */
    get slots() {
      return this._slots;
    }
    /** 十条连线：五条内环相生边 + 五条跨环径向线。 */
    get connections() {
      return this._connections;
    }
    /** 按玩家、主印与极性取一个槽位的投影视图；未知玩家 / 元素 / 极性抛错。 */
    getSlot(player, element, polarity) {
      const slot = this._slots.find(
        (entry) => entry.player === player && entry.element === element && entry.polarity === polarity
      );
      if (slot === void 0) {
        throw new Error(`法盘上不存在 ${player} 的五行 ${element} 的 ${polarity} 槽位。`);
      }
      return slot;
    }
    /**
     * 点亮「当前动作会走」的连线路径（其余连线静默）；传空数组清空高亮。
     * 高亮只由这个入口驱动，不再从盘面等级推导（票 02）。
     */
    setActivePaths(paths) {
      this._activePaths = new Set(paths.map((path) => connectionKey(path.kind, path.from)));
      this._rebuild();
    }
    /** 一次投影双方只读棋盘快照；只读不写回（LLD §4.1）。 */
    update(p1Board, p2Board) {
      this._boards[OWN_PLAYER] = p1Board;
      this._boards[OPPONENT_PLAYER] = p2Board;
      this._rebuild();
    }
    _rebuild() {
      this._elements.length = 0;
      this._slots.length = 0;
      this._connections.length = 0;
      const ring = buildGenerationRing();
      for (const player of BOARD_PLAYERS) {
        const radius = player === OWN_PLAYER ? this._layout.innerRadius : this._layout.outerRadius;
        const sealSize = player === OWN_PLAYER ? this._layout.sealSize : this._layout.sealSize * OPPONENT_SEAL_SCALE;
        ring.forEach((element, index) => {
          const rayIndex = player === OWN_PLAYER ? index : (index - OUTER_RING_OFFSET + WUXING_COUNT) % WUXING_COUNT;
          const angle = this._layout.startAngle + rayIndex * RING_STEP;
          const node = this._boards[player]?.[element] ?? VOID_NODE;
          const x = this._layout.centerX + radius * Math.cos(angle);
          const y = this._layout.centerY + radius * Math.sin(angle);
          const view = {
            player,
            element,
            angle,
            x,
            y,
            sealSize,
            yin: node.yin,
            yang: node.yang,
            // 归一 / 亢极的真源在核心层（`src/core/logic/State.ts`），这里不再各推一份。
            isGuiYi: isNodeGuiYi(node),
            isKangJi: isNodeKangJi(node)
          };
          this._elements.push(view);
          this._slots.push(
            this._projectSlot(view, Polarity.YIN),
            this._projectSlot(view, Polarity.YANG)
          );
        });
      }
      for (const element of ring) {
        this._connections.push(
          this._projectConnection(
            "generation",
            OWN_PLAYER,
            element,
            OWN_PLAYER,
            GENERATION_CYCLE[element]
          ),
          this._projectConnection(
            "attack",
            OWN_PLAYER,
            element,
            OPPONENT_PLAYER,
            OVERCOMING_CYCLE[element]
          )
        );
      }
    }
    _projectConnection(kind, fromPlayer, from, toPlayer, to) {
      const source = this._elementView(fromPlayer, from);
      const target = this._elementView(toPlayer, to);
      return {
        kind,
        from,
        to,
        x1: source.x,
        y1: source.y,
        x2: target.x,
        y2: target.y,
        isActive: this._activePaths.has(connectionKey(kind, from))
      };
    }
    _elementView(player, element) {
      const view = this._elements.find(
        (entry) => entry.player === player && entry.element === element
      );
      if (view === void 0) {
        throw new Error(`法盘上不存在 ${player} 的五行 ${element}。`);
      }
      return view;
    }
    /** 槽位投影：只收主印视图与极性，落点由主印中心向阴 / 阳一侧偏移推出。 */
    _projectSlot(element, polarity) {
      const isYin = polarity === Polarity.YIN;
      const sideOffset = element.sealSize * SLOT_SIDE_RATIO;
      return {
        player: element.player,
        element: element.element,
        polarity,
        level: isYin ? element.yin : element.yang,
        angle: element.angle,
        x: element.x + (isYin ? -sideOffset : sideOffset),
        y: element.y,
        isGuiYi: element.isGuiYi,
        isKangJi: element.isKangJi
      };
    }
    /** 先画环带、归一金环与主印，最后叠加环归属标签（标签压在最上层）。 */
    renderSelf(ctx) {
      this._drawEngraving(ctx);
      this._drawRingBands(ctx);
      this._drawGuiYiRings(ctx);
      this._drawSeals(ctx);
      this._drawRingLabels(ctx);
    }
    /** Quiet backing and one ownership guide per ring; decoration does not encode state. */
    _drawEngraving(ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(8,27,34,0.72)";
      ctx.beginPath();
      ctx.arc(
        this._layout.centerX,
        this._layout.centerY,
        this._layout.outerRadius + this._layout.sealSize * 1.1,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }
    _drawRingBands(ctx) {
      for (const [radius, color, dash] of [
        [this._layout.innerRadius, OWN_BAND_EDGE, []],
        [this._layout.outerRadius, OPPONENT_BAND_EDGE, [5, 5]]
      ]) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this._layout.centerX, this._layout.centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([...dash]);
        ctx.stroke();
        ctx.restore();
      }
    }
    /**
     * 归一 = 主印外一圈金环，亢极 = 再加一层（ADR 0018）：中性金、不脉动、内外两盘一视同仁。
     * 环半径按各自主印半径等比缩放（外环主印更小，金环同步更小）。
     */
    _drawGuiYiRings(ctx) {
      for (const entry of this._elements) {
        const { radii, width } = guiYiRingGeometry(entry.sealSize, guiYiRingLayers(entry));
        if (radii.length === 0) continue;
        ctx.save();
        ctx.strokeStyle = GUIYI_RING_COLOR;
        ctx.lineWidth = width;
        for (const radius of radii) {
          ctx.beginPath();
          ctx.arc(entry.x, entry.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    /** Each node owns two independent fish. Element labels sit outside the readable silhouette. */
    _drawSeals(ctx) {
      for (const entry of this._elements) {
        const radius = entry.sealSize;
        ctx.save();
        drawYinYangFish(ctx, entry.x, entry.y, radius, Polarity.YIN, entry.yin, entry.element);
        drawYinYangFish(ctx, entry.x, entry.y, radius, Polarity.YANG, entry.yang, entry.element);
        ctx.fillStyle = THEME.ivory;
        ctx.font = `bold ${Math.round(Math.max(11, radius * 0.5))}px ${THEME.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(WUXING_PALETTE[entry.element].name, entry.x, entry.y - radius - 10);
        ctx.restore();
      }
    }
    /** 环归属标签：把「己」「敌」钉在各自的环带上（主印之间的正下方空位）。 */
    _drawRingLabels(ctx) {
      this._drawRingLabel(ctx, this._layout.innerRadius, "你", OWN_BAND_EDGE, OWN_RING_COLOR, 0.55);
      this._drawRingLabel(
        ctx,
        this._layout.outerRadius,
        "天道",
        OPPONENT_BAND_EDGE,
        OPPONENT_RING_COLOR,
        0.55
      );
      this._drawGuiYuanLegend(ctx);
    }
    /**
     * 归元进度图例：盘下方一行「己 x/5」「敌 y/5」，颜色与各自环带对应。
     * 不放环带上：内环主印之间的空位只有 ~44px，放得下「己」一个字却放不下带数量的胶囊。
     */
    _drawGuiYuanLegend(ctx) {
      const fontSize = Math.round(Math.max(11, this._layout.sealSize * 0.55));
      const y = this._layout.centerY + this._layout.outerRadius + this._layout.sealSize * 1.9;
      const gap = this._layout.sealSize * 2.6;
      ctx.save();
      ctx.font = `bold ${String(fontSize)}px ${THEME.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = OWN_RING_COLOR;
      ctx.fillText(
        `你 ${String(this._countGuiYi(OWN_PLAYER))}/${String(WUXING_COUNT)}`,
        this._layout.centerX - gap,
        y
      );
      ctx.fillStyle = OPPONENT_RING_COLOR;
      ctx.fillText(
        `天道 ${String(this._countGuiYi(OPPONENT_PLAYER))}/${String(WUXING_COUNT)}`,
        this._layout.centerX + gap,
        y
      );
      ctx.restore();
    }
    /** 一个环归属标签：实心胶囊 + 文案，压在环带上（环带本身是半透明，胶囊保证文字读得清）。 */
    _drawRingLabel(ctx, radius, text, edge, textColor, fontRatio) {
      const x = this._layout.centerX + radius * Math.cos(RING_LABEL_ANGLE);
      const y = this._layout.centerY + radius * Math.sin(RING_LABEL_ANGLE);
      const fontSize = Math.round(Math.max(9, this._layout.sealSize * fontRatio));
      const width = Math.ceil(estimateTextWidth(text, fontSize)) + RING_LABEL_PADDING_X * 2;
      const height = fontSize + RING_LABEL_PADDING_Y * 2;
      ctx.save();
      drawPill(ctx, x - width / 2, y - height / 2, width, height, height / 2, BOARD_BG_COLOR, edge);
      ctx.fillStyle = textColor;
      ctx.font = `bold ${String(fontSize)}px ${THEME.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y + 1);
      ctx.restore();
    }
    _countGuiYi(player) {
      return this._elements.filter((entry) => entry.player === player && entry.isGuiYi).length;
    }
  }
  function guiYiRingLayers(element) {
    if (element.isKangJi) return 2;
    if (element.isGuiYi) return 1;
    return 0;
  }
  function guiYiRingGeometry(sealSize, layers) {
    const outsetPerLayer = GUIYI_RING_OUTSET_RATIO / 2;
    const radii = [];
    for (let layer = 0; layer < layers; layer += 1) {
      radii.push(sealSize * (1 + outsetPerLayer * (layer + 1)));
    }
    return {
      radii,
      width: Math.max(GUIYI_RING_WIDTH_MIN, sealSize * GUIYI_RING_WIDTH_RATIO)
    };
  }
  function drawPill(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  function withAlpha(hex, alpha) {
    const value = Number.parseInt(hex.slice(1), 16);
    const red = value >> 16 & 255;
    const green = value >> 8 & 255;
    const blue = value & 255;
    return `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(alpha)})`;
  }
  function drawYinYangFish(ctx, x, y, radius, polarity, level, element) {
    const yin = polarity === Polarity.YIN;
    const palette = WUXING_PALETTE[element];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.arc(x, y, radius, -Math.PI / 2, Math.PI / 2, yin);
    ctx.arc(x, y + radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2, true);
    ctx.arc(x, y - radius / 2, radius / 2, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    if (level === 2 || level === -1) ctx.clip();
    if (level !== 0) {
      if (level === 2) {
        const core = ctx.createRadialGradient(
          x,
          y + (yin ? 1 : -1) * radius / 2,
          0,
          x,
          y + (yin ? 1 : -1) * radius / 2,
          radius * 1.5
        );
        core.addColorStop(0, palette.light);
        core.addColorStop(0.45, palette.light);
        core.addColorStop(1, palette.main);
        ctx.fillStyle = core;
        ctx.shadowColor = palette.main;
        ctx.shadowBlur = 7;
      } else {
        ctx.fillStyle = level === -1 ? palette.dark : palette.main;
      }
      ctx.fill();
    }
    ctx.strokeStyle = level === 0 ? withAlpha(palette.main, VOID_OUTLINE_ALPHA) : level === -1 ? palette.dark : level === 1 ? palette.main : palette.light;
    ctx.lineWidth = level === 2 ? 2.2 : level === 0 ? 1.4 : 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const eyeY = y + (yin ? 1 : -1) * radius / 2;
    ctx.beginPath();
    ctx.arc(x, eyeY, Math.max(2, radius * 0.13), 0, Math.PI * 2);
    ctx.fillStyle = yin ? "#112129" : "#e5eee4";
    ctx.fill();
    if (level === -1) {
      const side = yin ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x + side * radius * 0.62, y - radius * 0.48);
      ctx.lineTo(x + side * radius * 0.36, y - radius * 0.1);
      ctx.lineTo(x + side * radius * 0.6, y + radius * 0.04);
      ctx.lineTo(x + side * radius * 0.72, y + radius * 0.48);
      ctx.strokeStyle = "#0b1d24";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    if (level === 2) {
      const sx = x + (yin ? -1 : 1) * radius * 0.66;
      ctx.beginPath();
      ctx.moveTo(sx - 2, y - 2);
      ctx.lineTo(sx + 2, y + 2);
      ctx.moveTo(sx + 2, y - 2);
      ctx.lineTo(sx - 2, y + 2);
      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
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
  function connectionKey(kind, from) {
    return `${kind}:${from}`;
  }
  function resolveActionPath(actionType, element) {
    if (isAttackAction(actionType)) {
      return { kind: "attack", from: element };
    }
    switch (actionType) {
      case ActionType.TRANS:
      case ActionType.BURST:
        return { kind: "generation", from: element };
      case ActionType.AUTO:
      case ActionType.CONVERT:
      case ActionType.DISSIPATE:
      case ActionType.PASS:
        return null;
      default: {
        const unhandled = actionType;
        throw new Error(`未处理的动作类型：${String(unhandled)}`);
      }
    }
  }
  const CHARACTER_ATLAS_PATH = "assets/characters.png";
  const CHARACTER_ATLAS_SIZE = { width: 1254, height: 1254 };
  const POSE_COLUMN = {
    idle: 0,
    attack: 1,
    hurt: 2,
    cast: 3,
    celebrate: 4,
    win: 5,
    lose: 6
  };
  const CHARACTER_ATLAS_COLUMNS = 4;
  const CHARACTER_ATLAS_ROWS = 4;
  const CHARACTER_ATLAS_FRAMES = {
    P1: {
      idle: { x: 76, y: 80, width: 174, height: 264, footY: 338 },
      attack: { x: 377, y: 79, width: 214, height: 265, footY: 337 },
      hurt: { x: 683, y: 98, width: 182, height: 247, footY: 337 },
      cast: { x: 981, y: 80, width: 216, height: 264, footY: 338 },
      celebrate: { x: 66, y: 359, width: 217, height: 304, footY: 655 },
      win: { x: 389, y: 399, width: 204, height: 264, footY: 655 },
      lose: { x: 683, y: 419, width: 182, height: 244, footY: 655 }
    },
    P2: {
      idle: { x: 987, y: 392, width: 210, height: 271, footY: 656 },
      attack: { x: 43, y: 692, width: 268, height: 271, footY: 954 },
      hurt: { x: 377, y: 709, width: 219, height: 254, footY: 953 },
      cast: { x: 660, y: 713, width: 229, height: 250, footY: 955 },
      celebrate: { x: 972, y: 672, width: 248, height: 291, footY: 956 },
      win: { x: 48, y: 980, width: 268, height: 241, footY: 1214 },
      lose: { x: 388, y: 988, width: 190, height: 234, footY: 1214 }
    }
  };
  function drawCharacterSprite(ctx, atlas, player, state, tick, frameX, frameY, frameWidth, frameHeight, motion) {
    const cellWidth = atlas.width / CHARACTER_ATLAS_COLUMNS;
    const cellHeight = atlas.height / CHARACTER_ATLAS_ROWS;
    const sourceFrame = (pose) => {
      const index = POSE_COLUMN[pose] + (player === "P1" ? 0 : 7);
      return atlas.frames?.[player]?.[pose] ?? {
        x: index % CHARACTER_ATLAS_COLUMNS * cellWidth,
        y: Math.floor(index / CHARACTER_ATLAS_COLUMNS) * cellHeight,
        width: cellWidth,
        height: cellHeight
      };
    };
    const crop = sourceFrame(state);
    const sourceWidth = crop.width;
    const sourceHeight = crop.height;
    const frames = Object.keys(POSE_COLUMN).map(sourceFrame);
    const maxWidth = Math.max(...frames.map((frame) => frame.width));
    const maxHeight = Math.max(...frames.map((frame) => frame.height));
    const scale = Math.min((frameWidth - 6) / maxWidth, (frameHeight - 12) / maxHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const offsets = {
      idle: Math.sin(tick * 0.08) * 2,
      attack: -2,
      hurt: 2,
      cast: Math.sin(tick * 0.06) * 1.5,
      celebrate: -Math.abs(Math.sin(tick * 0.12)) * 3,
      win: Math.sin(tick * 0.08) * 1.5,
      lose: 2
    };
    ctx.drawImage(
      atlas.image,
      crop.x,
      crop.y,
      sourceWidth,
      sourceHeight,
      frameX + (frameWidth - width) / 2 + (motion?.x ?? 0),
      frameY + frameHeight - 8 - ((crop.footY ?? crop.y + sourceHeight) - crop.y) * scale + (motion?.y ?? offsets[state]),
      width,
      height
    );
  }
  const AVATAR_WIDTH = 88;
  const AVATAR_HEIGHT = 112;
  const SIDE_MARGIN = 10;
  const TOP_BAR_HEIGHT = 26;
  const BANNER_GAP = 10;
  const BANNER_HEIGHT = 88;
  const PANEL_COLOR = THEME.panel;
  const PANEL_BORDER = THEME.edge;
  const ACTIVE_COLOR = THEME.gold;
  const EXTRA_TURN_COLOR = THEME.jade;
  const TEXT_COLOR = THEME.ivory;
  const MUTED_COLOR = THEME.muted;
  const P1_COLOR = THEME.jade;
  const P2_COLOR = THEME.rival;
  const HURT_COLOR = THEME.damage;
  const EXPRESSION_COLOR = {
    idle: null,
    attack: THEME.gold,
    hurt: HURT_COLOR,
    cast: "#b7f0da",
    celebrate: "#ed8936",
    win: "#48bb78",
    lose: "#a0aec0"
  };
  const PLAYER_LABEL = { P1: "你 · 弈者", P2: "天道" };
  const PLAYER_COLOR = { P1: P1_COLOR, P2: P2_COLOR };
  class CharacterView extends Container {
    constructor(options) {
      super();
      __publicField(this, "_width");
      __publicField(this, "_spriteAtlas", null);
      __publicField(this, "_safeTop");
      __publicField(this, "_compact");
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
      __publicField(this, "motions", {});
      __publicField(this, "transitions", {});
      this._width = options.width;
      this._safeTop = options.safeTop ?? 24;
      this._compact = options.compact ?? false;
    }
    changePose(player, pose, duration = 0) {
      const previous = this._expressions[player];
      if (previous === pose) return false;
      if (duration > 0) this.transitions[player] = { from: previous, elapsed: 0, duration };
      else delete this.transitions[player];
      this._expressions[player] = pose;
      return true;
    }
    /** Anticipation, release and recovery share the rune clock, including custom playback durations. */
    playAction(player, action, flight, impact) {
      this.setExpression(player, "cast", 0, Math.min(0.08, flight * 0.18));
      this.motions[player] = { action, elapsed: 0, flight, total: flight + impact };
    }
    motionOffset(player) {
      const motion = this.motions[player];
      if (motion === void 0) return void 0;
      const t = motion.elapsed / motion.flight;
      const direction = player === "P1" ? 1 : -1;
      if (t < 0.18)
        return {
          x: -direction * 1.5 * Math.sin(t / 0.18 * Math.PI),
          y: Math.sin(t / 0.18 * Math.PI)
        };
      const attack = motion.action === ActionType.ATK || motion.action === ActionType.BURST_ATK;
      const release = Math.sin(Math.min(1, (t - 0.18) / 0.82) * Math.PI);
      const recovery = Math.max(
        0,
        1 - (motion.elapsed - motion.flight) / (motion.total - motion.flight)
      );
      return {
        x: attack ? direction * 2.5 * release : 0,
        y: t < 1 ? -release * 1.5 : -Math.sin(recovery * Math.PI)
      };
    }
    /** Hosts inject the decoded image only after loading has completed. */
    setSpriteAtlas(atlas) {
      this._spriteAtlas = atlas !== null && Number.isFinite(atlas.width) && Number.isFinite(atlas.height) && atlas.width > 0 && atlas.height > 0 ? atlas : null;
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
      this._currentPlayer = options.actingPlayer ?? state.currentPlayer;
      this._isExtraTurn = options.isExtraTurn ?? false;
      this._scores = { P1: state.players.P1.score, P2: state.players.P2.score };
    }
    /** 视口自适应（安全区与宽度变化时调用）。 */
    resize(width, safeTop, compact) {
      this._width = width;
      this._safeTop = safeTop ?? this._safeTop;
      this._compact = compact ?? this._compact;
    }
    /**
     * 表情反馈：`holdSeconds` 秒后自动回落待机；`holdSeconds <= 0` 表示**持续**到下一次表情
     * 覆盖或 `resetFeedback()`（终局胜 / 负用）。重复触发会重新计时。
     */
    setExpression(player, expression, holdSeconds = 0.6, transitionSeconds = 0) {
      delete this.motions[player];
      this.changePose(player, expression, transitionSeconds);
      this._expressionTimers[player] = expression === "idle" ? 0 : Math.max(0, holdSeconds);
    }
    /** 指定玩家当前的表情。 */
    getExpression(player) {
      return this._expressions[player];
    }
    /** 清空双方表情与气泡（重开一局时调用）：终局胜 / 负的持续姿势不跨局残留。 */
    resetFeedback() {
      for (const player of PLAYER_IDS) {
        delete this.motions[player];
        delete this.transitions[player];
        this._expressions[player] = "idle";
        this._expressionTimers[player] = 0;
        this._bubbles[player] = null;
      }
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
        const transition = this.transitions[player];
        if (transition !== void 0) {
          transition.elapsed += dt;
          if (transition.elapsed >= transition.duration) delete this.transitions[player];
        }
        const motion = this.motions[player];
        if (motion !== void 0) {
          motion.elapsed += dt;
          const releaseAt = motion.flight * 0.18;
          const recoverAt = motion.flight + (motion.total - motion.flight) * 0.75;
          const recovering = motion.elapsed >= recoverAt;
          const attack = motion.action === ActionType.ATK || motion.action === ActionType.BURST_ATK;
          const pose = recovering ? "idle" : motion.elapsed >= releaseAt && attack ? "attack" : "cast";
          const duration = recovering ? Math.min(0.08, (motion.total - motion.flight) * 0.25) : Math.min(0.08, motion.flight * 0.18);
          if (this.changePose(player, pose, duration)) {
            const next = this.transitions[player];
            if (next !== void 0) {
              next.elapsed = Math.max(0, motion.elapsed - (recovering ? recoverAt : releaseAt));
              if (next.elapsed >= next.duration) delete this.transitions[player];
            }
          }
          if (motion.elapsed >= motion.total) delete this.motions[player];
        }
        if (this._expressionTimers[player] > 0) {
          this._expressionTimers[player] -= dt;
          if (this._expressionTimers[player] <= 0) {
            this._expressionTimers[player] = 0;
            this.changePose(player, "idle", 0.08);
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
      ctx.font = `bold 12px ${THEME.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `回合 ${this._round}/${this._maxRounds} · ${this._currentPlayer === "P1" ? "你行动" : this._currentPlayer === "P2" ? "天道行动" : "等待开局"}`,
        this._width / 2,
        this._safeTop + TOP_BAR_HEIGHT / 2
      );
      if (this._isExtraTurn) {
        ctx.fillStyle = EXTRA_TURN_COLOR;
        ctx.font = `bold 11px ${THEME.font}`;
        ctx.textAlign = "right";
        ctx.fillText("连动", this._width - SIDE_MARGIN, this._safeTop + TOP_BAR_HEIGHT / 2);
      }
      ctx.restore();
    }
    drawAvatar(ctx, player) {
      const avatarHeight = this._compact ? 80 : AVATAR_HEIGHT;
      const isPlayer = player === "P1";
      const frameX = isPlayer ? SIDE_MARGIN : this._width - SIDE_MARGIN - AVATAR_WIDTH;
      const frameY = this._safeTop + TOP_BAR_HEIGHT + 4;
      const isCurrent = this._currentPlayer === player;
      const expression = this._expressions[player];
      const border = EXPRESSION_COLOR[expression] ?? (isCurrent ? ACTIVE_COLOR : isPlayer ? P1_COLOR : P2_COLOR);
      ctx.save();
      drawPanel(ctx, frameX, frameY, AVATAR_WIDTH, avatarHeight, border, PANEL_COLOR);
      const aura = ctx.createRadialGradient(
        frameX + AVATAR_WIDTH / 2,
        frameY + 42,
        2,
        frameX + AVATAR_WIDTH / 2,
        frameY + 42,
        41
      );
      aura.addColorStop(0, isPlayer ? "rgba(128,214,186,0.18)" : "rgba(134,184,203,0.18)");
      aura.addColorStop(1, "transparent");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(frameX + AVATAR_WIDTH / 2, frameY + 44, 39, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(216,184,118,0.20)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(frameX + AVATAR_WIDTH / 2, frameY + 41, 29, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = THEME.deep;
      ctx.fillRect(frameX + 9, frameY + avatarHeight - 9, AVATAR_WIDTH - 18, 4);
      const drawPose = (pose, alpha) => {
        if (alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha *= alpha;
        if (this._spriteAtlas !== null) {
          drawCharacterSprite(
            ctx,
            this._spriteAtlas,
            player,
            pose,
            this._tick * 60,
            frameX,
            frameY,
            AVATAR_WIDTH,
            avatarHeight,
            this.motionOffset(player)
          );
        } else {
          const spriteTop = CHARACTER_SPRITE_BOUNDS.top * CHARACTER_PIXEL_SIZE;
          const spriteHeight = (CHARACTER_SPRITE_BOUNDS.bottom - CHARACTER_SPRITE_BOUNDS.top) * CHARACTER_PIXEL_SIZE;
          ctx.translate(
            frameX + AVATAR_WIDTH / 2,
            frameY + (avatarHeight - spriteHeight) / 2 - spriteTop
          );
          const motion = this.motionOffset(player);
          if (motion !== void 0) ctx.translate(motion.x, motion.y);
          drawPixelCharacter(ctx, 0, 0, isPlayer, pose, this._tick * 60);
        }
        ctx.restore();
      };
      const transition = this.transitions[player];
      if (transition === void 0) drawPose(expression, 1);
      else {
        const t = Math.min(1, transition.elapsed / transition.duration);
        const weight = t * t * (3 - 2 * t);
        drawPose(transition.from, 1 - weight);
        drawPose(expression, weight);
      }
      const labelX = isPlayer ? frameX : frameX + AVATAR_WIDTH;
      ctx.textAlign = isPlayer ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PLAYER_COLOR[player];
      ctx.font = `bold 11px ${THEME.font}`;
      ctx.fillText(PLAYER_LABEL[player], labelX, frameY + avatarHeight + 12);
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `bold 12px ${THEME.font}`;
      ctx.fillText(`得分 ${this._scores[player]}`, labelX, frameY + avatarHeight + 26);
      if (isCurrent) {
        ctx.fillStyle = this._isExtraTurn ? EXTRA_TURN_COLOR : ACTIVE_COLOR;
        ctx.font = `bold 9px ${THEME.font}`;
        ctx.fillText(this._isExtraTurn ? "连动行动中" : "行动中", labelX, frameY + avatarHeight + 40);
      }
      const bubble = this._bubbles[player];
      if (bubble !== null) {
        this.drawBubble(ctx, player, frameX, frameY, bubble.text);
      }
      ctx.restore();
    }
    /** 气泡：挂在头像上方，宽度夹在头像列与居中回合条之间，文本超宽时截断。 */
    drawBubble(ctx, player, frameX, frameY, text) {
      const isPlayer = player === "P1";
      const maxWidth = this._width / 2 - SIDE_MARGIN - AVATAR_WIDTH - 12;
      const fontSize = 10;
      const label = truncateToWidth(text, maxWidth - 12, fontSize);
      const width = estimateTextWidth(label, fontSize) + 12;
      const height = 20;
      const x = isPlayer ? Math.min(frameX, Math.max(SIDE_MARGIN, frameX + AVATAR_WIDTH - width)) : Math.max(frameX + AVATAR_WIDTH - width, this._width - SIDE_MARGIN - width);
      const y = frameY - height - 4;
      drawPanel(ctx, x, y, width, height, EXTRA_TURN_COLOR);
      drawPixelRect(ctx, x, y, width, 2, EXTRA_TURN_COLOR);
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `${fontSize}px ${THEME.font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + width / 2, y + height / 2 + 1);
    }
    /** 横幅：主文案（12px，最多两行）+ 副文案（9px，最多两行）。 */
    drawBanner(ctx) {
      if (this._bannerText === "" && this._bannerSubText === "") {
        return;
      }
      const x = SIDE_MARGIN + AVATAR_WIDTH + BANNER_GAP;
      const width = Math.max(80, this._width - 2 * x);
      const y = this._safeTop + TOP_BAR_HEIGHT + 4;
      ctx.save();
      drawPanel(ctx, x, y, width, this._compact ? 64 : BANNER_HEIGHT, PANEL_BORDER);
      const textWidth = width - 16;
      const mainLines = wrapText(this._bannerText, textWidth, 13, this._compact ? 1 : 2);
      const subLines = wrapText(this._bannerSubText, textWidth, 11, this._compact ? 2 : 4);
      const mainLineHeight = 16;
      const subLineHeight = 14;
      const blockHeight = mainLines.length * mainLineHeight + subLines.length * subLineHeight;
      let cursor = y + ((this._compact ? 64 : BANNER_HEIGHT) - blockHeight) / 2 + mainLineHeight / 2;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = `bold 13px ${THEME.font}`;
      for (const line of mainLines) {
        ctx.fillText(line, x + width / 2, cursor);
        cursor += mainLineHeight;
      }
      ctx.fillStyle = MUTED_COLOR;
      ctx.font = `11px ${THEME.font}`;
      for (const line of subLines) {
        ctx.fillText(line, x + width / 2, cursor);
        cursor += subLineHeight;
      }
      ctx.restore();
    }
  }
  const PLAYER_IDS = ["P1", "P2"];
  function wrapText(text, maxWidth, fontSize, maxLines) {
    if (text === "") {
      return [];
    }
    const lines = [];
    let current = "";
    for (const unit of textUnits(text)) {
      if (unit === "\n") {
        lines.push(current);
        current = "";
        if (lines.length === maxLines) break;
        continue;
      }
      const next = current + unit;
      if (current !== "" && estimateTextWidth(next, fontSize) > maxWidth) {
        lines.push(current);
        current = unit;
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
    if ([...lines.join("")].length < [...text.replace(/\n/g, "")].length) {
      const last = lines[lines.length - 1] ?? "";
      lines[lines.length - 1] = `${truncateToWidth(last, maxWidth, fontSize)}…`;
    }
    return lines;
  }
  function textUnits(text) {
    const units = [];
    let bracket = "";
    for (const char of text) {
      if (bracket !== "") {
        bracket += char;
        if (char === "】") {
          units.push(bracket);
          bracket = "";
        }
        continue;
      }
      if (char === "【") {
        bracket = char;
        continue;
      }
      units.push(char);
    }
    if (bracket !== "") {
      units.push(bracket);
    }
    return units;
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
  const LEVEL_LABEL = {
    [-1]: "道损",
    0: "虚空",
    1: "点亮",
    2: "加持"
  };
  const ACTION_LABEL = {
    [ActionType.AUTO]: "吸纳",
    [ActionType.CONVERT]: "调息",
    [ActionType.TRANS]: "化",
    [ActionType.ATK]: "破",
    [ActionType.BURST]: "强化",
    [ActionType.BURST_ATK]: "强破",
    [ActionType.DISSIPATE]: "散气",
    [ActionType.PASS]: "消散"
  };
  function changedNodes(before, after) {
    if (before === null) return [];
    const changes = [];
    for (const player of ["P1", "P2"])
      for (const element of Object.values(WuXing)) {
        for (const polarity of [Polarity.YIN, Polarity.YANG]) {
          const key = polarity === Polarity.YIN ? "yin" : "yang";
          const previous = before.players[player].board[element][key];
          const next = after.players[player].board[element][key];
          if (previous !== next)
            changes.push({ player, element, polarity, before: previous, after: next });
        }
      }
    return changes;
  }
  function describeNodeChange(change) {
    return `${change.player === "P1" ? "你" : "天道"}·${WUXING_PALETTE[change.element].name}${change.polarity === Polarity.YIN ? "阴" : "阳"} ${LEVEL_LABEL[change.before]}→${LEVEL_LABEL[change.after]}`;
  }
  class ActionResultView extends Container {
    constructor(width) {
      super();
      __publicField(this, "changes", []);
      __publicField(this, "title", "");
      __publicField(this, "note");
      __publicField(this, "width");
      __publicField(this, "expanded", false);
      this.width = width;
      this.visible = false;
      this.onTap = () => {
        this.expanded = !this.expanded;
        this.reflow();
        return true;
      };
    }
    setResult(actor, action, stem, changes, note) {
      this.title = `上一招 · ${actor === "P1" ? "你" : "天道"}用${stem} · ${action === "showdown" ? "天命抽牌" : ACTION_LABEL[action]}`;
      this.changes = [...changes];
      this.note = note;
      this.expanded = false;
      this.visible = true;
      this.reflow();
    }
    reset() {
      this.visible = false;
      this.title = "";
      this.changes = [];
      this.expanded = false;
    }
    resize(width) {
      this.width = width;
      this.reflow();
    }
    reflow() {
      const height = this.expanded ? 32 + Math.max(1, this.changes.length + (this.note ? 1 : 0)) * 18 : 34;
      this.hitArea = { x: 0, y: 34 - height, width: this.width, height };
    }
    renderSelf(ctx) {
      const area = this.hitArea;
      drawPanel(ctx, 0, area.y, this.width, area.height, THEME.edge, THEME.deep);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `11px ${THEME.font}`;
      ctx.fillStyle = THEME.muted;
      ctx.fillText(this.title, 9, area.y + 10);
      ctx.fillStyle = THEME.ivory;
      if (this.expanded) {
        const lines = this.changes.length === 0 ? ["未改变任何阴阳状态"] : this.changes.map(describeNodeChange);
        if (this.note) lines.unshift(this.note);
        lines.forEach((line, index) => ctx.fillText(line, 9, area.y + 32 + index * 18));
        ctx.textAlign = "right";
        ctx.fillStyle = THEME.muted;
        ctx.fillText("收起", this.width - 9, area.y + 10);
      } else {
        const first = this.changes[0];
        ctx.fillText(
          this.note ?? (first === void 0 ? "未改变任何阴阳状态" : describeNodeChange(first)),
          9,
          25
        );
        ctx.textAlign = "right";
        ctx.fillStyle = THEME.jade;
        ctx.fillText(
          this.changes.length > 1 ? `${this.changes.length}处 · 展开` : "查看",
          this.width - 9,
          25
        );
      }
    }
  }
  const EASINGS = {
    /** 线性：进度即比例。 */
    linear: (t) => t,
    /** 先快后慢（二次）。 */
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    /** 先快后慢（三次）：入场与飞行的默认手感。 */
    outCubic: (t) => 1 - (1 - t) ** 3,
    /** 两头慢、中间快（二次）。 */
    inOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
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
      __publicField(this, "actionType", null);
      __publicField(this, "targetSlot", null);
      __publicField(this, "secondaryTarget", null);
      this.board = options.board;
      this.centerX = options.centerX ?? 0;
      this.centerY = options.centerY ?? 0;
      this.entranceDuration = options.entranceDuration ?? DEFAULT_ENTRANCE_DURATION;
      this.flightDuration = options.flightDuration ?? DEFAULT_FLIGHT_DURATION;
      this.impactDuration = options.impactDuration ?? DEFAULT_IMPACT_DURATION;
      this.rune = new RuneNode();
      this.rune.radius = Math.max(
        8,
        Math.min(25, this.board.layout.innerRadius - this.board.layout.sealSize - 3)
      );
      this.rune.x = this.centerX;
      this.rune.y = this.centerY;
      this.rune.visible = false;
      this.addChild(this.rune);
      this.ripple = new ImpactNode();
      this.ripple.visible = false;
      this.addChild(this.ripple);
    }
    /** Reproject through BoardView on resize; waiting glyphs and in-flight targets share its geometry. */
    syncCenter() {
      this.rune.radius = Math.max(
        8,
        Math.min(25, this.board.layout.innerRadius - this.board.layout.sealSize - 3)
      );
      this.centerX = this.board.layout.centerX;
      this.centerY = this.board.layout.centerY;
      if (this._phase === "entering" || this._phase === "ready") {
        this.rune.x = this.centerX;
        this.rune.y = this.centerY;
      }
      if (this.secondaryTarget !== null)
        this.secondaryTarget = this.board.getSlot(
          this.secondaryTarget.player,
          this.secondaryTarget.element,
          this.secondaryTarget.polarity
        );
      if (this._phase === "impact" && this.targetSlot !== null) {
        const target = this.board.getSlot(
          this.targetSlot.player,
          this.targetSlot.element,
          this.targetSlot.polarity
        );
        this.ripple.x = target.x;
        this.ripple.y = target.y;
        this.rune.x = target.x;
        this.rune.y = target.y;
      }
    }
    get actionDuration() {
      return this.flightDuration + this.impactDuration;
    }
    cancel() {
      this.entrance = null;
      this.flight = null;
      this.entranceOnComplete = void 0;
      this.flightOnComplete = void 0;
      this.rune.visible = false;
      this.ripple.visible = false;
      this._phase = "hidden";
    }
    renderSelf(ctx) {
      if (this._phase === "impact" && this.secondaryTarget !== null && this.ripple.showImpact) {
        ctx.save();
        ctx.globalAlpha *= 1 - this.impactState.progress;
        ctx.strokeStyle = this.ripple.lightColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          this.secondaryTarget.x,
          this.secondaryTarget.y,
          5 + this.impactState.progress * 11,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }
    }
    get owner() {
      return this.rune.owner;
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
      this.actionType = null;
      this.rune.actionType = null;
      this.secondaryTarget = null;
      this._tianGan = tianGan;
      this._haloStyle = tianGan.polarity === Polarity.YANG ? "corona" : "moonlight";
      this.rune.tianGan = tianGan;
      this.rune.owner = options.owner ?? null;
      this.rune.showOwner = this.board.layout.innerRadius >= 70;
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
     * 动作选定：符文从当前位置飞向目标槽位（坐标取自 `BoardView.getSlot(player, …)`），
     * 命中后触发波纹并让符文被吸收。**波纹也跑完**才回调 `onComplete`，
     * 此时 `isAnimating` 为 false，调用方可以交回回合控制权。
     *
     * `player` 是被作用方的盘：攻击类（破 / 强破）传对方、其余传己方，落点随之落在对应环上。
     * 入场还没跑完就调用时，先把入场收尾再起飞（玩家点得比动画快也不会丢飞行）；
     * 从未 `playEntrance()` 或已在飞行中则直接报错。
     */
    flyTo(player, element, polarity, options = {}) {
      if (this._phase === "entering") {
        this.finishEntrance();
        this.entranceOnComplete = void 0;
      }
      const tianGan = this._tianGan;
      if (this._phase !== "ready" || tianGan === null) {
        throw new Error("符文不在待机态，无法起飞；请先 playEntrance() 并等它落地。");
      }
      this.actionType = options.actionType ?? null;
      this.rune.actionType = this.actionType;
      this.rune.showOwner = false;
      this.ripple.actionType = this.actionType;
      this.ripple.showImpact = options.showImpact ?? true;
      const isPass = this.actionType === ActionType.PASS;
      const target = isPass ? { x: this.centerX, y: this.centerY } : this.board.getSlot(player, element, polarity);
      this.targetSlot = isPass ? null : this.board.getSlot(player, element, polarity);
      this.secondaryTarget = options.secondaryPolarity === void 0 ? null : this.board.getSlot(player, element, options.secondaryPolarity);
      const startX = this.rune.x;
      const startY = this.rune.y;
      const centerAtStartX = this.centerX;
      const centerAtStartY = this.centerY;
      const isYang = tianGan.polarity === Polarity.YANG;
      this.flightState.progress = 0;
      this._phase = "flying";
      this.flightOnComplete = options.onComplete;
      const flightTween = new Tween(
        this.flightState,
        { progress: 1 },
        {
          duration: this.flightDuration,
          easing: EASINGS.linear,
          onUpdate: (time) => {
            const projected = isPass ? { x: this.centerX, y: this.centerY } : this.board.getSlot(player, element, polarity);
            const fromX = startX + this.centerX - centerAtStartX;
            const fromY = startY + this.centerY - centerAtStartY;
            const deltaX = projected.x - fromX;
            const deltaY = projected.y - fromY;
            const length = Math.hypot(deltaX, deltaY) || 1;
            const normalX = -deltaY / length;
            const normalY = deltaX / length;
            const progress = this.actionType === null ? EASINGS.outCubic(time) : EASINGS.inOutQuad(Math.max(0, (time - 0.18) / 0.82));
            let curve = isYang ? -Math.sin(progress * Math.PI) * METEOR_ARC : Math.sin(progress * Math.PI * SERPENTINE_WAVES) * SERPENTINE_AMPLITUDE;
            if (this.actionType === ActionType.ATK || this.actionType === ActionType.BURST_ATK)
              curve *= 0.12;
            if (this.actionType === ActionType.CONVERT) curve = Math.sin(progress * Math.PI * 2) * 23;
            if (this.actionType === ActionType.TRANS) curve = -Math.sin(progress * Math.PI) * 48;
            if (this.actionType === ActionType.AUTO)
              curve = Math.sin(progress * Math.PI * 4) * 12 * (1 - progress);
            this.rune.progress = time;
            if (this.actionType !== null) {
              const release = EASINGS.inOutQuad(Math.min(1, Math.max(0, (time - 0.18) / 0.2)));
              const scale = time < 0.18 ? 1 + Math.sin(time / 0.18 * Math.PI) * 0.12 : 1 - 0.38 * release;
              this.rune.scaleX = scale;
              this.rune.scaleY = scale;
              if (isPass) this.rune.alpha = 1 - progress;
            }
            this.rune.x = fromX + deltaX * progress + normalX * curve;
            this.rune.y = fromY + deltaY * progress + normalY * curve;
          },
          onComplete: () => {
            const arrival = isPass ? { x: this.centerX, y: this.centerY } : this.board.getSlot(player, element, polarity);
            this.rune.x = arrival.x;
            this.rune.y = arrival.y;
            this.ripple.x = arrival.x;
            this.ripple.y = arrival.y;
            this._phase = "impact";
            if (!isPass) options.onImpact?.();
          }
        }
      );
      this.flight = new TweenSequence(
        [flightTween, this.buildImpactTween(target.x, target.y, element)],
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
      this.ripple.lightColor = palette.light;
      this.ripple.visible = false;
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
      this.ripple.visible = true;
      this.ripple.progress = progress;
      this.ripple.radius = IMPACT_MAX_RADIUS * progress;
      this.ripple.alpha = 1 - progress;
      this.rune.alpha = this.actionType === ActionType.PASS ? 0 : 1 - progress;
      const scale = (this.actionType === null ? 1 : 0.62) * (1 - ABSORB_SHRINK * progress);
      this.rune.scaleX = scale;
      this.rune.scaleY = scale;
    }
  }
  class RuneNode extends Node {
    constructor() {
      super(...arguments);
      __publicField(this, "tianGan", null);
      __publicField(this, "haloStyle", "corona");
      __publicField(this, "tick", 0);
      __publicField(this, "actionType", null);
      __publicField(this, "progress", 0);
      __publicField(this, "owner", null);
      __publicField(this, "radius", 25);
      __publicField(this, "showOwner", true);
    }
    renderSelf(ctx) {
      if (this.tianGan === null) return;
      drawCenterTianGanRune(ctx, 0, 0, this.tianGan, this.tick, this.radius);
      if (this.owner !== null && this.showOwner) {
        ctx.fillStyle = THEME.ivory;
        ctx.font = `11px ${THEME.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.owner === "P1" ? "你的天干" : "天道的天干", 0, -36);
      }
    }
  }
  class ImpactNode extends Node {
    constructor() {
      super(...arguments);
      __publicField(this, "radius", 0);
      __publicField(this, "showImpact", true);
      __publicField(this, "maxRadius", IMPACT_MAX_RADIUS);
      __publicField(this, "lightColor", "#ffffff");
      __publicField(this, "actionType", null);
      __publicField(this, "progress", 0);
    }
    renderSelf(ctx) {
      if (this.radius <= 0 || this.actionType === ActionType.PASS || !this.showImpact) return;
      ctx.strokeStyle = this.lightColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 5 + this.progress * 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const DEFAULT_SAFE_TOP = 24;
  const DEFAULT_SAFE_BOTTOM = 12;
  const DEFAULT_AUTO_EXECUTE_DELAY = 0.75;
  const DEFAULT_AI_THINK_DELAY = 0.55;
  const DEFAULT_EXPRESSION_HOLD = 0.6;
  const DEFAULT_CELEBRATE_HOLD = 1.2;
  const ACTION_BAR_MARGIN = 14;
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
      __publicField(this, "autoExecuteDelay");
      __publicField(this, "aiThinkDelay");
      __publicField(this, "expressionHold");
      __publicField(this, "celebrateHold");
      __publicField(this, "entranceDuration");
      __publicField(this, "flightDuration");
      __publicField(this, "impactDuration");
      __publicField(this, "resultHold");
      __publicField(this, "lastAction");
      __publicField(this, "visualStem", null);
      __publicField(this, "visualActor", null);
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
      __publicField(this, "pendingCelebrations", /* @__PURE__ */ new Set());
      __publicField(this, "actionBefore", null);
      __publicField(this, "lastShowdown", null);
      __publicField(this, "unsubscribes", []);
      /** 视口在对局中变化时，符文层延到下一个回合开始前重建（不打断当前动效）。 */
      __publicField(this, "runeFlightStale", false);
      this.width = options.width;
      this.height = options.height;
      this.safeTop = options.safeTop ?? DEFAULT_SAFE_TOP;
      this.safeBottom = options.safeBottom ?? DEFAULT_SAFE_BOTTOM;
      this.rules = options.rules ?? {};
      this.autoExecuteDelay = options.autoExecuteDelay ?? DEFAULT_AUTO_EXECUTE_DELAY;
      this.aiThinkDelay = options.aiThinkDelay ?? DEFAULT_AI_THINK_DELAY;
      this.expressionHold = options.expressionHold ?? DEFAULT_EXPRESSION_HOLD;
      this.celebrateHold = options.celebrateHold ?? DEFAULT_CELEBRATE_HOLD;
      this.entranceDuration = options.entranceDuration ?? 0.44;
      this.flightDuration = options.flightDuration ?? 0.55;
      this.impactDuration = options.impactDuration ?? 0.35;
      this.resultHold = options.resultHold ?? 0.65;
      this.strategy = createStrategy(BALANCED_WEIGHTS, { rules: this.rules });
      this._turnManager = options.turnManager ?? new TurnManager({
        prng: options.prng ?? createPRNG(options.seed ?? Date.now()),
        initialState: options.initialState
      });
      this.board = new BoardView();
      this.layoutBoard();
      this.runeFlight = this.buildRuneFlight();
      this.characters = new CharacterView({
        width: this.width,
        safeTop: this.safeTop,
        compact: this.height < 650 && this.safeTop > 24
      });
      this.actionBar = this.buildActionBar(this._turnManager);
      this.actionBar.visible = false;
      this.placeActionBar();
      this.lastAction = new ActionResultView(this.width - 20);
      this.lastAction.x = 10;
      this.placeResult();
      this.addChild(this.board);
      this.addChild(this.runeFlight);
      this.addChild(this.characters);
      this.addChild(this.actionBar);
      this.addChild(this.lastAction);
      this.bindTurnManager(this._turnManager);
    }
    /** 核心状态机（只读；`restart()` 会换成新实例）。 */
    get turnManager() {
      return this._turnManager;
    }
    /** 当前表现阶段。 */
    get visualTurn() {
      return { player: this.visualActor, stem: this.visualStem };
    }
    get phase() {
      return this._phase;
    }
    /** 切换表现阶段：连线高亮与阶段一致（只有 `awaiting-player` 的待定动作会点亮连线）。 */
    setPhase(phase) {
      this._phase = phase;
      this.board.setActivePaths(this.activePathsFor(phase));
      this.placeResult();
    }
    /**
     * 当前阶段该点亮的连线：候选动作各自映射成路径后取并集（同一根天干下最多两类，
     * 分别指向内环相生边与跨环径向线）；非抉择阶段一律为空，避免误导。
     */
    activePathsFor(phase) {
      if (phase !== "awaiting-player") {
        return [];
      }
      const tianGan = this._turnManager.getCurrentTianGan();
      if (tianGan === null) {
        return [];
      }
      const paths = [];
      for (const action of this._turnManager.getAvailableActions()) {
        const path = resolveActionPath(action.actionType, tianGan.element);
        if (path !== null) {
          paths.push(path);
        }
      }
      return paths;
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
      this.actionBar.resize(width - ACTION_BAR_MARGIN * 2);
      this.layoutBoard();
      this.runeFlight.syncCenter();
      this.characters.resize(width, this.safeTop, this.height < 650 && this.safeTop > 24);
      this.placeActionBar();
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
      this.pendingCelebrations.clear();
      this.actionBefore = null;
      this.runeFlight.cancel();
      this.x = 0;
      this.y = 0;
      this.characters.resetFeedback();
      this.lastAction.reset();
      this.visualStem = null;
      this.visualActor = null;
      this.actionBar.dispose();
      this.actionBar.removeFromParent();
      this.actionBar = this.buildActionBar(this._turnManager);
      this.placeActionBar();
      this.addChild(this.actionBar);
      this.bindTurnManager(this._turnManager);
      this.setPhase("idle");
      this.beginTurn();
    }
    /** 退订核心事件（销毁场景时调用）。 */
    dispose() {
      this.unbindTurnManager();
      this.actionBar.dispose();
      this.runeFlight.cancel();
      this.characters.resetFeedback();
      this.lastAction.reset();
      this.timer = 0;
      this.setPhase("idle");
    }
    /**
     * 主循环步进（秒）：推进动效与缓冲倒计时。
     * `Tween` 不掌握帧循环，时钟完全由这里注入。
     */
    update(dt) {
      const phaseBefore = this._phase;
      this.characters.updateTimers(dt);
      this.runeFlight.update(dt);
      if (this._phase === "result") {
        if (phaseBefore !== "result") return;
        this.timer -= dt;
        if (this.timer <= 0) this.finishResult();
        return;
      }
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
      this.layoutBoard();
      if (Math.abs(this.runeFlight.position.x - this.board.layout.centerX) > 0.1 || Math.abs(this.runeFlight.position.y - this.board.layout.centerY) > 0.1)
        this.replaceRuneFlight();
      const before = this._turnManager.getState();
      const actions = this._turnManager.startTurn();
      const state = this._turnManager.getState();
      const tianGan = this._turnManager.getCurrentTianGan();
      this.pendingAction = null;
      this.timer = 0;
      this.visualStem = tianGan;
      this.visualActor = state.currentPlayer;
      this.characters.update(state, { isExtraTurn: this._turnManager.isExtraTurnActive() });
      if (state.isGameOver) {
        this.presentGameOver(before);
        return;
      }
      this.projectBoards(state);
      this.hideActionBar();
      if (actions.length > 1) this.actionBar.refresh();
      this.layoutBoard();
      this.replaceRuneFlight();
      this.announceTurnStart(state, tianGan, actions);
      if (tianGan === null) {
        this.afterEntrance();
        return;
      }
      this.setPhase("entrance");
      this.runeFlight.playEntrance(tianGan, {
        owner: state.currentPlayer,
        onComplete: () => this.afterEntrance()
      });
    }
    /** 降临结束：进入玩家抉择 / 自动流转 / 天道推演三者之一。 */
    afterEntrance() {
      const state = this._turnManager.getState();
      const actions = this._turnManager.getAvailableActions();
      if (state.currentPlayer === "P2") {
        this.setPhase("ai-thinking");
        this.timer = this.aiThinkDelay;
        return;
      }
      if (actions.length === 1) {
        this.setPhase("auto-pending");
        this.timer = this.autoExecuteDelay;
        this.pendingAction = actions[0];
        return;
      }
      this.setPhase("awaiting-player");
      this.actionBar.visible = true;
      this.actionBar.interactive = true;
      this.actionBar.refresh();
      this.placeActionBar();
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
    /** `action:execute`：记录完整载荷（此时核心尚未结算），供 `action:executed` 解析飞行落点。 */
    handleActionExecute(event) {
      this.pendingCelebrations.clear();
      this.actionBefore = null;
      this.actionBefore = this._turnManager.getState();
      this.actionInFlight = event.action;
    }
    /** `action:executed`：动作已结算，播放符文飞行；法盘已是行动前等级，落点后才投影结算结果。 */
    handleActionExecuted(event) {
      const action = this.actionInFlight;
      this.actionInFlight = null;
      const state = this._turnManager.getState();
      const actor = event.player;
      const resolved = resolveActionTarget(action, event.actionType, actor, this._turnManager);
      const beforeState = this.actionBefore;
      const changes = changedNodes(beforeState, state).sort(
        (a, b) => Number(b.player === resolved.player && b.element === resolved.element) - Number(a.player === resolved.player && a.element === resolved.element)
      );
      const targetChanges = changes.filter(
        (change) => change.player === resolved.player && change.element === resolved.element
      );
      const beforeNode = this.actionBefore?.players[resolved.player].board[resolved.element];
      const afterNode = state.players[resolved.player].board[resolved.element];
      const changedPolarities = beforeNode === void 0 ? [] : [Polarity.YIN, Polarity.YANG].filter(
        (polarity) => polarity === Polarity.YIN ? beforeNode.yin !== afterNode.yin : beforeNode.yang !== afterNode.yang
      );
      const target = { ...resolved, polarity: changedPolarities[0] ?? resolved.polarity };
      const secondaryPolarity = changedPolarities.find((polarity) => polarity !== target.polarity);
      this.actionBefore = null;
      const isAttack = isAttackAction(event.actionType);
      this.hideActionBar();
      const stemLabel = this.visualStem?.name ?? "";
      const actionTitle = `${actor === "P1" ? "你" : "天道"} · ${ACTION_LABEL[event.actionType]}`;
      const compact = this.height < 650 && this.safeTop > 24;
      this.characters.showBanner(
        actionTitle,
        `${stemLabel} · ${this.visualStem === null ? "" : WUXING_PALETTE[this.visualStem.element].name}${this.visualStem?.polarity === Polarity.YANG ? "阳" : "阴"}
${event.actionType === ActionType.PASS ? "原地消散 · 无节点变化" : `${compact ? "→ " : "作用于 "}${target.player === "P1" ? "你" : "天道"}·${WUXING_PALETTE[target.element].name}${compact ? "" : "·"}${target.polarity === Polarity.YIN ? "阴" : "阳"}`}`
      );
      this.characters.update(beforeState ?? state, {
        isExtraTurn: this._turnManager.isExtraTurnActive(),
        actingPlayer: actor
      });
      this.characters.playAction(actor, event.actionType, this.flightDuration, this.impactDuration);
      this.setPhase("flying");
      this.runeFlight.flyTo(target.player, target.element, target.polarity, {
        actionType: event.actionType,
        secondaryPolarity,
        showImpact: targetChanges.length > 0,
        onImpact: () => {
          this.projectBoards(state);
          this.characters.update(
            { ...state, round: beforeState?.round ?? state.round },
            { actingPlayer: actor }
          );
          this.showActionResult(
            actor,
            event.actionType,
            stemLabel,
            changes,
            targetChanges.length === 0
          );
          if (isAttack && targetChanges.some((change) => change.after < change.before)) {
            this.characters.setExpression(
              opponentOf(actor),
              "hurt",
              Math.max(this.expressionHold, this.impactDuration),
              Math.min(0.08, this.impactDuration * 0.3)
            );
          }
          for (const player of this.pendingCelebrations) {
            this.characters.setExpression(player, "celebrate", this.celebrateHold, 0.08);
          }
          this.pendingCelebrations.clear();
        },
        onComplete: () => {
          if (event.actionType === ActionType.PASS)
            this.showActionResult(actor, event.actionType, stemLabel, changes);
          this.afterFlight();
        }
      });
    }
    /**
     * `node:stateChanged`：某侧由 <1 变 ≥1 且该节点达成归一（核心真源 `isNodeGuiYi`）——
     * 按归属方在对应角色上播庆祝（票 03）。事件派发时 `turnManager.getState()` 已是新状态。
     */
    handleNodeStateChanged(event) {
      if (event.prevLevel >= 1 || event.newLevel < 1) {
        return;
      }
      const node = this._turnManager.getState().players[event.player].board[event.element];
      if (isNodeGuiYi(node)) {
        if (this._phase === "flying") this.pendingCelebrations.add(event.player);
        else this.characters.setExpression(event.player, "celebrate", this.celebrateHold);
      }
    }
    showActionResult(actor, action, stem, changes, targetUnchanged = false) {
      this.lastAction.setResult(
        actor,
        action,
        stem,
        changes,
        targetUnchanged && action !== ActionType.PASS ? "目标阴阳未变" : void 0
      );
      const compact = this.height < 650 && this.safeTop > 24;
      this.characters.showBanner(
        `${actor === "P1" ? "你" : "天道"} · ${ACTION_LABEL[action]}${compact ? "" : "已结算"}`,
        changes.length === 0 ? "未改变阴阳状态" : `${targetUnchanged ? "目标阴阳未变\n" : ""}${describeNodeChange(changes[0])}${!compact && changes.length > 1 ? `
共${changes.length}处 · 下方可展开` : ""}`
      );
      this.placeResult();
    }
    /** Keep the acting player and stem visible long enough to read the change before handover. */
    afterFlight() {
      this.projectBoards(this._turnManager.getState());
      this.setPhase("result");
      this.timer = this.resultHold;
    }
    finishResult() {
      const state = this._turnManager.getState();
      if (state.isGameOver) this.presentGameOver(null);
      else this.beginTurn();
    }
    /**
     * 终局展示：天命揭牌保留抽牌横幅与符文揭示动效，常规终局用胜负横幅。
     * `beforeShowdown` 是天命揭牌抽牌前的快照（只有揭牌路径传入），用于「落点才点亮」的定格。
     */
    presentGameOver(beforeShowdown) {
      const state = this._turnManager.getState();
      this.setPhase("game-over");
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
        this.characters.setExpression("P2", "cast", 0);
        this.board.update(beforeShowdown.players.P1.board, beforeShowdown.players.P2.board);
        const { element, polarity } = showdown.tianGan;
        this.visualStem = showdown.tianGan;
        this.visualActor = "P2";
        this.characters.update(state, { actingPlayer: "P2" });
        this.runeFlight.playEntrance(showdown.tianGan, {
          owner: "P2",
          onComplete: () => {
            this.runeFlight.flyTo("P2", element, polarity, {
              onImpact: () => {
                this.board.update(state.players.P1.board, state.players.P2.board);
                this.lastAction.setResult(
                  "P2",
                  "showdown",
                  showdown.tianGan.name,
                  changedNodes(beforeShowdown, state)
                );
                this.placeResult();
              },
              onComplete: () => {
                this.board.update(state.players.P1.board, state.players.P2.board);
                this.showFinalPoses(state);
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
      this.showFinalPoses(state);
      this.projectBoards(state);
    }
    /** 终局姿势：胜方「胜」、负方「负」，持续到重开（`restart()` 清掉）；平局不摆姿势。 */
    showFinalPoses(state) {
      const winner = state.winner;
      if (winner !== "P1" && winner !== "P2") {
        return;
      }
      this.characters.setExpression(winner, "win", 0);
      this.characters.setExpression(opponentOf(winner), "lose", 0);
    }
    /** 回合开始的播报：连动标记、天干名与「势在必行」的自动流转提示。 */
    announceTurnStart(state, tianGan, actions) {
      const isExtraTurn = this._turnManager.isExtraTurnActive();
      const isPlayer = state.currentPlayer === "P1";
      const who = isPlayer ? "你" : "天道";
      const main = isExtraTurn ? `${who}的连动回合` : `${who}的回合`;
      const stemText = tianGan === null ? "" : `${tianGan.name} · ${WUXING_PALETTE[tianGan.element].name}${tianGan.polarity === Polarity.YANG ? "阳" : "阴"}`;
      const prompt = !isPlayer ? "天道选择法术" : actions.length === 1 ? ACTION_LABEL[actions[0].actionType] : "请选择法术";
      const sub = `${stemText}
${prompt}`;
      this.characters.showBanner(main, sub);
    }
    /** 一次投影双方的棋盘到法盘双环（只读快照，不写回；ADR 0015）。 */
    projectBoards(state) {
      this.board.update(state.players.P1.board, state.players.P2.board);
    }
    hideActionBar() {
      this.actionBar.visible = false;
      this.actionBar.interactive = false;
    }
    /** 把操作面板底对齐到安全区底部：按钮实测多高就占多高，不留空档。 */
    placeActionBar() {
      this.actionBar.x = ACTION_BAR_MARGIN;
      this.actionBar.y = this.height - this.safeBottom - this.actionBar.contentHeight;
      this.placeResult();
    }
    layoutBoard() {
      const compact = this.height < 650 || this.safeTop > 24;
      const buttonHeight = Math.max(58, this.actionBar?.contentHeight ?? 0);
      this.board.resize(
        this.width,
        this.height,
        compact ? {
          top: this.safeTop + (this.height < 650 && this.safeTop > 24 ? 100 : 128),
          bottom: this.height - this.safeBottom - buttonHeight - 64
        } : void 0
      );
    }
    buildActionBar(turnManager) {
      return new ActionBarView({
        turnManager,
        width: this.width - ACTION_BAR_MARGIN * 2
      });
    }
    buildRuneFlight() {
      return new RuneFlightView({
        board: this.board,
        centerX: this.board.layout.centerX,
        centerY: this.board.layout.centerY,
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
      this.addChild(this.lastAction);
    }
    bindTurnManager(turnManager) {
      const bus = turnManager.getEventBus();
      this.unsubscribes.push(
        bus.on("action:execute", (event) => this.handleActionExecute(event)),
        bus.on("action:executed", (event) => this.handleActionExecuted(event)),
        bus.on("node:stateChanged", (event) => this.handleNodeStateChanged(event)),
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
    /** 底色与中央道场光晕（各视图画在其上）。 */
    renderSelf(ctx) {
      drawLandscape(ctx, this.width, this.height);
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.gold;
      ctx.font = `bold 18px ${THEME.font}`;
      ctx.fillText("归元弈", 18, this.safeTop + 13);
      this.drawDecisionGuide(ctx);
      ctx.restore();
    }
    placeResult() {
      if (this.lastAction === void 0) return;
      this.lastAction.resize(this.width - 20);
      this.lastAction.y = this.height - this.safeBottom - Math.max(58, this.actionBar.contentHeight) - 42;
    }
    /** One permanent legend; the readable last-action strip owns the remaining footer. */
    drawDecisionGuide(ctx) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.muted;
      ctx.font = `11px ${THEME.font}`;
      const y = this.board.layout.centerY + this.board.layout.outerRadius + this.board.layout.sealSize * 1.9 + 18;
      ctx.fillText("左阴 · 右阳", this.width / 2, y - 5);
      for (const [index, level] of [-1, 0, 1, 2].entries()) {
        const column = this.width * (index + 0.5) / 4;
        drawYinYangFish(ctx, column - 13, y + 13, 7, Polarity.YIN, level, WuXing.WOOD);
        drawYinYangFish(ctx, column - 13, y + 13, 7, Polarity.YANG, level, WuXing.WOOD);
        ctx.fillStyle = THEME.ivory;
        ctx.textAlign = "left";
        ctx.fillText(LEVEL_LABEL[level], column - 2, y + 13);
      }
      ctx.fillStyle = THEME.muted;
      ctx.textAlign = "center";
      ctx.fillText("木示例", this.width * 0.5 / 4 - 13, y - 5);
    }
  }
  function opponentOf(player) {
    return player === "P1" ? "P2" : "P1";
  }
  function resolveActionTarget(action, actionType, actor, turnManager) {
    const tianGan = turnManager.getCurrentTianGan();
    const element = action === null ? tianGan?.element ?? WuXing.WOOD : getActionTargetElement(action, tianGan?.element);
    const polarity = action?.polarity ?? (actionType === ActionType.BURST ? Polarity.YIN : tianGan?.polarity) ?? Polarity.YANG;
    const isAttack = isAttackAction(actionType);
    return { player: isAttack ? opponentOf(actor) : actor, element, polarity };
  }
  function resolveLoadedCharacterDimensions(image) {
    const valid = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
    if (valid(image.naturalWidth) && valid(image.naturalHeight)) {
      return { width: image.naturalWidth, height: image.naturalHeight, source: "natural" };
    }
    if (valid(image.width) && valid(image.height)) {
      return { width: image.width, height: image.height, source: "reported" };
    }
    return { ...CHARACTER_ATLAS_SIZE, source: "packaged" };
  }
  const pendingImages = /* @__PURE__ */ new Set();
  function errorReason(error, depth = 0) {
    if (typeof error === "string" && error.length > 0) return error;
    if (error === null || typeof error !== "object" || depth > 2) return "";
    const fields = error;
    const details = [fields.errMsg, fields.message, fields.type].filter(
      (value) => typeof value === "string" && value.length > 0
    );
    for (const nested of [fields.error, fields.detail, fields.cause]) {
      const reason = errorReason(nested, depth + 1);
      if (reason) details.push(reason);
    }
    return [...new Set(details)].join("；");
  }
  function loadWechatCharacterAtlas(host, setAtlas) {
    let phase = "reading";
    const diagnostic = (level, stage, path, error) => {
      console[level](`[Guiyuan] 人物图集${stage}`, {
        path,
        reason: errorReason(error) || "宿主未提供错误详情"
      });
    };
    const useDirect = (stage, path = CHARACTER_ATLAS_PATH, error) => {
      if (phase === "direct-loading" || phase === "done") return;
      if (stage) diagnostic("warn", stage, path, error);
      phase = "direct-loading";
      loadImage(CHARACTER_ATLAS_PATH, "direct-loading");
    };
    const loadImage = (path, expectedPhase) => {
      const failed = (error) => {
        if (phase !== expectedPhase) return;
        if (expectedPhase === "cache-loading") {
          useDirect("缓存解码失败，尝试包内路径", path, error);
        } else {
          phase = "done";
          setAtlas(null);
          diagnostic("error", "加载失败", path, error);
        }
      };
      let image;
      try {
        image = host.createImage();
      } catch (error) {
        failed(error);
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        pendingImages.delete(image);
        image.onload = null;
        image.onerror = null;
        return phase === expectedPhase;
      };
      const fail = (error) => {
        if (finish()) failed(error);
      };
      pendingImages.add(image);
      image.onload = () => {
        if (!finish()) return;
        phase = "done";
        const dimensions = resolveLoadedCharacterDimensions(image);
        if (dimensions.source === "packaged") {
          console.warn("[Guiyuan] 人物图集 onload 未提供有效尺寸，采用已打包资源尺寸", {
            path,
            width: image.width,
            height: image.height,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight
          });
        }
        setAtlas({
          image,
          width: dimensions.width,
          height: dimensions.height,
          frames: CHARACTER_ATLAS_FRAMES
        });
        console.log("[Guiyuan] 人物图集加载成功", { path, ...dimensions });
      };
      image.onerror = fail;
      console.log("[Guiyuan] 开始加载人物图集", path);
      try {
        image.src = path;
      } catch (error) {
        fail(error);
      }
    };
    const directory = host.env?.USER_DATA_PATH;
    if (typeof host.getFileSystemManager !== "function" || !directory) {
      useDirect();
      return;
    }
    const cachedPath = `${directory.replace(/\/$/, "")}/guiyuan-characters.png`;
    try {
      const fs = host.getFileSystemManager();
      console.log("[Guiyuan] 开始准备人物图集缓存", CHARACTER_ATLAS_PATH);
      fs.readFile({
        filePath: CHARACTER_ATLAS_PATH,
        fail: (error) => {
          if (phase === "reading")
            useDirect("文件读取失败，尝试包内路径", CHARACTER_ATLAS_PATH, error);
        },
        success: ({ data }) => {
          if (phase !== "reading") return;
          try {
            if (typeof data === "string" || !data || typeof data.byteLength !== "number") {
              useDirect(
                "文件格式无效，尝试包内路径",
                CHARACTER_ATLAS_PATH,
                "读取结果不是二进制 ArrayBuffer"
              );
              return;
            }
            const bytes = new Uint8Array(data);
            const magic = Array.from(bytes.subarray(0, 8)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
            console.log("[Guiyuan] 人物图集文件读取成功", {
              path: CHARACTER_ATLAS_PATH,
              bytes: bytes.byteLength,
              magic
            });
            if (bytes.byteLength < 33 || magic !== "89504e470d0a1a0a") {
              useDirect(
                "文件格式无效，尝试包内路径",
                CHARACTER_ATLAS_PATH,
                "PNG 签名或最小长度检查未通过"
              );
              return;
            }
            phase = "writing";
            fs.writeFile({
              filePath: cachedPath,
              data,
              fail: (error) => {
                if (phase === "writing") useDirect("缓存写入失败，尝试包内路径", cachedPath, error);
              },
              success: () => {
                if (phase !== "writing") return;
                phase = "cache-loading";
                console.log("[Guiyuan] 人物图集缓存写入成功", { path: cachedPath });
                loadImage(cachedPath, "cache-loading");
              }
            });
          } catch (error) {
            if (phase === "reading" || phase === "writing")
              useDirect("缓存准备失败，尝试包内路径", CHARACTER_ATLAS_PATH, error);
          }
        }
      });
    } catch (error) {
      if (phase === "reading") useDirect("文件读取失败，尝试包内路径", CHARACTER_ATLAS_PATH, error);
    }
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
    let safeTop = sysInfo.safeArea ? sysInfo.safeArea.top : sysInfo.statusBarHeight || 20;
    try {
      const menu = wx.getMenuButtonBoundingClientRect?.();
      if (menu !== void 0 && Number.isFinite(menu.bottom) && menu.bottom > 0 && menu.bottom < windowHeight / 2)
        safeTop = Math.max(safeTop, menu.bottom + 8);
    } catch {
    }
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
    loadWechatCharacterAtlas(wx, (atlas) => scene.characters.setSpriteAtlas(atlas));
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
