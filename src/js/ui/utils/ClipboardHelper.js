// ============================================
// 剪贴板助手
// ============================================
// 职责：
// - 复制文本到剪贴板
// - 提供降级复制方案
// - 显示复制反馈
// ============================================

const ClipboardHelper = {
  /**
   * 复制文本到剪贴板
   * @param {string} text - 要复制的文本
   * @param {Function} onSuccess - 成功回调
   */
  copyToClipboard(text, onSuccess) {
    if (navigator.clipboard) {
      this._modernCopy(text, onSuccess);
    } else {
      this._fallbackCopy(text, onSuccess);
    }
  },

  /**
   * 使用现代 API 复制
   * @param {string} text - 要复制的文本
   * @param {Function} onSuccess - 成功回调
   * @private
   */
  _modernCopy(text, onSuccess) {
    navigator.clipboard.writeText(text)
      .then(() => onSuccess())
      .catch(() => this._fallbackCopy(text, onSuccess));
  },

  /**
   * 降级复制方案
   * @param {string} text - 要复制的文本
   * @param {Function} onSuccess - 成功回调
   * @private
   */
  _fallbackCopy(text, onSuccess) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    onSuccess();
  }
};

export default ClipboardHelper;
