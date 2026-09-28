// Adaptador oficial que remove a necessidade de eval sob uma CSP restrita.
import 'pixi.js/unsafe-eval';
import { Application, Graphics } from 'pixi.js';

// Limite provisório de qualidade; não representa um orçamento de capacidade.
const MAX_DPR = 2;

/** Valida o renderer com uma forma própria; não contém estado de jogo. */
export async function mountPreview(host: HTMLElement, status: HTMLElement): Promise<() => void> {
  const app = new Application();
  await app.init({
    width: Math.max(1, host.clientWidth),
    height: Math.max(1, host.clientHeight),
    resolution: Math.min(window.devicePixelRatio || 1, MAX_DPR),
    autoDensity: false,
    autoStart: false,
    sharedTicker: false,
    preference: 'webgl',
    powerPreference: 'low-power',
    antialias: false,
    background: '#14212b',
    eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
  });
  app.stop();
  app.stage.eventMode = 'none';
  app.stage.interactiveChildren = false;

  const canvas = app.canvas;
  canvas.className = 'preview-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Símbolo geométrico da prévia gráfica do Habbux');
  host.append(canvas);

  const shape = new Graphics();
  shape.rect(-34, -34, 68, 68).fill('#69dcc1');
  shape.rect(-14, -14, 28, 28).fill('#14212b');
  shape.rotation = Math.PI / 4;
  app.stage.addChild(shape);

  let frame: number | undefined;
  let disposed = false;
  let contextLost = false;

  const render = (): void => {
    frame = undefined;
    if (disposed || contextLost || document.hidden) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    app.renderer.resize(width, height, Math.min(window.devicePixelRatio || 1, MAX_DPR));
    shape.position.set(width / 2, height / 2);
    app.render();
  };

  // Um frame apenas quando o viewport muda; nenhum loop de renderização ocioso.
  const scheduleRender = (): void => {
    if (frame === undefined && !disposed) frame = window.requestAnimationFrame(render);
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    status.textContent = 'A prévia foi pausada. Aguardando a recuperação gráfica do dispositivo…';
  };
  const onContextRestored = (): void => {
    contextLost = false;
    status.textContent = 'Prévia pronta. O jogo está em desenvolvimento.';
    scheduleRender();
  };

  const observer = new ResizeObserver(scheduleRender);
  observer.observe(host);
  window.addEventListener('resize', scheduleRender);
  document.addEventListener('visibilitychange', scheduleRender);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  render();
  status.textContent = 'Prévia pronta. O jogo está em desenvolvimento.';

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    window.removeEventListener('resize', scheduleRender);
    document.removeEventListener('visibilitychange', scheduleRender);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    app.destroy(true, { children: true });
  };
}
