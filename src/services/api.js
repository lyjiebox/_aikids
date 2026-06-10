// 根据环境自动选择API地址
const getApiUrl = () => {
  if (import.meta.env.PROD) {
    return "/api/generate";
  }
  return "http://localhost:4000/api/generate";
};

/**
 * 生成游戏
 * @returns {{ success: boolean, data?: { title: string, gameHtml: string, engine: 'volcengine'|'mock' }, message?: string }}
 */
export async function generateGame(req) {
  const url = getApiUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });
  
  if (!res.ok) {
    throw new Error("API请求失败");
  }
  
  return res.json();
}
