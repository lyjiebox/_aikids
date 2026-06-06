import React from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { TEMPLATES } from "../../config/site.config";
import "./index.scss";

const IndexPage = () => {
  const handleCreate = () => {
    Taro.navigateTo({ url: "/pages/create/index" });
  };

  const handleTemplateSelect = (templateId) => {
    Taro.navigateTo({
      url: `/pages/create/index?templateId=${templateId}`,
    });
  };

  return (
    <View className="index-page">
      <View className="header">
        <Text className="logo">🎮</Text>
        <Text className="title">AI 魔法游戏</Text>
      </View>

      <View className="main-cta">
        <Button className="create-btn" onClick={handleCreate}>
          🎤 说出你的游戏创意
        </Button>
      </View>

      <View className="templates-section">
        <Text className="section-title">或者选一个主题开始 →</Text>
        <View className="templates-scroll">
          {TEMPLATES.slice(1, 5).map((t) => (
            <View
              key={t.id}
              className="template-card"
              onClick={() => handleTemplateSelect(t.id)}
            >
              <Text className="template-icon">{t.icon}</Text>
              <Text className="template-name">{t.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

export default IndexPage;
