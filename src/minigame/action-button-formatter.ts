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
 * 格式化动作按钮的文本与样式配置
 * @param act 动作载荷
 * @param totalCount 当前可用动作总数
 */
export function formatActionButton(act: ActionPayload, totalCount: number): FormattedActionButton {
  let label = '';
  let subLabel = '';
  let color = '#63b3ed';
  let isBurst = false;

  const srcElem = act.sourceElement ?? act.element ?? WuXing.WOOD;
  const srcName = WUXING_PALETTE[srcElem]?.name ?? '';

  switch (act.actionType) {
    case ActionType.AUTO: {
      label = '【吸纳】';
      if (totalCount === 1) {
        subLabel = '天干能量吸纳（充盈虚空/修复道损）';
      } else {
        const elem = act.element ?? WuXing.WOOD;
        const elemName = WUXING_PALETTE[elem]?.name ?? '';
        subLabel = `${elemName}(${act.polarity === Polarity.YANG ? '阳' : '阴'})+1`;
      }
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
      const targetElem = act.targetElement ?? GENERATION_CYCLE[srcElem];
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `生${targetName}(${act.polarity === Polarity.YANG ? '阳' : '阴'})+1`;
      color = '#4fd1c5';
      break;
    }

    case ActionType.ATK: {
      label = '【破】';
      const targetElem = act.targetElement ?? OVERCOMING_CYCLE[srcElem];
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `克敌${targetName}(${act.polarity === Polarity.YANG ? '阳' : '阴'})-1`;
      color = '#fc8181';
      break;
    }

    case ActionType.BURST: {
      label = '【强化】';
      const targetElem = act.targetElement ?? GENERATION_CYCLE[srcElem];
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `消耗${srcName}·生${targetName}+2`;
      color = '#f6e05e';
      isBurst = true;
      break;
    }

    case ActionType.BURST_ATK: {
      label = '【强破】';
      const targetElem = act.targetElement ?? OVERCOMING_CYCLE[srcElem];
      const targetName = WUXING_PALETTE[targetElem]?.name ?? '';
      subLabel = `消耗${srcName}·克${targetName}-2`;
      color = '#f56565';
      isBurst = true;
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
