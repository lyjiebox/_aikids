import React, { useRef, useEffect } from "react";
import { View } from "@tarojs/components";
import "./GamePlayer.scss";

type Props = {
  title: string;
  gameHtml: string;
};

export const GamePlayer: React.FC<Props> = ({ title, gameHtml }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // 将 HTML 写入 iframe
    if (iframeRef.current && process.env.TARO_ENV === "h5") {
      const doc =
        iframeRef.current.contentDocument ||
        iframeRef.current.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(gameHtml);
        doc.close();
      }
    }
  }, [gameHtml]);

  return (
    <View className="gameplayer-wrapper">
      <View className="gameplayer-iframe-container">
        {process.env.TARO_ENV === "h5" ? (
          <iframe
            ref={iframeRef as any}
            className="gameplayer-iframe"
            sandbox="allow-scripts allow-same-origin"
            title={title}
          />
        ) : (
          <View className="gameplayer-fallback">
            游戏仅在 H5 环境可用
          </View>
        )}
      </View>
    </View>
  );
};
