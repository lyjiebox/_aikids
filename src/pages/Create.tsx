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
import {
  getCurrentModelLabel,
  getModelRequestParams,
} from '../services/model-utils';
import TemplatePicker from '../components/TemplatePicker';
import LoadingAnimation from '../components/LoadingAnimation';
import { VoiceInput } from '../components/VoiceInput';
import { createWorkId } from '../services/storage-schema';
import { recordTelemetryEvent } from '../services/telemetry';
import './Create.css';

interface RemixContext {
  templateId: string;
  remixFrom: string;
  remixInstruction: string;
  originalUserPrompt?: string;
  originalTitle?: string;
  originalGameHtml?: string;
  originalGameHtmlPreview?: string;
}

function Create() {
  const [searchParams] = useSearchParams();     // URL 参数（预选模板/Remix）
  const navigate = useNavigate();
  const { state, addWork, incrementRemixCount } = useAppContext();
  const [remixContext, setRemixContext] = useState<RemixContext | null>(null);
  
  const [selectedTemplate, setSelectedTemplate] = useState('free');  // 当前选中的模板
  const [userInput, setUserInput] = useState('');                     // 用户输入文本
  const [step, setStep] = useState(1);                                // 当前步骤
  const [isGenerating, setIsGenerating] = useState(false);            // 是否正在生成
  const [engine, setEngine] = useState<string | null>(null);                         // AI 引擎类型
  const [usedModelName, setUsedModelName] = useState<string | null>(null);           // 实际使用的模型名
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);       // 降级提示
  const [elapsedSeconds, setElapsedSeconds] = useState(0);            // 生成耗时（秒）
  const startTimeRef = useRef<number>(0);                             // 生成开始时间戳
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null); // 计时器引用

  // 首页选择的模型（只读展示 + 生成请求参数）
  const currentModelLabel = getCurrentModelLabel(state.models, state.selectedModelId);

  // Remix 自动生成会在 setTimeout 中调用首帧闭包，用 ref 读取最新模型状态
  const modelStateRef = useRef(state.models);
  const selectedModelRef = useRef(state.selectedModelId);
  useEffect(() => {
    modelStateRef.current = state.models;
    selectedModelRef.current = state.selectedModelId;
  }, [state.models, state.selectedModelId]);

  const getModelParams = () =>
    getModelRequestParams(modelStateRef.current, selectedModelRef.current);

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
        const ctx = JSON.parse(raw) as RemixContext;
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
  const handleRemixGenerate = async (ctx: RemixContext) => {
    setStep(3);
    setIsGenerating(true);
    setEngine('pending');
    setUsedModelName(null);
    setFallbackWarning(null);
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
        // V3.3：透传完整原游戏源码；preview 仅用于兼容旧后端
        originalGameHtml: ctx.originalGameHtml,
        originalGameHtmlPreview:
          ctx.originalGameHtmlPreview || (ctx.originalGameHtml || '').slice(0, 500),
        ...getModelParams(),
      });
      const finalEngine = res.data?.engine || 'mock';
      setEngine(finalEngine);
      setUsedModelName(res.data?.modelName || null);
      setFallbackWarning(res.data?.warning || null);
      if (res.success && res.data) {
        if (timerRef.current) clearInterval(timerRef.current);
        const durationMs = Date.now() - startTimeRef.current;
        // V3.6：Remix 生成结果只记结构化字段，不记 Prompt / HTML
        recordTelemetryEvent('generate', {
          mode: 'remix',
          ok: finalEngine === 'volcengine',
          fallback:
            Boolean(res.data.warning) ||
            finalEngine === 'mock' ||
            Boolean(res.data.remixFallback),
          engine: finalEngine,
          modelId: res.data.model || null,
          modelName: res.data.modelName || null,
          modelSource: res.data.modelSource || null,
          templateId: ctx.templateId,
          durationMs,
          remixMode: res.data.remixMode || null,
          preserved: Boolean(
            (res.data.remixAudit as { preserved?: boolean } | null)?.preserved
          ),
        });
        // V3.3：模型不可用时后端保留原游戏；不新增重复作品，直接回到原作品
        if (res.data.remixFallback) {
          setIsGenerating(false);
          alert(res.data.warning || 'AI 暂时不可用，已保留原游戏');
          navigate(`/play/${ctx.remixFrom}`);
          return;
        }
        const generationTime = Math.floor(durationMs / 1000);
        const work = {
          id: createWorkId(),
          title: res.data.title,
          templateId: ctx.templateId,
          userPrompt: ctx.remixInstruction,
          gameHtml: res.data.gameHtml,
          engine: finalEngine,
          modelId: res.data.model || null,
          modelName: res.data.modelName || null,
          modelSource: res.data.modelSource || null,
          createdAt: Date.now(),
          playCount: 0,
          generationTime,
          remixFrom: ctx.remixFrom,
          remixInstruction: ctx.remixInstruction,
          remixFromTitle: ctx.originalTitle || null,
          remixMode: res.data.remixMode || null,
          remixProfile: res.data.remixProfile || null,
          remixAudit: res.data.remixAudit || null,
          remixCount: 0
        };
        addWork(work);
        // 更新原始作品 remixCount
        incrementRemixCount(ctx.remixFrom);
        setTimeout(() => navigate(`/play/${work.id}`), 1200);
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
        recordTelemetryEvent('failure', {
          scope: 'remix',
          code: res.code,
          message: res.message || '生成失败',
          durationMs: Date.now() - startTimeRef.current,
        });
        alert(res.message || '生成失败，请重试！');
        setStep(2);
      }
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      console.error('生成失败:', err);
      const error = err as { code?: string; message?: string } | null;
      recordTelemetryEvent('failure', {
        scope: 'remix',
        code: error?.code,
        message: error?.message || '网络请求失败',
        durationMs: Date.now() - startTimeRef.current,
      });
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
    setUsedModelName(null);
    setFallbackWarning(null);
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
        ...getModelParams(),
      });

      const finalEngine = res.data?.engine || 'mock';
      setEngine(finalEngine);
      setUsedModelName(res.data?.modelName || null);
      setFallbackWarning(res.data?.warning || null);

      if (res.success && res.data) {
        // 停止计时器
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const durationMs = Date.now() - startTimeRef.current;
        const generationTime = Math.floor(durationMs / 1000);

        // V3.6：只记结构化字段，不记 Prompt / HTML
        recordTelemetryEvent('generate', {
          mode: 'create',
          ok: finalEngine === 'volcengine',
          fallback: Boolean(res.data.warning) || finalEngine === 'mock',
          engine: finalEngine,
          modelId: res.data.model || null,
          modelName: res.data.modelName || null,
          modelSource: res.data.modelSource || null,
          templateId: selectedTemplate,
          durationMs,
        });

        // 构建作品对象
        const work = {
          id: createWorkId(),                  // V3.6：新作品使用 UUID，旧作品保留原 ID
          title: res.data.title,
          templateId: selectedTemplate,
          userPrompt: userInput,
          gameHtml: res.data.gameHtml,
          engine: finalEngine,
          modelId: res.data.model || null,
          modelName: res.data.modelName || null,
          modelSource: res.data.modelSource || null,
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
        recordTelemetryEvent('failure', {
          scope: 'generate',
          code: res.code,
          message: res.message || '生成失败',
          durationMs: Date.now() - startTimeRef.current,
        });
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
      const error = err as { code?: string; message?: string } | null;
      recordTelemetryEvent('failure', {
        scope: 'generate',
        code: error?.code,
        message: error?.message || '网络请求失败',
        durationMs: Date.now() - startTimeRef.current,
      });
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
    if (remixContext) {
      // V3.3：Remix 明确告知「基于原游戏修改」
      loadingText =
        engine === 'pending'
          ? `🔄 正在读取《${remixContext.originalTitle || '原游戏'}》并连接 ${currentModelLabel}...`
          : `🧬 正在保留《${remixContext.originalTitle || '原游戏'}》的玩法并改编...`;
    } else if (engine === 'pending') {
      loadingText = `⏳ 正在连接 ${currentModelLabel}...`;
    } else if (engine === 'volcengine') {
      loadingText = `🔥 ${usedModelName || currentModelLabel} 正在创作你的游戏...`;
    }

    return (
      <div className="create-page">
        <LoadingAnimation text={loadingText} />
        {/* 计时器 */}
        <div className="generation-timer">
          ⏱️ 已等待 {elapsedSeconds} 秒
        </div>
        {remixContext && (
          <div className="remix-generating-hint">
            🔒 会保留原游戏的玩法、得分和操作，只改你要求的部分
          </div>
        )}
        {/* API 返回后显示引擎/模型标识 */}
        {engine && engine !== 'pending' && (
          <div className="engine-badge">
            {engine === 'volcengine'
              ? `🤖 ${usedModelName || 'AI 模型'}`
              : '📦 本地模板'}
          </div>
        )}
        {fallbackWarning && (
          <div className="fallback-warning">
            ⚠️ {fallbackWarning}
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
            onSelect={(id: string) => {
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

        {/* 当前模型（只读，点击回首页切换） */}
        <button
          type="button"
          className="current-model-hint"
          onClick={() => navigate('/')}
        >
          🤖 当前模型：{currentModelLabel}
          <span className="current-model-switch">去首页切换 →</span>
        </button>

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
