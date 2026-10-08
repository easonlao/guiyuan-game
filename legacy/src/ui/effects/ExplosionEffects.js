// ============================================
// 爆炸效果控制器
// ============================================
// 职责：
// - 执行爆炸动画
// - 处理攻击冲击效果
// ============================================

const ExplosionEffects = {
  /**
   * 播放爆炸效果
   * @param {HTMLElement} projectile - 抛射物元素
   * @param {boolean} isSameNode - 是否为同一节点
   * @param {number} deltaX - X轴偏移
   * @param {number} deltaY - Y轴偏移
   */
  playExplosion(projectile, isSameNode, deltaX, deltaY) {
    const expKfs = isSameNode
      ? [
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }
        ]
      : [
          {
            transform: `translate(${deltaX >= 0 ? `calc(-50% + ${deltaX}px)` : `calc(-50% - ${Math.abs(deltaX)}px)`}, ${deltaY >= 0 ? `calc(-50% + ${deltaY}px)` : `calc(-50% - ${Math.abs(deltaY)}px)`}) scale(1.5)`,
            opacity: 1
          },
          {
            transform: `translate(${deltaX >= 0 ? `calc(-50% + ${deltaX}px)` : `calc(-50% - ${Math.abs(deltaX)}px)`}, ${deltaY >= 0 ? `calc(-50% + ${deltaY}px)` : `calc(-50% - ${Math.abs(deltaY)}px)`}) scale(3)`,
            opacity: 0
          }
        ];

    const exp = projectile.animate(expKfs, { duration: 200, fill: 'forwards' });
    exp.onfinish = () => projectile.remove();
  },

  /**
   * 播放攻击冲击效果
   * @param {HTMLElement} targetNode - 目标节点
   */
  playShakeImpact(targetNode) {
    targetNode.classList.remove('shake-impact');
    void targetNode.offsetWidth;
    targetNode.classList.add('shake-impact');
  }
};

export default ExplosionEffects;
