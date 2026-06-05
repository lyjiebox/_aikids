import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import './Play.css';

function Play() {
  const { workId } = useParams();
  const navigate = useNavigate();
  const { state, incrementPlayCount } = useAppContext();

  const work = useMemo(() => 
    state.works.find(w => w.id === workId), 
    [state.works, workId]
  );

  useEffect(() => {
    if (work) {
      incrementPlayCount(work.id);
    }
  }, [work, incrementPlayCount]);

  if (!work) {
    return (
      <div className="play-page not-found">
        <h2>游戏不存在</h2>
        <button className="back-btn" onClick={() => navigate('/gallery')}>
          返回作品列表
        </button>
      </div>
    );
  }

  return (
    <div className="play-page">
      <div className="top-bar">
        <button className="close-btn" onClick={() => navigate('/gallery')}>✕</button>
        <h1 className="game-title">{work.title}</h1>
        <div className="spacer"></div>
      </div>

      <div className="game-iframe-container">
        <iframe
          srcDoc={work.gameHtml}
          className="game-iframe"
          title={work.title}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}

export default Play;
