/**
 * 快速测试：验证火山引擎 Responses API 游戏生成
 */
import { generateGameWithAI } from './src/services/ai';

async function main() {
  console.log('🧪 测试 AI 游戏生成...\n');

  try {
    const result = await generateGameWithAI({
      userPrompt: '做一个点击星星的游戏',
      ageRange: [3, 10]
    });

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
