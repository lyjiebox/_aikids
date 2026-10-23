/**
 * ============================================================
 * backup.js — 备份文件下载 / 读取（V3.6）
 * ============================================================
 *
 * 纯浏览器工具：
 * - 生成备份文件名与 JSON
 * - 触发本地下载（不经过服务端）
 * - 读取用户选择的文件并做大小/解析校验
 *
 * 解析与合并规则在 storage-schema.js，本文件只处理 IO 与文件名。
 */

import { buildExportEnvelope, parseImportPayload } from "./storage-schema";

/** 单个备份文件大小上限：50 MB */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

function pad(value) {
  return String(value).padStart(2, "0");
}

/** 生成带本地时间戳的文件名：prefix-YYYYMMDD-HHmm.json */
export function buildDatedFilename(prefix, now = Date.now(), ext = "json") {
  const date = new Date(now);
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}-${pad(date.getHours())}${pad(date.getMinutes())}.${ext}`;
}

/** 生成 aikids-backup-YYYYMMDD-HHmm.json */
export function buildBackupFilename(now = Date.now()) {
  return buildDatedFilename("aikids-backup", now);
}

/** 生成 aikids-telemetry-YYYYMMDD-HHmm.json */
export function buildTelemetryFilename(now = Date.now()) {
  return buildDatedFilename("aikids-telemetry", now);
}

/**
 * 由当前内存快照生成备份文件内容。
 * @param {{works?: unknown, settings?: unknown, models?: unknown}} snapshot
 * @param {number} [now]
 */
export function createBackupFile(snapshot, now = Date.now()) {
  const envelope = buildExportEnvelope(snapshot, now);
  return {
    filename: buildBackupFilename(now),
    envelope,
    json: JSON.stringify(envelope, null, 2),
    counts: {
      works: envelope.data.works.length,
      models: envelope.data.models.length,
    },
  };
}

/** 触发浏览器下载；返回是否成功发起 */
export function downloadJsonFile(filename, json) {
  try {
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // 延迟回收，避免部分浏览器下载被取消
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.error("[backup] download failed:", error);
    return false;
  }
}

/**
 * 读取用户选择的备份文件。
 * @param {File} file
 * @returns {Promise<{ok: true, snapshot: object, meta: object, filename: string} | {ok: false, code: string, message: string}>}
 */
export async function readBackupFile(file) {
  if (!file) {
    return { ok: false, code: "NO_FILE", message: "请选择备份文件" };
  }

  if (typeof file.size === "number" && file.size > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "备份文件超过 50 MB，请确认是否选错文件",
    };
  }

  let text = "";
  try {
    if (typeof file.text === "function") {
      text = await file.text();
    } else {
      text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("读取失败"));
        reader.readAsText(file);
      });
    }
  } catch {
    return {
      ok: false,
      code: "READ_FAILED",
      message: "无法读取备份文件",
    };
  }

  const parsed = parseImportPayload(text);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    snapshot: parsed.snapshot,
    meta: parsed.meta,
    filename: typeof file.name === "string" ? file.name : "",
  };
}
