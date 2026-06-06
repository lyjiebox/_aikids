import React from "react";
import { View, Text } from "@tarojs/components";
import type { GameWork } from "../types";
import "./GameCard.scss";

type Props = {
  work: GameWork;
  onClick: () => void;
  onLongPress?: () => void;
};

export const GameCard: React.FC<Props> = ({ work, onClick, onLongPress }) => {
  const dateStr = new Date(work.createdAt).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });

  return (
    <View
      className="gamecard-wrapper"
      onClick={onClick}
      onLongPress={onLongPress}
    >
      <View className="gamecard-thumb">
        <Text className="gamecard-emoji">🎮</Text>
      </View>
      <View className="gamecard-info">
        <Text className="gamecard-title" numberOfLines={2}>
          {work.title}
        </Text>
        <Text className="gamecard-meta">
          {dateStr} · 玩了 {work.playCount} 次
        </Text>
      </View>
    </View>
  );
};
