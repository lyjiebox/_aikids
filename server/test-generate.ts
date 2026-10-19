/**
 * 快速测试：验证模型调用与游戏生成
 *
 * 运行：cd server && npx tsx test-generate.ts
 */
import { loadLocalEnv } from './src/loadEnv';

loadLocalEnv();

import { generateGameWithAI } from './src/services/ai';
import { resolveDefaultModel } from './src/services/model';

async function main() {
  console.log('🧪 测试 AI 游戏生成...\n');

  const model = resolveDefaultModel();
  if (!model) {
    console.error('❌ 未配置可用模型，请检查 .env 中的模型环境变量');
    process.exit(1);
  }

  console.log('🤖 使用模型:', model.name, `(${model.source})`);

  try {
    const result = await generateGameWithAI(
      {
        userPrompt: '做一个点击星星的游戏',
        ageRange: [3, 10],
      },
      model
    );

    console.log('✅ 生成成功！');
    console.log('📛 标题:', result.title);
    console.log('📏 HTML 长度:', result.html.length, '字符');
    console.log('📄 HTML 前 200 字符:');
    console.log(result.html.slice(0, 200));
  } catch (err) {
    console.error('❌ 生成失败:', err);
    process.exit(1);
  }
}

main();
