import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TEMPLATES } from '../config/site';
import { useAppContext } from '../context/AppContext';
import { generateGame } from '../services/api';
import TemplatePicker from '../components/TemplatePicker';
import LoadingAnimation from '../components/LoadingAnimation';
import './Create.css';

function Create() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addWork } = useAppContext();
  
  const [selectedTemplate, setSelectedTemplate] = useState('free');
  const [userInput, setUserInput] = useState('');
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const tpl = searchParams.get('templateId');
    if (tpl && TEMPLATES.find(t => t.id === tpl)) {
      setSelectedTemplate(tpl);
      setStep(2);
    }
  }, [searchParams]);

  const handleGenerate = async () => {
    if (!userInput.trim()) {
      alert('请先说出你的创意！');
      return;
    }
    setStep(3);
    setIsGenerating(true);
    
    const res = await generateGame({
      templateId: selectedTemplate,
      userPrompt: userInput,
    });

    if (res.success && res.data) {
      const work = {
        id: Date.now().toString(),
        title: res.data.title,
        templateId: selectedTemplate,
        userPrompt: userInput,
        gameHtml: res.data.gameHtml,
        createdAt: Date.now(),
        playCount: 0,
      };
      addWork(work);
      navigate(`/play/${work.id}`);
    } else {
      alert(res.message || '生成失败，请重试！');
      setStep(2);
    }
    setIsGenerating(false);
  };

  if (isGenerating || step === 3) {
    return (
      <div className="create-page">
        <LoadingAnimation text="正在生成游戏..." />
      </div>
    );
  }

  return (
    <div className="create-page">
      <div className="header">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <h1 className="title">创作游戏</h1>
        <div className="spacer"></div>
      </div>

      <div className="steps">
        <div className={'step ' + (step >= 1 ? 'active' : '')}>
          <span className="step-num">1</span>
          <span className="step-text">选主题</span>
        </div>
        <div className="step-line"></div>
        <div className={'step ' + (step >= 2 ? 'active' : '')}>
          <span className="step-num">2</span>
          <span className="step-text">说想法</span>
        </div>
        <div className="step-line"></div>
        <div className={'step ' + (step >= 3 ? 'active' : '')}>
          <span className="step-num">3</span>
          <span className="step-text">生成游戏</span>
        </div>
      </div>

      <div className="content">
        <div className="section">
          <h2 className="section-title">选择主题（可选）</h2>
          <TemplatePicker
            selected={selectedTemplate}
            onSelect={(id) => {
              setSelectedTemplate(id);
              if (step < 2) setStep(2);
            }}
          />
        </div>

        <div className="section">
          <h2 className="section-title">输入你的创意</h2>
          <div className="text-input-wrapper">
            <textarea
              className="text-input"
              placeholder="在这里输入你的游戏创意..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={!userInput.trim()}
        >
          ✨ 开始生成
        </button>
      </div>

      <div className="bottom-spacer"></div>
    </div>
  );
}

export default Create;
