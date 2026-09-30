import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatHistory } from '../src/ui/chat-history.ts';
import { presentationFor, WindowManager } from '../src/ui/window-manager.ts';
import { NotificationQueue } from '../src/ui/overlays.ts';

test('WindowManager reuses stable IDs, focuses predictably, and compacts z order', () => {
  const manager = new WindowManager({ width: 1280, height: 800 });
  const first = manager.open({ id: 'profile', title: 'Profile' });
  const duplicate = manager.open({ id: 'profile', title: 'Different title' });
  assert.equal(first.id, duplicate.id);
  assert.equal(manager.list().length, 1);
  manager.open({ id: 'chat', title: 'Chat' });
  manager.open({ id: 'settings', title: 'Settings' });
  manager.focus('profile');
  assert.equal(manager.list().at(-1)?.id, 'profile');
  assert.deepEqual(manager.list().map((window) => window.zOrder), [1, 2, 3]);
  manager.close('chat');
  assert.deepEqual(manager.list().map((window) => window.zOrder), [1, 2]);
});

test('WindowManager clamps moves and viewport changes keep every window reachable', () => {
  const manager = new WindowManager({ width: 1200, height: 800 });
  manager.open({ id: 'a', title: 'A', x: 900, y: 600, width: 400, height: 300 });
  manager.move('a', 9000, -500);
  assert.deepEqual([manager.get('a')?.x, manager.get('a')?.y], [1128, 0]);
  manager.resizeViewport({ width: 390, height: 844 });
  const mobile = manager.get('a');
  assert.equal(mobile?.presentation, 'sheet');
  assert.ok(mobile && mobile.x + 72 <= 390 && mobile.y + 72 <= 844);
  assert.equal(manager.move('a', 200, 200), false);
});

test('WindowManager supports explicit instances and subscription cleanup over 1,000 cycles', () => {
  const manager = new WindowManager({ width: 1280, height: 800 });
  let notifications = 0;
  const unsubscribe = manager.subscribe(() => { notifications++; });
  for (let cycle = 0; cycle < 1000; cycle++) {
    manager.open({ id: 'tool', title: 'Tool' });
    manager.open({ id: 'tool', title: 'Tool', instance: true });
    manager.focus('tool:2');
    manager.close('tool:2');
    manager.close('tool');
  }
  assert.equal(manager.list().length, 0);
  assert.equal(manager.list().length, 0);
  const beforeUnsubscribe = notifications;
  unsubscribe();
  manager.open({ id: 'after', title: 'After' });
  assert.equal(notifications, beforeUnsubscribe);
});

test('WindowManager survives 1,000 viewport/orientation changes without losing bounds', () => {
  const manager = new WindowManager({ width: 1920, height: 1080 });
  manager.open({ id: 'viewport-test', title: 'Viewport test', x: 1700, y: 900 });
  for (let cycle = 0; cycle < 1000; cycle++) {
    const mobile = cycle % 2 === 1;
    manager.resizeViewport(mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 });
    const window = manager.get('viewport-test');
    const width = mobile ? 390 : 1920;
    const height = mobile ? 844 : 1080;
    assert.ok(window && window.x + 72 <= width && window.y + 72 <= height);
  }
});

test('adaptive presentation uses desktop, tablet, and mobile layouts', () => {
  assert.equal(presentationFor({ width: 1920, height: 1080 }), 'floating');
  assert.equal(presentationFor({ width: 1024, height: 768 }), 'panel');
  assert.equal(presentationFor({ width: 768, height: 1024 }), 'panel');
  assert.equal(presentationFor({ width: 430, height: 932 }), 'sheet');
  assert.equal(presentationFor({ width: 900, height: 390 }), 'sheet');
});

test('chat history bounds memory and expires bubbles without per-bubble timers', () => {
  const history = new ChatHistory(50, 1000);
  for (let index = 0; index < 1200; index++) {
    history.add({ userId: String(index), username: `u${index}`, message: `<img src=x onerror=alert(${index})>` }, index);
  }
  assert.equal(history.list(1199).length, 50);
  assert.equal(history.list(2200).length, 0);
  history.add({ userId: '1', username: 'One', message: 'safe text' }, 3000);
  assert.equal(history.list(3000)[0]?.message, 'safe text');
});

test('notification queue stays bounded during a 10,000-message burst and expires entries', () => {
  const queue = new NotificationQueue(5);
  for (let index = 0; index < 10_000; index++) queue.push(`notice-${index}`, 1000, index);
  assert.equal(queue.list(9_999).length, 5);
  assert.equal(queue.list(10_999).length, 0);
});
