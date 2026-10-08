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
  var ActionType = /* @__PURE__ */ ((ActionType2) => {
    ActionType2["AUTO"] = "AUTO";
    ActionType2["CONVERT"] = "CONVERT";
    ActionType2["TRANS"] = "TRANS";
    ActionType2["ATK"] = "ATK";
    ActionType2["BURST"] = "BURST";
    ActionType2["BURST_ATK"] = "BURST_ATK";
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
  function createInitialPlayer(id) {
    return {
      id,
      score: 0,
      board: createEmptyBoard()
    };
  }
  function createInitialGameState(maxRounds = 60) {
    return {
      round: 1,
      maxRounds,
      currentPlayer: "P1",
      players: {
        P1: createInitialPlayer("P1"),
        P2: createInitialPlayer("P2")
      },
      currentTianGan: null,
      isGameOver: false,
      winner: null,
      endReason: null
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
  function clampNodeLevel(level) {
    if (level <= -1) return -1;
    if (level >= 2) return 2;
    return level;
  }
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
    // 稀有度乘数
    RARITY_MULTIPLIER: 1.5,
    // 稀有度黑名单（严禁享受稀有度加成的动作类型）
    NO_RARITY_ACTIONS: [ActionType.BURST, ActionType.BURST_ATK]
  };
  const ACTION_PROBABILITY = {
    [ActionType.AUTO]: 1,
    [ActionType.ATK]: 0.518,
    [ActionType.TRANS]: 0.243,
    [ActionType.CONVERT]: 0.167,
    [ActionType.BURST]: 0.035,
    [ActionType.BURST_ATK]: 0.036
  };
  class ScoreCalculator {
    constructor(config = POINTS_CONFIG) {
      __publicField(this, "config");
      this.config = config;
    }
    /**
     * 计算指定动作的行为基础分
     */
    calculateActionPoints(actionType) {
      return this.config.ACTION[actionType] ?? 0;
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
    /**
     * 判断动作是否命中稀有度黑名单
     */
    isNoRarityAction(actionType) {
      return this.config.NO_RARITY_ACTIONS.includes(actionType);
    }
    /**
     * 应用稀有度加成：命中黑名单动作直接返回原分值
     */
    applyRarityBonus(score, actionType, multiplier = this.config.RARITY_MULTIPLIER) {
      if (score === 0) return 0;
      if (this.isNoRarityAction(actionType)) {
        return score;
      }
      const probability = ACTION_PROBABILITY[actionType] ?? 0.5;
      const rarityBonus = score * (1 - probability) * multiplier;
      return Math.round(score + rarityBonus);
    }
  }
  class ActionResolver {
    constructor(scoreCalculator = new ScoreCalculator()) {
      __publicField(this, "scoreCalculator");
      this.scoreCalculator = scoreCalculator;
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
            scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, polarity, false);
            success = true;
          }
          break;
        }
        case ActionType.CONVERT: {
          const element = payload.element || state.currentTianGan?.element;
          if (!element) {
            return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message: "缺少指定元素" };
          }
          scoreDelta += this.scoreCalculator.calculateActionPoints(ActionType.CONVERT);
          const targetPolarity = payload.polarity || (state.currentTianGan?.polarity === Polarity.YANG ? Polarity.YIN : Polarity.YANG);
          const node = nextActiveBoard[element];
          const prevLevel = node[targetPolarity];
          if (prevLevel < 2) {
            const newLevel = clampNodeLevel(prevLevel + 1);
            patchActiveNode(element, { [targetPolarity]: newLevel });
            scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, targetPolarity, false);
          }
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
            scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, polarity, false);
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
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, polarity, true);
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
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, targetPolarity, false);
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
          scoreDelta += this.scoreCalculator.calculateTransitionPoints(prevLevel, newLevel, targetPolarity, true);
          extraTurn = true;
          success = true;
          break;
        }
      }
      if (!success) {
        return { nextState: state, success: false, scoreDelta: 0, extraTurn: false, message };
      }
      const nextScore = activePlayer.score + scoreDelta;
      const hasGuiYuan = isBoardGuiYuan(nextActiveBoard);
      let isGameOver = false;
      let winner = null;
      let endReason = null;
      if (hasGuiYuan) {
        isGameOver = true;
        winner = activePlayerId;
        endReason = "GUI_YUAN";
      } else if (!extraTurn && state.round >= state.maxRounds) {
        isGameOver = true;
        endReason = "MAX_ROUNDS";
        if (nextScore > opponentPlayer.score) {
          winner = activePlayerId;
        } else if (opponentPlayer.score > nextScore) {
          winner = opponentPlayerId;
        } else {
          winner = "P2";
        }
      }
      const nextRound = !extraTurn && !isGameOver ? state.round + 1 : state.round;
      const nextCurrentPlayer = !extraTurn && !isGameOver ? opponentPlayerId : activePlayerId;
      const nextState = {
        ...state,
        round: nextRound,
        currentPlayer: nextCurrentPlayer,
        players: {
          ...state.players,
          [activePlayerId]: {
            ...activePlayer,
            score: nextScore,
            board: nextActiveBoard
          },
          [opponentPlayerId]: {
            ...opponentPlayer,
            board: nextOpponentBoard
          }
        },
        isGameOver,
        winner,
        endReason
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
    const actions = [];
    if (stemLevel <= 0) {
      actions.push({
        actionType: ActionType.AUTO,
        player: playerId,
        element: stemElement,
        polarity: stemPolarity
      });
    }
    if (stemLevel >= 1) {
      const oppositePolarity = stemPolarity === Polarity.YANG ? Polarity.YIN : Polarity.YANG;
      if (stemNode[oppositePolarity] < 2) {
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
    if (!options?.isExtraTurn) {
      const wuxingList = Object.keys(playerBoard);
      for (const element of wuxingList) {
        const node = playerBoard[element];
        if (isNodeGuiYi(node)) {
          const shengEl = GENERATION_CYCLE[element];
          const shengTargetPolarity = getPlusTargetPolarity(playerBoard[shengEl]);
          if (shengTargetPolarity !== null) {
            actions.push({
              actionType: ActionType.BURST,
              player: playerId,
              sourceElement: element,
              consumePolarity: Polarity.YIN,
              polarity: shengTargetPolarity
            });
          }
          const keEl = OVERCOMING_CYCLE[element];
          const keTargetPolarity = getMinusTargetPolarity(opponentBoard[keEl]);
          if (keTargetPolarity !== null) {
            actions.push({
              actionType: ActionType.BURST_ATK,
              player: playerId,
              sourceElement: element,
              consumePolarity: Polarity.YANG,
              polarity: keTargetPolarity
            });
          }
        }
      }
    }
    if (actions.length === 0) {
      actions.push({
        actionType: ActionType.AUTO,
        player: playerId,
        element: stemElement,
        polarity: stemPolarity
      });
    }
    return actions;
  }
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
          message: "对局已结束"
        };
      }
      if (this.phase === "START_TURN" || this.phase === "END_TURN") {
        this.startTurn();
      }
      const actionToExecute = action ?? this.candidateActions[0];
      if (!actionToExecute) {
        return {
          nextState: this.state,
          success: false,
          scoreDelta: 0,
          extraTurn: false,
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
          message: "对局已结束"
        };
      }
      if (this.phase === "START_TURN" || this.phase === "END_TURN") {
        this.startTurn();
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
      if (action.targetElement !== void 0 && candidate.targetElement !== action.targetElement) {
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
    evaluate(state, tianGan, action, weights = DEFAULT_STRATEGY_WEIGHTS) {
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
      const scoreDeltaPoints = result.scoreDelta * scoreWeight;
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
    evaluateAll(state, tianGan, actions, weights = DEFAULT_STRATEGY_WEIGHTS) {
      return actions.map((action) => this.evaluate(state, tianGan, action, weights));
    }
  }
  const BALANCED_WEIGHTS = {
    repairDamage: 260,
    reachGuiYi: 240,
    lightVoid: 100,
    reachKangJi: 50,
    guiyuanProgress: 140,
    burstExtraTurn: 100,
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
      const scored = evaluator.evaluateAll(state, tianGan, actions, mergedWeights);
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
  createStrategy(BALANCED_WEIGHTS);
  createStrategy(RUSH_GUIYUAN_WEIGHTS);
  createStrategy(AGGRESSIVE_WEIGHTS);
  createStrategy(DEFENSIVE_WEIGHTS);
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
  function drawWuXingSeal(ctx, x, y, radius, element, yinLevel, yangLevel, isGuiYi, animTick) {
    const cfg = WUXING_PALETTE[element];
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    const drawHalfArc = (isLeft, level) => {
      ctx.save();
      ctx.beginPath();
      const startAngle = isLeft ? Math.PI * 0.5 : -Math.PI * 0.5;
      const endAngle = isLeft ? Math.PI * 1.5 : Math.PI * 0.5;
      ctx.arc(x, y, radius - 2, startAngle, endAngle);
      if (level === -1) {
        ctx.strokeStyle = "#742a2a";
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (level === 0) {
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (level === 1) {
        ctx.strokeStyle = cfg.main;
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (level === 2) {
        ctx.strokeStyle = "#f6e05e";
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      ctx.restore();
    };
    drawHalfArc(true, yinLevel);
    drawHalfArc(false, yangLevel);
    if (isGuiYi) {
      ctx.save();
      const rot = animTick * 0.05;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.strokeStyle = "#ecc94b";
      ctx.lineWidth = 2;
      ctx.strokeRect(-radius * 0.4, -radius * 0.4, radius * 0.8, radius * 0.8);
      ctx.restore();
    }
    ctx.fillStyle = cfg.light;
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cfg.name, x, y);
    ctx.font = "8px monospace";
    ctx.fillStyle = yinLevel > 0 ? "#9ae6b4" : yinLevel === -1 ? "#feb2b2" : "#6b7280";
    ctx.fillText("阴", x - radius - 5, y);
    ctx.fillStyle = yangLevel > 0 ? "#9ae6b4" : yangLevel === -1 ? "#feb2b2" : "#6b7280";
    ctx.fillText("阳", x + radius + 5, y);
  }
  function drawTouchButton(ctx, btn, isSelected) {
    const borderColor = btn.isBurst ? "#f6e05e" : "#4b5563";
    const bgColor = "#1a202c";
    drawPixelBox(ctx, btn.x, btn.y, btn.width, btn.height, bgColor, borderColor, 2);
    ctx.fillStyle = btn.color;
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + 20);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px monospace";
    ctx.fillText(btn.subLabel, btn.x + btn.width / 2, btn.y + 36);
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
      drawPixelBox(ctx, centerX - boxSize / 2, boxY - boxSize / 2, boxSize, boxSize, "#171e2e", elemCfg.main, 2);
      drawPixelRect(ctx, centerX - boxSize / 2 + 4, boxY - boxSize / 2 + 4, boxSize - 8, 2, elemCfg.light);
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
  function drawFlyingEnergy(ctx, flyer) {
    ctx.save();
    const { currentX, currentY, color, lightColor, mode, trail } = flyer;
    if (mode === "pixel") {
      trail.forEach((t) => {
        ctx.globalAlpha = Math.max(0, t.alpha);
        const s = t.size || 3;
        drawPixelRect(ctx, t.x - s / 2, t.y - s / 2, s, s, color);
      });
      ctx.globalAlpha = 1;
      const cx = Math.floor(currentX);
      const cy = Math.floor(currentY);
      drawPixelRect(ctx, cx - 4, cy - 2, 8, 4, color);
      drawPixelRect(ctx, cx - 2, cy - 4, 4, 8, color);
      drawPixelRect(ctx, cx - 2, cy - 2, 4, 4, lightColor);
      drawPixelRect(ctx, cx - 1, cy - 1, 2, 2, "#ffffff");
    } else {
      if (trail.length > 1) {
        for (let i = 0; i < trail.length - 1; i++) {
          const p1 = trail[i];
          const p2 = trail[i + 1];
          const progressRatio = i / trail.length;
          const lineWidth = 2 + progressRatio * 7;
          ctx.strokeStyle = color;
          ctx.globalAlpha = p1.alpha * 0.7;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      const grad = ctx.createRadialGradient(currentX, currentY, 2, currentX, currentY, 14);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.4, lightColor);
      grad.addColorStop(0.8, color + "88");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(currentX, currentY, 14, 0, Math.PI * 2);
      ctx.fill();
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
  function drawModeToggleBar(ctx, x, y, w, h, mode) {
    const isPixel = mode === "pixel";
    const borderColor = isPixel ? "#f6e05e" : "#4fd1c5";
    const activeColor = isPixel ? "#f6e05e" : "#38b2ac";
    drawPixelBox(ctx, x, y, w, h, "#1a202c", borderColor, 2);
    ctx.fillStyle = "#a0aec0";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("动效对比: ", x + 12, y + h / 2);
    ctx.fillStyle = activeColor;
    ctx.font = "bold 12px monospace";
    const label = isPixel ? "【 方案 A: 16-bit 像素粒子轨 】" : "【 方案 B: 柔光气劲流线轨 】";
    ctx.fillText(label, x + 72, y + h / 2);
    ctx.fillStyle = "#63b3ed";
    ctx.textAlign = "right";
    ctx.font = "10px monospace";
    ctx.fillText("⇄ 点此切换", x + w - 12, y + h / 2);
  }
  const ELEMENTS_ORDER = [
    WuXing.WOOD,
    WuXing.FIRE,
    WuXing.EARTH,
    WuXing.METAL,
    WuXing.WATER
  ];
  class GameManager {
    constructor(seed = Date.now()) {
      __publicField(this, "turnManager");
      __publicField(this, "aiStrategy", createStrategy(BALANCED_WEIGHTS));
      __publicField(this, "currentTianGan", null);
      __publicField(this, "availableButtons", []);
      // 动效与方案对比
      __publicField(this, "animMode", "pixel");
      __publicField(this, "flyingProjectiles", []);
      __publicField(this, "impactEffects", []);
      __publicField(this, "isAnimating", false);
      // 画面尺寸与状态
      __publicField(this, "width", 375);
      __publicField(this, "height", 667);
      __publicField(this, "pixelRatio", 2);
      __publicField(this, "animTick", 0);
      __publicField(this, "screenShake", 0);
      // 角色状态
      __publicField(this, "p1State", "idle");
      __publicField(this, "p2State", "idle");
      __publicField(this, "p1ActionTimer", 0);
      __publicField(this, "p2ActionTimer", 0);
      // 战斗播报
      __publicField(this, "bannerText", "对局开始 · 双方对峙");
      __publicField(this, "bannerSubText", "追求五行归元，调和阴阳");
      // AI 思考调度
      __publicField(this, "aiThinkingTimer", 0);
      __publicField(this, "safeTop", 44);
      __publicField(this, "safeBottom", 16);
      const prng = createPRNG(seed);
      this.turnManager = new TurnManager({ prng });
      this.startNewTurn();
    }
    resize(width, height, pixelRatio, safeTop = 44, safeBottom = 16) {
      this.width = width;
      this.height = height;
      this.pixelRatio = pixelRatio;
      this.safeTop = Math.max(safeTop, 24);
      this.safeBottom = Math.max(safeBottom, 12);
      this.updateButtons();
    }
    /** 开始新回合 */
    startNewTurn() {
      this.turnManager.startTurn();
      this.currentTianGan = this.turnManager.getCurrentTianGan();
      const state = this.turnManager.getState();
      if (state.isGameOver) {
        this.bannerText = state.winner === "P1" ? "★ 五行归元 ★ 玩家大胜！" : "天道通玄 · 遗憾惜败！";
        this.bannerSubText = state.endReason ?? "对局结束";
        this.availableButtons = [];
        return;
      }
      const currentPlayer = state.currentPlayer;
      const tg = this.currentTianGan;
      const isExtra = this.turnManager.isExtraTurnActive();
      if (currentPlayer === "P1") {
        this.bannerText = isExtra ? "【连动回合】玩家额外行动！" : `玩家回合 · 天干【${tg?.name ?? ""}】降临`;
        this.bannerSubText = `属性: ${tg?.element ?? ""} (${tg?.polarity === Polarity.YANG ? "阳" : "阴"})`;
        this.updateButtons();
      } else {
        this.bannerText = isExtra ? "【连动回合】天道施展额外行动！" : `天道回合 · 天干【${tg?.name ?? ""}】降临`;
        this.bannerSubText = "天道推演生克中...";
        this.availableButtons = [];
        this.aiThinkingTimer = 55;
      }
    }
    /** 将合法动作映射为触摸按钮 */
    updateButtons() {
      const actions = this.turnManager.getAvailableActions();
      const state = this.turnManager.getState();
      if (state.isGameOver || state.currentPlayer !== "P1") {
        this.availableButtons = [];
        return;
      }
      const effectiveTop = this.safeTop + 8;
      const effectiveBottom = this.height - this.safeBottom;
      const playableHeight = effectiveBottom - effectiveTop;
      const topBarH = 38;
      const consoleY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.58);
      const startY = consoleY + 36;
      const count = actions.length;
      const buttons = [];
      const containerW = this.width - 56;
      actions.forEach((act, idx) => {
        let label = "";
        let sub = "";
        let color = "#63b3ed";
        let isBurst = false;
        const elem = act.element ?? act.targetElement ?? act.sourceElement ?? WuXing.WOOD;
        const elemName = WUXING_PALETTE[elem]?.name ?? "";
        switch (act.actionType) {
          case ActionType.AUTO:
            label = "【吸纳】";
            sub = `${elemName}(${act.polarity === Polarity.YANG ? "阳" : "阴"})+1`;
            color = "#68d391";
            break;
          case ActionType.CONVERT:
            label = "【调息】";
            sub = `转同属${act.polarity === Polarity.YANG ? "阳" : "阴"}`;
            color = "#63b3ed";
            break;
          case ActionType.TRANS:
            label = "【化】";
            sub = `生${elemName}(阴)+1`;
            color = "#4fd1c5";
            break;
          case ActionType.ATK:
            label = "【破】";
            sub = `克敌${elemName}(阳)-1`;
            color = "#fc8181";
            break;
          case ActionType.BURST:
            label = "【强化】";
            sub = `生${elemName}+2·再动`;
            color = "#f6e05e";
            isBurst = true;
            break;
          case ActionType.BURST_ATK:
            label = "【强破】";
            sub = `克敌${elemName}-2·再动`;
            color = "#f56565";
            isBurst = true;
            break;
        }
        let btnX = 0;
        let btnY = 0;
        let btnW = 0;
        let btnH = 50;
        if (count <= 2) {
          btnW = Math.floor((containerW - (count - 1) * 12) / count);
          btnX = 28 + idx * (btnW + 12);
          btnY = startY + 10;
          btnH = 56;
        } else if (count === 3) {
          btnW = Math.floor((containerW - 16) / 3);
          btnX = 28 + idx * (btnW + 8);
          btnY = startY + 10;
          btnH = 54;
        } else {
          const cols = 2;
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          btnW = Math.floor((containerW - 12) / cols);
          btnX = 28 + col * (btnW + 12);
          btnY = startY + row * (btnH + 10);
        }
        buttons.push({
          id: `btn_${idx}`,
          label,
          subLabel: sub,
          action: act,
          x: btnX,
          y: btnY,
          width: btnW,
          height: btnH,
          color,
          isBurst
        });
      });
      this.availableButtons = buttons;
    }
    /** 获取道场中心高度 */
    getArenaY() {
      const effectiveTop = this.safeTop + 8;
      const effectiveBottom = this.height - this.safeBottom;
      const playableHeight = effectiveBottom - effectiveTop;
      const topBarH = 38;
      return effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.26);
    }
    /** 获取五行节点的屏幕坐标 */
    getSealPosition(isP1, elem) {
      const arenaY = this.getArenaY();
      const p1X = 55;
      const p2X = this.width - 55;
      const baseX = isP1 ? p1X + 48 : p2X - 48;
      const arcOffsets = [
        { dy: -56, dx: 0 },
        { dy: -28, dx: isP1 ? 16 : -16 },
        { dy: 0, dx: isP1 ? 24 : -24 },
        { dy: 28, dx: isP1 ? 16 : -16 },
        { dy: 56, dx: 0 }
      ];
      const idx = ELEMENTS_ORDER.indexOf(elem);
      const pos = idx >= 0 ? arcOffsets[idx] : { dx: 0, dy: 0 };
      return { x: baseX + pos.dx, y: arenaY + pos.dy };
    }
    /** 获取中央天元区坐标 */
    getCenterPosition() {
      return { x: this.width / 2, y: this.getArenaY() };
    }
    /** 随时触发测试天干吸收动效（供对比体验） */
    triggerPreviewAbsorption() {
      if (!this.currentTianGan || this.isAnimating) return;
      const tg = this.currentTianGan;
      const elemCfg = WUXING_PALETTE[tg.element] ?? WUXING_PALETTE[WuXing.WOOD];
      const start = this.getCenterPosition();
      const target = this.getSealPosition(true, tg.element);
      this.isAnimating = true;
      this.flyingProjectiles.push({
        startX: start.x,
        startY: start.y,
        currentX: start.x,
        currentY: start.y,
        targetX: target.x,
        targetY: target.y,
        progress: 0,
        duration: 22,
        frame: 0,
        color: elemCfg.main,
        lightColor: elemCfg.light,
        mode: this.animMode,
        trail: [],
        onComplete: () => {
          this.impactEffects.push({
            x: target.x,
            y: target.y,
            radius: 4,
            maxRadius: 28,
            color: elemCfg.main,
            lightColor: elemCfg.light,
            alpha: 1,
            life: 16,
            maxLife: 16,
            mode: this.animMode
          });
          this.isAnimating = false;
        }
      });
    }
    /** 执行触摸输入 */
    handleTouch(touchX, touchY) {
      const state = this.turnManager.getState();
      if (state.isGameOver) {
        const prng = createPRNG(Date.now());
        this.turnManager = new TurnManager({ prng });
        this.startNewTurn();
        return;
      }
      const effectiveTop = this.safeTop + 8;
      const topBarH = 38;
      const toggleY = effectiveTop + topBarH + 6;
      const toggleH = 26;
      if (touchX >= 16 && touchX <= this.width - 16 && touchY >= toggleY && touchY <= toggleY + toggleH) {
        this.animMode = this.animMode === "pixel" ? "flow" : "pixel";
        return;
      }
      const centerPos = this.getCenterPosition();
      const distSq = (touchX - centerPos.x) ** 2 + (touchY - centerPos.y) ** 2;
      if (distSq <= 30 * 30 && !this.isAnimating) {
        this.triggerPreviewAbsorption();
        return;
      }
      if (this.isAnimating) return;
      if (state.currentPlayer !== "P1") return;
      for (const btn of this.availableButtons) {
        if (touchX >= btn.x && touchX <= btn.x + btn.width && touchY >= btn.y && touchY <= btn.y + btn.height) {
          this.executePlayerAction(btn.action);
          break;
        }
      }
    }
    executePlayerAction(action) {
      const targetElem = action.element ?? action.targetElement ?? action.sourceElement ?? this.currentTianGan?.element ?? WuXing.WOOD;
      const elemCfg = WUXING_PALETTE[targetElem] ?? WUXING_PALETTE[WuXing.WOOD];
      this.p1State = action.actionType === ActionType.ATK || action.actionType === ActionType.BURST_ATK ? "attack" : "cast";
      this.p1ActionTimer = 30;
      let startPos = this.getCenterPosition();
      let targetPos = this.getSealPosition(true, targetElem);
      if (action.actionType === ActionType.ATK || action.actionType === ActionType.BURST_ATK) {
        this.p2State = "hurt";
        this.p2ActionTimer = 25;
        this.screenShake = action.actionType === ActionType.BURST_ATK ? 8 : 4;
        const srcElem = action.sourceElement ?? targetElem;
        startPos = this.getSealPosition(true, srcElem);
        targetPos = this.getSealPosition(false, targetElem);
      }
      this.isAnimating = true;
      this.flyingProjectiles.push({
        startX: startPos.x,
        startY: startPos.y,
        currentX: startPos.x,
        currentY: startPos.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        progress: 0,
        duration: 22,
        frame: 0,
        color: elemCfg.main,
        lightColor: elemCfg.light,
        mode: this.animMode,
        trail: [],
        onComplete: () => {
          this.impactEffects.push({
            x: targetPos.x,
            y: targetPos.y,
            radius: 4,
            maxRadius: 28,
            color: elemCfg.main,
            lightColor: elemCfg.light,
            alpha: 1,
            life: 16,
            maxLife: 16,
            mode: this.animMode
          });
          this.turnManager.executeAction(action);
          this.isAnimating = false;
          this.startNewTurn();
        }
      });
    }
    /** 帧更新 (逻辑时钟) */
    update() {
      this.animTick++;
      if (this.screenShake > 0) this.screenShake--;
      if (this.p1ActionTimer > 0) {
        this.p1ActionTimer--;
        if (this.p1ActionTimer === 0) this.p1State = "idle";
      }
      if (this.p2ActionTimer > 0) {
        this.p2ActionTimer--;
        if (this.p2ActionTimer === 0) this.p2State = "idle";
      }
      for (let i = this.flyingProjectiles.length - 1; i >= 0; i--) {
        const p = this.flyingProjectiles[i];
        p.frame++;
        const t = Math.min(1, p.frame / p.duration);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        p.progress = ease;
        const heightOffset = -Math.sin(t * Math.PI) * 35;
        p.currentX = p.startX + (p.targetX - p.startX) * ease;
        p.currentY = p.startY + (p.targetY - p.startY) * ease + heightOffset;
        p.trail.unshift({
          x: p.currentX,
          y: p.currentY,
          alpha: 0.9,
          size: p.mode === "pixel" ? Math.random() > 0.5 ? 4 : 2 : 6
        });
        if (p.trail.length > 8) p.trail.pop();
        p.trail.forEach((tr) => tr.alpha *= 0.8);
        if (p.frame >= p.duration) {
          const onComplete = p.onComplete;
          this.flyingProjectiles.splice(i, 1);
          if (onComplete) onComplete();
        }
      }
      for (let i = this.impactEffects.length - 1; i >= 0; i--) {
        const eff = this.impactEffects[i];
        eff.life--;
        const progress = 1 - eff.life / eff.maxLife;
        eff.radius = 4 + progress * (eff.maxRadius - 4);
        eff.alpha = 1 - progress;
        if (eff.life <= 0) {
          this.impactEffects.splice(i, 1);
        }
      }
      const state = this.turnManager.getState();
      if (!state.isGameOver && state.currentPlayer === "P2" && !this.isAnimating) {
        if (this.aiThinkingTimer > 0) {
          this.aiThinkingTimer--;
          if (this.aiThinkingTimer === 0) {
            this.executeAIAction();
          }
        }
      }
    }
    executeAIAction() {
      const state = this.turnManager.getState();
      const tg = this.turnManager.getCurrentTianGan();
      const available = this.turnManager.getAvailableActions();
      const action = this.aiStrategy(state, tg, available);
      const targetElem = action.element ?? action.targetElement ?? action.sourceElement ?? tg.element ?? WuXing.WOOD;
      const elemCfg = WUXING_PALETTE[targetElem] ?? WUXING_PALETTE[WuXing.WOOD];
      this.p2State = action.actionType === ActionType.ATK || action.actionType === ActionType.BURST_ATK ? "attack" : "cast";
      this.p2ActionTimer = 30;
      let startPos = this.getCenterPosition();
      let targetPos = this.getSealPosition(false, targetElem);
      if (action.actionType === ActionType.ATK || action.actionType === ActionType.BURST_ATK) {
        this.p1State = "hurt";
        this.p1ActionTimer = 25;
        this.screenShake = action.actionType === ActionType.BURST_ATK ? 8 : 4;
        const srcElem = action.sourceElement ?? targetElem;
        startPos = this.getSealPosition(false, srcElem);
        targetPos = this.getSealPosition(true, targetElem);
      }
      this.isAnimating = true;
      this.flyingProjectiles.push({
        startX: startPos.x,
        startY: startPos.y,
        currentX: startPos.x,
        currentY: startPos.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        progress: 0,
        duration: 22,
        frame: 0,
        color: elemCfg.main,
        lightColor: elemCfg.light,
        mode: this.animMode,
        trail: [],
        onComplete: () => {
          this.impactEffects.push({
            x: targetPos.x,
            y: targetPos.y,
            radius: 4,
            maxRadius: 28,
            color: elemCfg.main,
            lightColor: elemCfg.light,
            alpha: 1,
            life: 16,
            maxLife: 16,
            mode: this.animMode
          });
          this.turnManager.executeAction(action);
          this.isAnimating = false;
          this.startNewTurn();
        }
      });
    }
    /** 渲染主循环 */
    render(ctx) {
      ctx.save();
      if (this.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * this.screenShake * 2;
        const shakeY = (Math.random() - 0.5) * this.screenShake * 2;
        ctx.translate(shakeX, shakeY);
      }
      drawPixelRect(ctx, 0, 0, this.width, this.height, "#0a0d14");
      const effectiveTop = this.safeTop + 8;
      const effectiveBottom = this.height - this.safeBottom;
      const playableHeight = effectiveBottom - effectiveTop;
      const topBarH = 38;
      const state = this.turnManager.getState();
      drawPixelBox(ctx, 16, effectiveTop, this.width - 32, topBarH, "#111827", "#374151", 2);
      ctx.fillStyle = "#f6e05e";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`回合: ${state.round}/60`, 28, effectiveTop + 24);
      ctx.fillStyle = "#63b3ed";
      ctx.fillText(`玩家(P1): ${state.players.P1.score}分`, 130, effectiveTop + 24);
      ctx.fillStyle = "#b794f4";
      ctx.textAlign = "right";
      ctx.fillText(`天道(P2): ${state.players.P2.score}分`, this.width - 28, effectiveTop + 24);
      drawModeToggleBar(
        ctx,
        16,
        effectiveTop + topBarH + 6,
        this.width - 32,
        26,
        this.animMode
      );
      const arenaY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.26);
      const p1X = 55;
      const p2X = this.width - 55;
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.ellipse(p1X, arenaY + 45, 36, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p2X, arenaY + 45, 36, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      drawPixelCharacter(ctx, p1X, arenaY, true, this.p1State, this.animTick);
      drawPixelCharacter(ctx, p2X, arenaY, false, this.p2State, this.animTick);
      this.renderSeals(ctx, p1X + 48, arenaY, true, state.players.P1.board);
      this.renderSeals(ctx, p2X - 48, arenaY, false, state.players.P2.board);
      if (this.currentTianGan) {
        drawCenterTianGanRune(
          ctx,
          this.width / 2,
          arenaY,
          this.currentTianGan,
          this.animMode,
          this.animTick
        );
      }
      for (const flyer of this.flyingProjectiles) {
        drawFlyingEnergy(ctx, flyer);
      }
      for (const impact of this.impactEffects) {
        drawImpactEffect(ctx, impact);
      }
      const bannerY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.44);
      const bannerH = 64;
      drawPixelBox(ctx, 16, bannerY, this.width - 32, bannerH, "#171e2e", "#4b5563", 2);
      ctx.fillStyle = "#f7fafc";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(this.bannerText, this.width / 2, bannerY + 24);
      ctx.fillStyle = "#a0aec0";
      ctx.font = "11px monospace";
      ctx.fillText(this.bannerSubText, this.width / 2, bannerY + 46);
      const consoleY = effectiveTop + topBarH + Math.floor((playableHeight - topBarH) * 0.58);
      const consoleH = effectiveBottom - consoleY - 8;
      drawPixelBox(ctx, 14, consoleY, this.width - 28, consoleH, "#111827", "#374151", 2);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "left";
      ctx.fillText("【 战术决策 】", 28, consoleY + 22);
      for (const btn of this.availableButtons) {
        drawTouchButton(ctx, btn);
      }
      if (state.currentPlayer === "P2" && !state.isGameOver) {
        ctx.fillStyle = "#b794f4";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("● 天道推演决策中...", this.width / 2, consoleY + 68);
        ctx.fillStyle = "#718096";
        ctx.font = "11px monospace";
        ctx.fillText("正在权衡五行生克与阴阳两仪", this.width / 2, consoleY + 92);
      }
      if (state.isGameOver) {
        ctx.fillStyle = "#f6e05e";
        ctx.font = "bold 15px monospace";
        ctx.textAlign = "center";
        ctx.fillText(state.winner === "P1" ? "★ 恭喜！五行圆满大获全胜 ★" : "天道终局 · 比分结算完毕", this.width / 2, consoleY + 68);
        ctx.fillStyle = "#63b3ed";
        ctx.font = "12px monospace";
        ctx.fillText("【 点击屏幕任意区域 重新开局 】", this.width / 2, consoleY + 95);
      }
      ctx.restore();
    }
    /** 绘制一侧角色的五行护体灵核 */
    renderSeals(ctx, baseX, baseY, isLeft, board) {
      const radius = 15;
      const arcOffsets = [
        { dy: -56, dx: 0 },
        { dy: -28, dx: isLeft ? 16 : -16 },
        { dy: 0, dx: isLeft ? 24 : -24 },
        { dy: 28, dx: isLeft ? 16 : -16 },
        { dy: 56, dx: 0 }
      ];
      ELEMENTS_ORDER.forEach((elem, idx) => {
        const node = board[elem];
        const pos = arcOffsets[idx];
        const x = baseX + pos.dx;
        const y = baseY + pos.dy;
        const isGuiYi = node.yin >= 1 && node.yang >= 1;
        drawWuXingSeal(
          ctx,
          x,
          y,
          radius,
          elem,
          node.yin,
          node.yang,
          isGuiYi,
          this.animTick
        );
      });
    }
  }
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
    const game = new GameManager();
    game.resize(windowWidth, windowHeight, pixelRatio, safeTop, safeBottom);
    console.log("[Guiyuan] 左右对抗像素风对局初始化成功！");
    wx.onTouchStart((e) => {
      if (e.touches && e.touches.length > 0) {
        const touch = e.touches[0];
        game.handleTouch(touch.clientX, touch.clientY);
      }
    });
    function loop() {
      game.update();
      game.render(ctx);
      if (typeof requestAnimationFrame !== "undefined") {
        requestAnimationFrame(loop);
      }
    }
    loop();
  }
  initMiniGame();
  exports.initMiniGame = initMiniGame;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  return exports;
})({});
