import React from "react";
import { View, Text } from "@tarojs/components";
import type { GameTemplate } from "../types";
import "./TemplatePicker.scss";

type Props = {
  templates: GameTemplate[];
  selected: string;
  onSelect: (id: string) => void;
};

export const TemplatePicker: React.FC<Props> = ({
  templates,
  selected,
  onSelect,
}) => {
  return (
    <View className="templatepicker-wrapper">
      <View className="templatepicker-grid">
        {templates.map((t) => (
          <View
            key={t.id}
            className={`templatepicker-card ${
              selected === t.id ? "templatepicker-card-selected" : ""
            }`}
            onClick={() => onSelect(t.id)}
          >
            <Text className="templatepicker-icon">{t.icon}</Text>
            <Text className="templatepicker-name">{t.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
