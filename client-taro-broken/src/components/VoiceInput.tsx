import React from "react";
import { View, Text } from "@tarojs/components";
import "./VoiceInput.scss";

type Props = {
  onStart?: () => void;
  onEnd?: () => void;
  isListening?: boolean;
};

export const VoiceInput: React.FC<Props> = ({
  onStart,
  onEnd,
  isListening = false,
}) => {
  return (
    <View className="voiceinput-wrapper">
      <View
        className={`voiceinput-btn ${
          isListening ? "voiceinput-btn-listening" : ""
        }`}
        onTouchStart={onStart}
        onTouchEnd={onEnd}
        onMouseDown={onStart}
        onMouseUp={onEnd}
      >
        <Text className="voiceinput-icon">🎤</Text>
      </View>
      {isListening ? (
        <Text className="voiceinput-tip">正在听...</Text>
      ) : (
        <Text className="voiceinput-tip">按住说话，松开停止</Text>
      )}
    </View>
  );
};
