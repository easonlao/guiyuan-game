/** Shared ink, jade and aged-gold materials for the cultivation arena. */
export const THEME = {
  ink: '#081b22',
  deep: '#0c252d',
  panel: '#102e35',
  panelRaised: '#183a40',
  edge: '#36565a',
  ivory: '#f4ead2',
  muted: '#a3b8b3',
  gold: '#d8b876',
  goldDim: '#8d7852',
  jade: '#80d6ba',
  rival: '#86b8cb',
  damage: '#ee8d77',
  /**
   * 候选标记的专属强调色：故意**不取任何五行色、也不取节点级状态的金**。
   * 之前用元素色加亮时，亮底（点亮 / 加持）上趋近白，与「加持」的径向光晕读成同一种东西（金最明显）；
   * 换成一个盘面上不存在的色相，靠**色相**而不是明暗区分，任何底色上都读得出来。
   */
  candidate: '#8d76c9',
  candidateDeep: '#6f5aa8',
  candidateLit: '#cfc2ee',
  font: '"PingFang SC", "Microsoft YaHei", sans-serif',
} as const;

/** Bevelled lacquer panel; relies only on the Canvas APIs supported by WeChat. */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: string = THEME.edge,
  fill: string = THEME.panel,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  ctx.strokeStyle = 'rgba(244,234,210,0.10)';
  ctx.strokeRect(x + 4.5, y + 4.5, width - 9, height - 9);
  ctx.fillStyle = accent;
  for (const cornerX of [x, x + width - 7]) {
    for (const cornerY of [y, y + height - 2]) {
      ctx.fillRect(cornerX, cornerY, 7, 2);
    }
  }
}

/** Deterministic layered mountains and cloud ribbons; fixed work per frame, no random state. */
export function drawLandscape(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = THEME.ink;
  ctx.fillRect(0, 0, width, height);
  const span = Math.min(width, height);
  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    8,
    width * 0.5,
    height * 0.48,
    span * 0.75,
  );
  glow.addColorStop(0, '#1d4448');
  glow.addColorStop(0.65, '#102e35');
  glow.addColorStop(1, THEME.ink);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  for (let layer = 0; layer < 3; layer += 1) {
    const base = height * (0.72 + layer * 0.075);
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let step = 0; step <= 20; step += 1) {
      const x = (width * step) / 20;
      const crest = Math.sin(step * 1.42 + layer * 2) * 0.5 + Math.sin(step * 0.73 + layer) * 0.5;
      ctx.lineTo(x, base - (crest + 1) * span * (0.09 - layer * 0.018));
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = ['#18383d', '#102e34', '#0a232b'][layer];
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(163,184,179,0.09)';
  ctx.lineWidth = 1;
  for (let ribbon = 0; ribbon < 6; ribbon += 1) {
    ctx.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const x = (width * step) / 24;
      const y = height * (0.24 + ribbon * 0.12) + Math.sin(step * 0.4 + ribbon) * 8;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Sparse paper-grain flecks, with no random draws or unbounded particles.
  ctx.fillStyle = 'rgba(244,234,210,0.035)';
  for (let index = 0; index < 96; index += 1) {
    ctx.fillRect((index * 97 + 17) % width, (index * 173 + 31) % height, 1, 1);
  }
}
