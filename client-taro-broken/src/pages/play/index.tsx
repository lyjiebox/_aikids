import React, { useEffect, useMemo } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useAppContext } from "../../context/AppContext";
import { GamePlayer } from "../../components/GamePlayer";
import "./index.scss";

const PlayPage: React.FC = () => {
  const router = useRouter();
  const { state, incrementPlayCount } = useAppContext();

  const workId = router.params.workId as string;

  const work = useMemo(() => {
    return state.works.find((w) => w.id === workId);
  }, [state.works, workId]);

  useEffect(() => {
    if (work) {
      incrementPlayCount(work.id);
    }
  }, [work, incrementPlayCount]);

  if (!work) {
    return (
      <View className="play-page not-found">
        <Text className="not-found-text">游戏不存在</Text>
        <Button className="back-btn" onClick={() => Taro.switchTab({ url: "/pages/gallery/index" })}>
          返回作品列表
        </Button>
      </View>
    );
  }

  const handleBack = () => {
    Taro.switchTab({ url: "/pages/gallery/index" });
  };

  return (
    <View className="play-page">
      <View className="top-bar">
        <Text className="back-btn" onClick={handleBack}>✕</Text>
        <Text className="game-title">{work.title}</Text>
        <View className="spacer"></View>
      </View>

      <GamePlayer gameHtml={work.gameHtml} title={work.title} />

      <View className="bottom-bar">
        <Button className="action-btn restart">🔄 重新开始</Button>
        <Button className="action-btn save">💾 已保存</Button>
      </View>
    </View>
  );
};

export default PlayPage;
