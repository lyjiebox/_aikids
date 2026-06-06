import Taro from "@tarojs/taro";
import { SITE_CONFIG } from "../config/site.config";

export async function generateGame(params: {
  templateId?: string;
  userPrompt: string;
}): Promise<{
  success: boolean;
  data?: { gameHtml: string; title: string };
  message?: string;
}> {
  try {
    const res = await Taro.request({
      url: `${SITE_CONFIG.apiBaseUrl}/api/generate`,
      method: "POST",
      data: {
        templateId: params.templateId || "free",
        userPrompt: params.userPrompt,
        ageRange: [3, 10],
      },
      header: { "content-type": "application/json" },
      timeout: 30000,
    });
    return (res.data as any) || { success: false };
  } catch (e) {
    console.error("[api] generateGame failed:", e);
    return {
      success: false,
      message: "魔法好像失灵了，再试一次吧！",
    };
  }
}
