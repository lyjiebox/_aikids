// 根据环境自动选择API地址
const getApiUrl = () => {
  // 生产环境（Vercel）直接用/api路径
  if (import.meta.env.PROD) {
    return "/api/generate";
  }
  // 开发环境用 localhost
  return "http://localhost:4000/api/generate";
};

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
