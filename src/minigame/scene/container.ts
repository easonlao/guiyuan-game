import { Node } from './node.js';

/**
 * 组合节点：自身不画任何东西，只负责把子节点组织成一颗子树。
 * 分层能力（局部变换、透明度、可见性、递归渲染）由 `Node` 提供，见 `docs/HLD.md` §2 Layer 3。
 */
export class Container extends Node {}
