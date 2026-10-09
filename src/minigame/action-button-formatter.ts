import {
  ActionPayload,
  ActionType,
  GENERATION_CYCLE,
  OVERCOMING_CYCLE,
  Polarity,
  WuXing
} from '../core/types/domain.js';
import { WUXING_PALETTE } from './pixel-art.js';

export interface FormattedActionButton {
  label: string;
  subLabel: string;
  color: string;
  isBurst: boolean;
}

/**
 * 解析动作的目标元素
 * @param act 动作载荷
 * @param fallbackElement 可选的回退元素（默认木）
 */
export function getActionTargetElement(act: ActionPayload, fallbackElement?: WuXing): WuXing {
  const srcElem = act.sourceElement ?? act.element ?? fallbackElement ?? WuXing.WOOD;
  if (act.actionType === ActionType.TRANS || act.actionType === ActionType.BURST) {
    return act.targetElement ?? GENERATION_CYCLE[srcElem];
  }
  if (act.actionType === ActionType.ATK || act.actionType === ActionType.BURST_ATK) {
    return act.targetElement ?? OVERCOMING_CYCLE[srcElem];
  }
  return act.targetElement ?? act.element ?? srcElem;
}

/**
 * 格式化动作按钮的文本与样式配置
 * @param act 动作载荷
 * @param isAutoAbsorb 是否处于自动吸纳缓冲期
 */
export function formatActionButton(act: ActionPayload, isAutoAbsorb: boolean = false): FormattedActionButton {
  let label = '';
  let subLabel = '';
  let color = '#63b3ed';
  let isBurst = false;

  const srcElem = act.sourceElement ?? act.element ?? WuXing.WOOD;
  const srcName = WUXING_PALETTE[srcElem]?.name ?? '';

  switch (act.actionType) {
    case ActionType.AUTO: {
      label = isAutoAbsorb ? '【自动吸纳】' : '【吸纳】';
      subLabel = isAutoAbsorb ? '天干能量自动吸纳中（点击可立即吸纳）' : '天干能量吸纳（充盈虚空/修复道损）';
      color = '#68d391';
      break;
    }

    case ActionType.CONVERT: {
      label = '【调息】';
      subLabel = `转同属${act.polarity === Polarity.YANG ? '阳' : '阴'}`;
      color = '#63b3ed';
      break;
    }

    case ActionType.TRANS: {
      label = '【化】';
      const targetElem = getActionTargetElement(act);
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `生${targetName}(${act.polarity === Polarity.YANG ? '阳' : '阴'})+1`;
      color = '#4fd1c5';
      break;
    }

    case ActionType.ATK: {
      label = '【破】';
      const targetElem = getActionTargetElement(act);
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `克敌${targetName}(${act.polarity === Polarity.YANG ? '阳' : '阴'})-1`;
      color = '#fc8181';
      break;
    }

    case ActionType.BURST: {
      label = '【强化】';
      const targetElem = getActionTargetElement(act);
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `消耗${srcName}·生${targetName}+2`;
      color = '#f6e05e';
      isBurst = true;
      break;
    }

    case ActionType.BURST_ATK: {
      label = '【强破】';
      const targetElem = getActionTargetElement(act);
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `消耗${srcName}·克${targetName}-2`;
      color = '#f56565';
      isBurst = true;
      break;
    }

    case ActionType.DISSIPATE: {
      label = isAutoAbsorb ? '【亢极散气】' : '【散气】';
      subLabel = isAutoAbsorb ? '亢极满溢自动散气中（点击立即散气）' : `天道满溢则亏·${act.polarity === Polarity.YANG ? '阳' : '阴'}回落至加持(-1)`;
      color = '#e2e8f0';
      break;
    }

    case ActionType.PASS: {
      label = '【消散】';
      subLabel = '无有效动作·消散过牌交接回合';
      color = '#a0aec0';
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
