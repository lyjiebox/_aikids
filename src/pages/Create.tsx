/**
 * ============================================================
 * Create 页面 — 创作页（核心流程）
 * ============================================================
 * 
 * 路由：/create?templateId=xxx（可选）
 * 
 * 三步创作流程：
 *   ① 选主题 → ② 说想法 → ③ 生成游戏
 * 
 * 状态机：
 *   step=1 → 选择模板
 *   step=2 → 语音/文字输入
 *   step=3 → 调用 API 生成游戏（显示 loading）
 * 
 * engine 状态：
 *   null      → 初始状态
 *   'pending' → API 调用中（显示"正在连接 AI 引擎..."）
 *   'volcengine' → AI 生成成功（显示"火山引擎 AI"）
 *   'mock'    → 降级到本地模板
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TEMPLATES } from '../config/site';
import { useAppContext } from '../context/AppContext';
import { generateGame } from '../services/api';
import TemplatePicker from '../components/TemplatePicker';
import LoadingAnimation from '../components/LoadingAnimation';
import { VoiceInput } from '../components/VoiceInput';
import './Create.css';

function Create() {
  const [searchParams] = useSearchParams();     // URL 参数（预选模板）
  const navigate = useNavigate();
  const { addWork } = useAppContext();
  
  const [selectedTemplate, setSelectedTemplate] = useState('free');  // 当前选中的模板
  const [userInput, setUserInput] = useState('');                     // 用户输入文本
  const [step, setStep] = useState(1);                                // 当前步骤
  const [isGenerating, setIsGenerating] = useState(false);            // 是否正在生成
  const [engine, setEngine] = useState(null);                         // AI 引擎类型

  // 如果 URL 带了 templateId，自动预选模板并跳到步骤 2
  useEffect(() => {
    const tpl = searchParams.get('templateId');
    if (tpl && TEMPLATES.find(t => t.id === tpl)) {
      setSelectedTemplate(tpl);
      setStep(2);
    }
  }, [searchParams]);

  /**
   * 点击"开始生成"按钮
   * 流程：设置 loading 状态 → 调用 API → 保存作品 → 跳转播放页
   */
  const handleGenerate = async () => {
    if (!userInput.trim()) {
      alert('请先说出你的创意！');
      return;
    }
    setStep(3);
    setIsGenerating(true);
    setEngine('pending'); // 显示"正在连接 AI 引擎..."
    
    try {
      const res = await generateGame({
        templateId: selectedTemplate,
        userPrompt: userInput,
      });

      const finalEngine = res.data?.engine || 'mock';
      setEngine(finalEngine);

      if (res.success && res.data) {
        // 构建作品对象
        const work = {
          id: Date.now().toString(),           // 用时间戳做唯一 ID
          title: res.data.title,
          templateId: selectedTemplate,
          userPrompt: userInput,
          gameHtml: res.data.gameHtml,
          engine: finalEngine,
          createdAt: Date.now(),
          playCount: 0,
        };
        addWork(work);
        // 短暂延迟让用户看到引擎标识
        setTimeout(() => navigate(`/play/${work.id}`), 1200);
      } else {
        alert(res.message || '生成失败，请重试！');
        setStep(2);
      }
    } catch (err) {
      console.error('生成失败:', err);
      alert('网络请求失败，请检查网络后重试！');
      setStep(2);
    }
    setIsGenerating(false);
  };

  // ============================================================
  // 步骤 3：生成中 → 显示 Loading 动画
  // ============================================================
  if (isGenerating || step === 3) {
    // 根据 engine 状态显示不同文案
    let loadingText = '🎨 正在生成游戏...';
    if (engine === 'pending') loadingText = '⏳ 正在连接 AI 引擎...';
    else if (engine === 'volcengine') loadingText = '🔥 AI 正在创作你的游戏...';
    
    return (
      <div className="create-page">
        <LoadingAnimation text={loadingText} />
        {/* API 返回后显示引擎标识 */}
        {engine && engine !== 'pending' && (
          <div className="engine-badge">
            {engine === 'volcengine' ? '🤖 火山引擎 AI' : '📦 本地模板'}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // 步骤 1-2：模板选择 + 语音输入
  // ============================================================
  return (
    <div className="create-page">
      {/* 顶部：返回按钮 + 步骤指示器 */}
      <div className="header">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <h1 className="title">创作游戏</h1>
        <div className="spacer"></div>
      </div>

      {/* 步骤指示器：① → ② → ③ */}
      <div className="steps">
        <div className={`step ${step >= 1 ? 'active' : ''}`}>
          <span className="step-num">1</span>
          <span className="step-text">选主题</span>
        </div>
        <div className="step-line"></div>
        <div className={`step ${step >= 2 ? 'active' : ''}`}>
          <span className="step-num">2</span>
          <span className="step-text">说想法</span>
        </div>
        <div className="step-line"></div>
        <div className={`step ${step >= 3 ? 'active' : ''}`}>
          <span className="step-num">3</span>
          <span className="step-text">生成游戏</span>
        </div>
      </div>

      <div className="content">
        {/* 模板选择区 */}
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

        {/* 语音输入区 */}
        <div className="section">
          <h2 className="section-title">说出你的创意</h2>
          <VoiceInput value={userInput} onChange={setUserInput} />
        </div>

        {/* 生成按钮：无输入时禁用 */}
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
