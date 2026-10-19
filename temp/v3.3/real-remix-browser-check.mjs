/**
 * 真实模型 Remix 输出浏览器可玩性检查（Chrome CDP）
 *
 * 前置：
 *   1. node temp/v3.3/real-remix-check.mjs 已生成 real-remix-output.html
 *   2. Chrome 以 --remote-debugging-port=9333 启动
 *   3. node temp/v3.3/real-remix-browser-check.mjs
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const fileUrl = pathToFileURL(
  resolve('temp/v3.3/real-remix-output.html')
).href;

let ws;
let nextId = 0;
const pending = new Map();
const exceptions = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connect() {
  const targets = await (await fetch(`${CDP}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    ws.onopen = resolveOpen;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(
        message.params?.exceptionDetails?.exception?.description ||
          message.params?.exceptionDetails?.text ||
          'unknown exception'
      );
      return;
    }
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  };
  await send('Runtime.enable');
  await send('Page.enable');
}

function send(method, params = {}) {
  return new Promise((resolveSend, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveSend, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text
    );
  }
  return result.result.value;
}

async function main() {
  await connect();
  await send('Page.navigate', { url: fileUrl });
  await sleep(1000);

  const initial = await evaluate(`(() => ({
    title: document.title,
    score: document.querySelector('#score')?.textContent || '',
    target: document.querySelector('#target')?.textContent || '',
    hasScore: !!document.querySelector('#score'),
    hasScript: !!document.querySelector('script'),
  }))()`);

  const clickResult = await evaluate(`(() => {
    const target = document.querySelector('#target');
    const score = document.querySelector('#score');
    if (!target || !score) return { ok: false };
    target.click();
    return { ok: true, score: score.textContent, target: target.textContent };
  })()`);
  await sleep(300);
  const after = await evaluate(`(() => ({
    score: document.querySelector('#score')?.textContent || '',
    target: document.querySelector('#target')?.textContent || '',
  }))()`);

  const passed =
    initial.hasScore &&
    initial.hasScript &&
    initial.target.includes('💎') &&
    clickResult.ok &&
    /得分：1|得分: 1|1/.test(after.score) &&
    exceptions.length === 0;

  console.log(
    JSON.stringify(
      {
        title: initial.title,
        initialScore: initial.score,
        afterClickScore: after.score,
        target: initial.target,
        afterTarget: after.target,
        exceptions,
        passed,
      },
      null,
      2
    )
  );

  if (!passed) process.exitCode = 1;
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
