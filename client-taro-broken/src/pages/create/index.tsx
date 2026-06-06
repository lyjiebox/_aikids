import React, { useState, useEffect } from "react";
import { View, Text, Button, Input } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { TEMPLATES } from "../../config/site.config";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { useGameGenerator } from "../../hooks/useGameGenerator";
import { LoadingAnimation } from "../../components/LoadingAnimation";
import { TemplatePicker } from "../../components/TemplatePicker";
import { VoiceInput } from "../../components/VoiceInput";
import "./index.scss";

const CreatePage = () => {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState("free");
  const [userInput, setUserInput] = useState("");
  const [step, setStep] = useState(1);
  const { isGenerating, progress, generate } = useGameGenerator();
  const { supported, isListening, finalText, startListening, stopListening } =
    useSpeechRecognition({
      onResult: (text) => {
        setUserInput(text);
        setStep(3);
      },
    });

  useEffect(() => {
    const tpl = router.params.templateId;
    if (tpl && TEMPLATES.find((t) => t.id === tpl)) {
      setSelectedTemplate(tpl);
      setStep(2);
    }
  }, [router.params.templateId]);

  useEffect(() => {
    if (finalText) {
      setUserInput(finalText);
    }
  }, [finalText]);

  const handleVoiceStart = () => {
    setStep(2);
    startListening();
  };

  const handleVoiceEnd = () => {
    stopListening();
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) {
      Taro.showToast({ title: "请先说出你的创意", icon: "none" });
      return;
    }
    setStep(3);
    const work = await generate({
      templateId: selectedTemplate,
      userPrompt: userInput,
    });
    if (work) {
      Taro.redirectTo({
        url: `/pages/play/index?workId=${work.id}`,
      });
    }
  };

  if (isGenerating) {
    return (
      <View className="create-page generating">
        <LoadingAnimation text={progress} />
      </View>
    );
  }

  return (
    <View className="create-page">
      <View className="header">
        <Text className="back-btn" onClick={() => Taro.navigateBack()}>
          ←
        </Text>
        <Text className="title">创作游戏</Text>
        <View className="spacer"></View>
      </View>

      <View className="steps">
        <View className={`step ${step >= 1 ? "active" : ""}`}>
          <Text className="step-num">1</Text>
          <Text className="step-text">选主题</Text>
        </View>
        <View className="step-line"></View>
        <View className={`step ${step >= 2 ? "active" : ""}`}>
          <Text className="step-num">2</Text>
          <Text className="step-text">说想法</Text>
        </View>
        <View className="step-line"></View>
        <View className={`step ${step >= 3 ? "active" : ""}`}>
          <Text className="step-num">3</Text>
          <Text className="step-text">生成游戏</Text>
        </View>
      </View>

      <View className="content">
        <View className="section">
          <Text className="section-title">选择主题（可选）</Text>
          <TemplatePicker
            templates={TEMPLATES}
            selected={selectedTemplate}
            onSelect={(id) => {
              setSelectedTemplate(id);
              if (step < 2) setStep(2);
            }}
          />
        </View>

        <View className="section">
          <Text className="section-title">说出你的创意</Text>
          {supported ? (
            <VoiceInput
              isListening={isListening}
              onStart={handleVoiceStart}
              onEnd={handleVoiceEnd}
            />
          ) : (
            <View className="text-input-wrapper">
              <Input
                className="text-input"
                type="text"
                placeholder="在这里输入你的游戏创意..."
                value={userInput}
                onInput={(e) => setUserInput(e.detail.value)}
                maxlength={200}
              />
            </View>
          )}
          {userInput && (
            <View className="input-preview">
              <Text className="preview-label">你说的是：</Text>
              <Text className="preview-text">{userInput}</Text>
            </View>
          )}
        </View>

        <Button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={!userInput.trim()}
        >
          ✨ 开始生成
        </Button>
      </View>
    </View>
  );
};

export default CreatePage;
