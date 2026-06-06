import React, { useState, useCallback } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useAppContext } from "../../context/AppContext";
import { GameCard } from "../../components/GameCard";
import "./index.scss";

const GalleryPage: React.FC = () => {
  const { state, deleteWork } = useAppContext();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handlePlay = (id: string) => {
    Taro.navigateTo({ url: `/pages/play/index?workId=${id}` });
  };

  const handleLongPress = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteId) {
      deleteWork(deleteId);
      setDeleteId(null);
      Taro.showToast({ title: "已删除", icon: "success" });
    }
  }, [deleteId, deleteWork]);

  const cancelDelete = useCallback(() => {
    setDeleteId(null);
  }, []);

  if (state.works.length === 0) {
    return (
      <View className="gallery-page empty">
        <Text className="empty-icon">🎮</Text>
        <Text className="empty-text">还没有作品哦</Text>
        <Text className="empty-hint">去首页创作一个吧！</Text>
        <Button
          className="go-create-btn"
          onClick={() => Taro.switchTab({ url: "/pages/index/index" })}
        >
          去创作
        </Button>
      </View>
    );
  }

  return (
    <View className="gallery-page">
      <View className="header">
        <Text className="title">我的作品</Text>
        <Text className="count">{state.works.length} 个</Text>
      </View>

      <View className="works-grid">
        {state.works.map((work) => (
          <GameCard
            key={work.id}
            work={work}
            onClick={() => handlePlay(work.id)}
            onLongPress={() => handleLongPress(work.id)}
          />
        ))}
      </View>

      {deleteId && (
        <View className="delete-modal-overlay">
          <View className="delete-modal">
            <Text className="modal-title">确认删除这个作品吗？</Text>
            <View className="modal-buttons">
              <Button className="modal-btn cancel" onClick={cancelDelete}>
                取消
              </Button>
              <Button className="modal-btn confirm" onClick={confirmDelete}>
                删除
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default GalleryPage;
