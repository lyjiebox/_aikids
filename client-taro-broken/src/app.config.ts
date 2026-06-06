export default defineAppConfig({
  pages: [
    "pages/index/index",
    "pages/create/index",
    "pages/play/index",
    "pages/gallery/index",
    "pages/settings/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#6c5ce7",
    navigationBarTitleText: "AI 魔法游戏",
    navigationBarTextStyle: "white",
  },
  tabBar: {
    color: "#636e72",
    selectedColor: "#6c5ce7",
    backgroundColor: "#ffffff",
    list: [
      {
        pagePath: "pages/index/index",
        text: "首页",
      },
      {
        pagePath: "pages/gallery/index",
        text: "作品",
      },
      {
        pagePath: "pages/settings/index",
        text: "设置",
      },
    ],
  },
});
