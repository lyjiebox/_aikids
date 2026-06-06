import React, { useState } from "react";
import { View, Text, Button, Switch, Slider } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useAppContext } from "../../context/AppContext";
import { ParentGate } from "../../components/ParentGate";
import "./index.scss";

const SettingsPage: React.FC = () => {
  const { state, updateSettings, dispatch } = useAppContext();
  const [authenticated, setAuthenticated] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleAuthenticated = () => {
    setAuthenticated(true);
  };

  const handleDailyTimeChange = (e: any) => {
    updateSettings({ dailyTimeLimit: e.detail.value });
  };

  const handleSessionTimeChange = (e: any) => {
    updateSettings({ sessionTimeLimit: e.detail.value });
  };

  const handleVoiceToggle = (e: any) => {
    updateSettings({ allowVoiceInput: e.detail.value });
  };

  const handleClearWorks = () => {
    setShowClearConfirm(true);
  };

  const confirmClear = () => {
    dispatch({ type: "SET_WORKS", payload: [] });
    setShowClearConfirm(false);
    Taro.showToast({ title: "已清空", icon: "success" });
  };

  if (!authenticated) {
    return (
      <View className="settings-page auth">
        <ParentGate onPass={handleAuthenticated} />
      </View>
    );
  }

  return (
    <View className="settings-page">
      <View className="header">
        <Text className="title">家长设置</Text>
      </View>

      <View className="content">
        <View className="setting-item">
          <View className="setting-label">
            <Text className="label-text">每日使用时长</Text>
            <Text className="label-value">{state.settings.dailyTimeLimit} 分钟</Text>
          </View>
          <Slider
            className="setting-slider"
            min={10}
            max={60}
            step={5}
            value={state.settings.dailyTimeLimit}
            onChange={handleDailyTimeChange}
            activeColor="#6c5ce7"
            backgroundColor="#dfe6e9"
          />
        </View>

        <View className="setting-item">
          <View className="setting-label">
            <Text className="label-text">单次使用时长</Text>
            <Text className="label-value">{state.settings.sessionTimeLimit} 分钟</Text>
          </View>
          <Slider
            className="setting-slider"
            min={10}
            max={30}
            step={5}
            value={state.settings.sessionTimeLimit}
            onChange={handleSessionTimeChange}
            activeColor="#6c5ce7"
            backgroundColor="#dfe6e9"
          />
        </View>

        <View className="setting-item">
          <View className="setting-label">
            <Text className="label-text">语音输入</Text>
          </View>
          <Switch
            checked={state.settings.allowVoiceInput}
            onChange={handleVoiceToggle}
            color="#6c5ce7"
          />
        </View>

        <View className="setting-item">
          <View className="setting-label">
            <Text className="label-text">内容过滤</Text>
            <Text className="label-value">
              {state.settings.contentFilterLevel === "strict" ? "严格" : "适中"}
            </Text>
          </View>
        </View>

        <View className="setting-divider"></View>

        <Button className="clear-btn" onClick={handleClearWorks}>
          🗑️ 清空所有作品
        </Button>
      </View>

      {showClearConfirm && (
        <View className="clear-modal-overlay">
          <View className="clear-modal">
            <Text className="modal-title">确认清空所有作品吗？</Text>
            <Text className="modal-hint">此操作不可恢复</Text>
            <View className="modal-buttons">
              <Button className="modal-btn cancel" onClick={() => setShowClearConfirm(false)}>
                取消
              </Button>
              <Button className="modal-btn confirm" onClick={confirmClear}>
                清空
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default SettingsPage;
