import React from "react";
import { View, Text } from "@tarojs/components";
import "./LoadingAnimation.scss";

type Props = {
  text?: string;
};

export const LoadingAnimation: React.FC<Props> = ({
  text = "正在生成游戏，请稍候...",
}) => {
  return (
    <View className="loading-wrapper">
      <View className="loading-spinner">
        <View className="loading-dot loading-dot-1"></View>
        <View className="loading-dot loading-dot-2"></View>
        <View className="loading-dot loading-dot-3"></View>
      </View>
      <Text className="loading-text">{text}</Text>
    </View>
  );
};
