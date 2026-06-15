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

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TEMPLATES } from '../config/site';
import { useAppContext } from '../context/AppContext';
import { generateGame } from '../services/api';
import TemplatePicker from '../components/TemplatePicker';
import LoadingAnimation from '../components/LoadingAnimation';
import { VoiceInput } from '../components/VoiceInput';
import './Create.css';

function Create() {
  const [searchParams] = useSearchParams();     // URL 参数（预选模板/Remix）
  const navigate = useNavigate();
  const { addWork, incrementRemixCount } = useAppContext();
  const [remixContext, setRemixContext] = useState(null);
  
  const [selectedTemplate, setSelectedTemplate] = useState('free');  // 当前选中的模板
  const [userInput, setUserInput] = useState('');                     // 用户输入文本
  const [step, setStep] = useState(1);                                // 当前步骤
  const [isGenerating, setIsGenerating] = useState(false);            // 是否正在生成
  const [engine, setEngine] = useState(null);                         // AI 引擎类型
  const [elapsedSeconds, setElapsedSeconds] = useState(0);            // 生成耗时（秒）
  const startTimeRef = useRef<number>(0);                             // 生成开始时间戳
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null); // 计时器引用

  // 如果是 Remix 模式，自动加载上下文并开始生成
  useEffect(() => {
    const isRemix = searchParams.get('remix') === '1';
    if (isRemix) {
      const raw = sessionStorage.getItem('aikids-remix-context');
      if (!raw) {
        alert('改编信息已失效，请重新操作');
        navigate('/gallery');
        return;
      }
      try {
        const ctx = JSON.parse(raw);
        setRemixContext(ctx);
        setSelectedTemplate(ctx.templateId);
        setUserInput(ctx.remixInstruction);
        // 消费一次性上下文
        sessionStorage.removeItem('aikids-remix-context');
        // 自动开始生成
        setTimeout(() => handleRemixGenerate(ctx), 100);
      } catch (e) {
        alert('改编信息解析失败');
        navigate('/gallery');
      }
    } else {
      // 普通模式：URL 带了 templateId 自动预选
      const tpl = searchParams.get('templateId');
      if (tpl && TEMPLATES.find(t => t.id === tpl)) {
        setSelectedTemplate(tpl);
        setStep(2);
      }
    }
  }, [searchParams]);

  /**
   * Remix 生成：复用原有生成流程，传递 Remix 字段
   */
  const handleRemixGenerate = async (ctx) => {
    setStep(3);
    setIsGenerating(true);
    setEngine('pending');
    setElapsedSeconds(0);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    try {
      const res = await generateGame({
        templateId: ctx.templateId,
        userPrompt: ctx.remixInstruction,
        remixFrom: ctx.remixFrom,
        remixInstruction: ctx.remixInstruction,
        originalUserPrompt: ctx.originalUserPrompt,
        originalTitle: ctx.originalTitle,
        originalGameHtmlPreview: ctx.originalGameHtml
      });
      const finalEngine = res.data?.engine || 'mock';
      setEngine(finalEngine);
      if (res.success && res.data) {
        if (timerRef.current) clearInterval(timerRef.current);
        const generationTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const work = {
          id: Date.now().toString(),
          title: res.data.title,
          templateId: ctx.templateId,
          userPrompt: ctx.remixInstruction,
          gameHtml: res.data.gameHtml,
          engine: finalEngine,
          createdAt: Date.now(),
          playCount: 0,
          generationTime,
          remixFrom: ctx.remixFrom,
          remixInstruction: ctx.remixInstruction,
          remixCount: 0
        };
        addWork(work);
        // 更新原始作品 remixCount
        incrementRemixCount(ctx.remixFrom);
        setTimeout(() => navigate(`/play/${work.id}`), 1200);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        alert(res.message || '生成失败，请重试！');
        setStep(2);
      }
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      console.error('生成失败:', err);
      alert('网络请求失败，请检查网络后重试！');
      setStep(2);
    }
    setIsGenerating(false);
  };

  /**
   * 点击"开始生成"按钮（普通创作）
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
    setElapsedSeconds(0);
    startTimeRef.current = Date.now();
    
    // 启动计时器，每秒更新
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    
    try {
      const res = await generateGame({
        templateId: selectedTemplate,
        userPrompt: userInput,
      });

      const finalEngine = res.data?.engine || 'mock';
      setEngine(finalEngine);

      if (res.success && res.data) {
        // 停止计时器
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const generationTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
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
          generationTime,                      // 生成耗时（秒）
          remixCount: 0
        };
        addWork(work);
        // 短暂延迟让用户看到引擎标识
        setTimeout(() => navigate(`/play/${work.id}`), 1200);
      } else {
        // 停止计时器
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        alert(res.message || '生成失败，请重试！');
        setStep(2);
      }
    } catch (err) {
      // 停止计时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      console.error('生成失败:', err);
      alert('网络请求失败，请检查网络后重试！');
      setStep(2);
    }
    setIsGenerating(false);
  };

  // 组件卸载时清理计时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

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
        {/* 计时器 */}
        <div className="generation-timer">
          ⏱️ 已等待 {elapsedSeconds} 秒
        </div>
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
