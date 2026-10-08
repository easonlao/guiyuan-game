import EventBus from '../bus/EventBus.js';
import { STEMS_LIST } from '../config/game-config.js';
import './DebugStyle.css'; // 引入调试样式

const DebugController = {
  init() {
    this.createDebugPanel();
    this.bindEvents();
  },

  createDebugPanel() {
    const div = document.createElement('div');
    div.id = 'debug-panel';
    div.innerHTML = `
      <div class="debug-header">
        <span>🛠️ 状态调试</span>
        <button id="toggle-debug">_</button>
      </div>
      <div class="debug-content">
        ${this.renderPlayerControls('P1', '本尊')}
        <hr/>
        ${this.renderPlayerControls('P2', '对家')}
      </div>
    `;
    document.body.appendChild(div);
  },

  renderPlayerControls(pid, label) {
    let html = `<div class="debug-row-label">${label} (${pid})</div><div class="debug-grid">`;
    
    // STEMS_LIST 包含 10 个天干 (0-9)
    // 0:甲(木阳), 1:乙(木阴), 2:丙(火阳)...
    STEMS_LIST.forEach((stem, idx) => {
      const isYang = idx % 2 === 0;
      html += `
        <div class="debug-item" style="border-color: ${stem.color}">
          <span style="color:${stem.color}">${stem.name}</span>
          <div class="debug-btns">
            <button data-pid="${pid}" data-el="${stem.element}" data-yang="${isYang}" data-delta="-1">-</button>
            <button data-pid="${pid}" data-el="${stem.element}" data-yang="${isYang}" data-delta="1">+</button>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  },

  bindEvents() {
    const panel = document.getElementById('debug-panel');
    const content = panel.querySelector('.debug-content');
    
    // 折叠/展开
    document.getElementById('toggle-debug').addEventListener('click', () => {
      content.style.display = content.style.display === 'none' ? 'block' : 'none';
    });

    // 调整按钮
    panel.querySelectorAll('button[data-delta]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const { pid, el, yang, delta } = e.target.dataset;
        console.log(`[Debug] ${pid} El:${el} Yang:${yang} Delta:${delta}`);
        
        EventBus.emit('debug:adjust', {
          playerId: pid,
          elementIndex: parseInt(el),
          isYang: yang === 'true',
          delta: parseInt(delta)
        });
      });
    });
  }
};

export default DebugController;
