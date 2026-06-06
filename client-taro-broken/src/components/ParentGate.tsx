import React, { useState, useEffect } from "react";
import { View, Text, Input, Button } from "@tarojs/components";
import "./ParentGate.scss";

type Props = {
  onPass: () => void;
};

export const ParentGate: React.FC<Props> = ({ onPass }) => {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // 生成 1-10 的随机数
    setA(Math.floor(Math.random() * 10) + 1);
    setB(Math.floor(Math.random() * 10) + 1);
  }, []);

  const handleSubmit = () => {
    const val = Number(input.trim());
    if (!Number.isFinite(val)) {
      setError("请输入数字");
      return;
    }
    if (val === a + b) {
      setError("");
      onPass();
    } else {
      setError("答案不正确，请再试一次");
      setInput("");
    }
  };

  return (
    <View className="parentgate-mask">
      <View className="parentgate-card">
        <Text className="parentgate-title">家长验证</Text>
        <Text className="parentgate-question">
          {a} + {b} = ?
        </Text>
        <Input
          className="parentgate-input"
          type="number"
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          placeholder="请输入答案"
          confirmType="done"
          onConfirm={handleSubmit}
        />
        {error && <Text className="parentgate-error">{error}</Text>}
        <View className="parentgate-actions">
          <Button
            className="parentgate-btn parentgate-btn-confirm"
            onClick={handleSubmit}
          >
            确定
          </Button>
        </View>
      </View>
    </View>
  );
};
