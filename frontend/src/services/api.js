import { SITE_CONFIG } from '../config/site';

export async function generateGame({ templateId, userPrompt }) {
  try {
    const res = await fetch(`${SITE_CONFIG.apiBaseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateId: templateId || 'free',
        userPrompt: userPrompt,
        ageRange: [3, 10],
      }),
    });
    return await res.json();
  } catch (e) {
    console.error('[api] generateGame failed:', e);
    return {
      success: false,
      message: '魔法好像失灵了，再试一次吧！',
    };
  }
}
