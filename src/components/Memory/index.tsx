import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle,
  Database,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface MemoryCandidate {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

interface DurableMemoryTarget {
  id: string;
  label: string;
  description: string;
  file_path: string;
  file_label: string;
  item_count: number;
  preview_items: string[];
  last_updated: string | null;
}

interface MemoryOverview {
  memu_available: boolean;
  candidate_count: number;
  candidate_memories: MemoryCandidate[];
  durable_targets: DurableMemoryTarget[];
  strategy: {
    title: string;
    summary: string;
    notes: string[];
  };
  extractor: {
    version: string;
    last_run_at: string | null;
    auto_run_due: boolean;
    window_days: number;
    last_stats: AutoExtractStats | null;
  };
  efficiency: {
    summary: string;
    metrics: {
      extraction_yield: number | null;
      duplicate_rate: number | null;
      freshness_coverage: number | null;
      candidate_to_durable_ratio: number | null;
      durable_item_count: number;
      durable_bytes: number;
      durable_token_estimate: number;
      candidate_token_estimate: number;
      average_context_tokens: number | null;
      durable_context_share: number | null;
      candidate_context_share: number | null;
    };
    audit: {
      last_refreshed_at: string | null;
      metrics: {
        prompt_events: number;
        memory_index_events: number;
        prompt_injection_rate: number | null;
        average_prompt_injection_tokens: number | null;
        average_memory_index_tokens: number | null;
        processed_user_messages: number;
        related_hit_messages: number;
        related_hit_rate: number | null;
        applied_hit_rate: number | null;
        average_targeted_tokens: number | null;
        potential_token_saved_average: number | null;
      };
      notes: {
        injection: string;
        related_hits: string;
        potential_savings: string;
      };
      recent_events: Array<{
        type: string;
        label: string;
        occurred_at: string | null;
        session_key: string;
        preview: string;
        detail: string;
      }>;
    };
  };
}

interface AutoExtractStats {
  version: string;
  window_days: number;
  scanned_sessions: number;
  scanned_messages: number;
  created_count: number;
  duplicate_count: number;
  skipped_noise: number;
  created_preview: string[];
}

interface AutoExtractResult extends AutoExtractStats {
  created_items: MemoryCandidate[];
}

type FlashState =
  | {
      type: 'success' | 'error';
      message: string;
    }
  | null;

const MEMORY_TYPE_LABELS: Record<string, string> = {
  preference: '偏好',
  identity: '身份',
  rule: '规则',
  setup: '配置',
  manager_ui: '控制台',
  auto_extract: '自动抽取',
  profile: '用户画像',
  rules: '协作规则',
};

function formatDateTime(value: string | null) {
  if (!value) return '未知';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderMetadata(metadata: Record<string, unknown>) {
  return Object.entries(metadata)
    .filter(([key]) => !['suggested_target', 'confidence'].includes(key))
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 3);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '暂无';
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '暂无';
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function MemoryCenter() {
  const isWebReplica = import.meta.env.MODE === 'web';
  const autoRunRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState('preference');
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const result = await invoke<MemoryOverview>('get_memory_overview');
      setOverview(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!overview?.extractor.auto_run_due || autoRunRef.current || !isWebReplica) return;
    autoRunRef.current = true;
    void handleAutoExtract(true);
  }, [overview, isWebReplica]);

  const targetMap = useMemo(() => {
    return new Map((overview?.durable_targets || []).map((target) => [target.id, target]));
  }, [overview]);

  const handleAddCandidate = async () => {
    const content = draft.trim();
    if (!content) return;
    setWorkingKey('add');
    setFlash(null);
    try {
      await invoke('remember_candidate', {
        content,
        metadata: {
          type: draftType,
          source: 'manager_ui',
        },
      });
      setDraft('');
      setFlash({
        type: 'success',
        message: '候选记忆已加入候选池，确认稳定后再晋升到长期记忆。',
      });
      await loadData();
    } catch (e) {
      setFlash({
        type: 'error',
        message: `写入候选记忆失败: ${String(e)}`,
      });
    } finally {
      setWorkingKey(null);
    }
  };

  const handleAutoExtract = async (silent = false) => {
    setWorkingKey('auto-extract');
    if (!silent) {
      setFlash(null);
    }
    try {
      const result = await invoke<AutoExtractResult>('run_memory_auto_extract', {
        days: overview?.extractor.window_days || 14,
      });
      await loadData();
      if (!silent || result.created_count > 0) {
        setFlash({
          type: 'success',
          message:
            result.created_count > 0
              ? `自动整理完成：新增 ${result.created_count} 条候选记忆，跳过 ${result.duplicate_count} 条重复项。`
              : `自动整理完成：未发现新的稳定候选记忆，已跳过 ${result.duplicate_count} 条重复项。`,
        });
      }
    } catch (e) {
      setFlash({
        type: 'error',
        message: `自动整理失败: ${String(e)}`,
      });
    } finally {
      setWorkingKey(null);
    }
  };

  const handlePromote = async (memoryId: string, targetId: string) => {
    setWorkingKey(`promote:${memoryId}:${targetId}`);
    setFlash(null);
    try {
      const target = targetMap.get(targetId);
      await invoke('promote_memory_candidate', { memoryId, targetId });
      setFlash({
        type: 'success',
        message: `已晋升到${target?.label || '长期记忆'}。`,
      });
      await loadData();
    } catch (e) {
      setFlash({
        type: 'error',
        message: `晋升失败: ${String(e)}`,
      });
    } finally {
      setWorkingKey(null);
    }
  };

  const handleDelete = async (memoryId: string) => {
    setWorkingKey(`delete:${memoryId}`);
    setFlash(null);
    try {
      await invoke('delete_memory_candidate', { memoryId });
      setFlash({
        type: 'success',
        message: '候选记忆已删除。',
      });
      await loadData();
    } catch (e) {
      setFlash({
        type: 'error',
        message: `删除失败: ${String(e)}`,
      });
    } finally {
      setWorkingKey(null);
    }
  };

  if (!isWebReplica) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="max-w-xl rounded-2xl border border-dark-500 bg-dark-700/70 p-8 text-center">
          <Brain size={32} className="mx-auto text-claw-400 mb-4" />
          <p className="text-white font-medium">记忆中心当前仅在网页版 bridge 模式下可用</p>
          <p className="text-sm text-gray-400 mt-2">
            这个页面依赖本地 `memu-local` 和 workspace memory 文件，当前桌面版还没有同名命令桥接。
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-claw-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-6xl space-y-6">
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
            <p className="font-medium">加载记忆中心失败</p>
            <p className="text-sm text-red-300 mt-1">{error}</p>
          </div>
        )}

        {flash && (
          <div
            className={clsx(
              'rounded-xl border p-4',
              flash.type === 'success'
                ? 'border-green-500/30 bg-green-500/10 text-green-100'
                : 'border-red-500/30 bg-red-500/10 text-red-100'
            )}
          >
            <div className="flex items-start gap-3">
              {flash.type === 'success' ? (
                <CheckCircle size={18} className="mt-0.5 text-green-400" />
              ) : (
                <AlertTriangle size={18} className="mt-0.5 text-red-400" />
              )}
              <p className="text-sm">{flash.message}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-dark-500 bg-gradient-to-br from-dark-700 to-dark-800 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Brain size={22} className="text-claw-400" />
                记忆中心
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {overview?.strategy.summary || '先进入候选池，再晋升到长期记忆，减少错误记忆污染。'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleAutoExtract(false)}
                disabled={workingKey === 'auto-extract'}
                className="btn-primary flex items-center gap-2"
              >
                {workingKey === 'auto-extract' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                自动整理最近 {overview?.extractor.window_days || 14} 天
              </button>
              <button onClick={loadData} className="btn-secondary flex items-center gap-2">
                <RefreshCw size={16} />
                刷新
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 mt-5">
            <div className="rounded-xl border border-dark-500 bg-dark-600/60 p-4">
              <div className="flex items-center gap-2 text-gray-400">
                <Database size={16} />
                <span className="text-sm">候选池</span>
              </div>
              <p className="text-2xl font-semibold text-white mt-3">{overview?.candidate_count || 0}</p>
              <p className="text-xs text-gray-500 mt-1">先放临时事实，别直接污染长期记忆。</p>
            </div>
            <div className="rounded-xl border border-dark-500 bg-dark-600/60 p-4">
              <div className="flex items-center gap-2 text-gray-400">
                <FileText size={16} />
                <span className="text-sm">长期目标</span>
              </div>
              <p className="text-2xl font-semibold text-white mt-3">{overview?.durable_targets.length || 0}</p>
              <p className="text-xs text-gray-500 mt-1">只写稳定偏好和协作规则。</p>
            </div>
            <div className="rounded-xl border border-dark-500 bg-dark-600/60 p-4">
              <div className="flex items-center gap-2 text-gray-400">
                <ShieldCheck size={16} />
                <span className="text-sm">当前策略</span>
              </div>
              <p className="text-lg font-semibold text-white mt-3">{overview?.strategy.title || '候选池 -> 长期记忆'}</p>
              <p className="text-xs text-gray-500 mt-1">系统基线文件仍然保持脚本生成。</p>
            </div>
          </div>

          <div className="grid gap-2 mt-5">
            {(overview?.strategy.notes || []).map((note) => (
              <div
                key={note}
                className="flex items-start gap-2 rounded-lg border border-dark-500 bg-dark-700/50 px-3 py-2 text-sm text-gray-300"
              >
                <ArrowRight size={14} className="text-claw-300 mt-0.5 shrink-0" />
                <span>{note}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-dark-500 bg-dark-700/60 p-4 mt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">自动抽取状态</p>
                <p className="text-xs text-gray-500 mt-1">
                  上次运行: {formatDateTime(overview?.extractor.last_run_at || null)}
                </p>
              </div>
              {overview?.extractor.auto_run_due ? (
                <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300">
                  需要补扫
                </span>
              ) : (
                <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-300">
                  已是最新
                </span>
              )}
            </div>

            {overview?.extractor.last_stats ? (
              <div className="grid gap-3 md:grid-cols-4 mt-4">
                <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                  <p className="text-xs text-gray-500">扫描会话</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {overview.extractor.last_stats.scanned_sessions}
                  </p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                  <p className="text-xs text-gray-500">扫描消息</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {overview.extractor.last_stats.scanned_messages}
                  </p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                  <p className="text-xs text-gray-500">新增候选</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {overview.extractor.last_stats.created_count}
                  </p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                  <p className="text-xs text-gray-500">重复跳过</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {overview.extractor.last_stats.duplicate_count}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-dark-500 bg-dark-800/40 p-4 text-sm text-gray-500 mt-4">
                还没有自动整理记录。页面打开后会在需要时自动补扫一次，你也可以手动触发。
              </div>
            )}
          </div>

          <div className="rounded-xl border border-dark-500 bg-dark-700/60 p-4 mt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-white">效率估算</p>
                <p className="text-xs text-gray-500 mt-1">
                  {overview?.efficiency.summary}
                </p>
              </div>
              <span className="rounded-full bg-dark-800 px-3 py-1 text-xs text-gray-300">
                混合：真实审计 + 估算
              </span>
            </div>

            <div className="rounded-lg border border-dark-500 bg-dark-800/50 p-4 mt-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">真实注入与相关命中</p>
                  <p className="text-xs text-gray-500 mt-1">
                    上次刷新: {formatDateTime(overview?.efficiency.audit.last_refreshed_at || null)}
                  </p>
                </div>
                <span className="rounded-full bg-green-500/10 px-3 py-1 text-xs text-green-300">
                  systemPromptReport + sidecar
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 mt-4">
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">真实注入事件</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.prompt_events)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">会话级 prompt 注入日志</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">MEMORY 注入次数</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.memory_index_events)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">明确看到 MEMORY.md 被注入</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">最近会话注入覆盖</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatPercent(overview?.efficiency.audit.metrics.prompt_injection_rate)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">最近可见会话里有 prompt 注入记录的比例</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">平均注入 token</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.average_prompt_injection_tokens)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">每次注入的 workspace prompt 负载</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">平均 MEMORY token</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.average_memory_index_tokens)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">MEMORY.md 本身的平均注入量</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">已扫描用户消息</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.processed_user_messages)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">sidecar 审计处理过的消息数</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">相关命中消息</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.related_hit_messages)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">消息与长期记忆条目存在明确相关性</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">相关命中率</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatPercent(overview?.efficiency.audit.metrics.related_hit_rate)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">相关命中消息 / 已扫描用户消息</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">命中后采纳率</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatPercent(overview?.efficiency.audit.metrics.applied_hit_rate)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">命中后，回复里也出现相关信息的比例</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">命中记忆平均 token</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.average_targeted_tokens)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">每次命中真正相关的记忆负载</p>
                </div>
                <div className="rounded-lg border border-dark-500 bg-dark-900/40 p-3">
                  <p className="text-xs text-gray-500">潜在节省 token</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {formatNumber(overview?.efficiency.audit.metrics.potential_token_saved_average)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">如果未来改成按需注入，平均可省掉的 prompt token</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3 mt-4">
                <div className="rounded-lg border border-dashed border-dark-500 bg-dark-900/20 p-3">
                  <p className="text-xs text-gray-500">注入说明</p>
                  <p className="text-sm text-gray-300 mt-1">
                    {overview?.efficiency.audit.notes.injection}
                  </p>
                </div>
                <div className="rounded-lg border border-dashed border-dark-500 bg-dark-900/20 p-3">
                  <p className="text-xs text-gray-500">相关命中说明</p>
                  <p className="text-sm text-gray-300 mt-1">
                    {overview?.efficiency.audit.notes.related_hits}
                  </p>
                </div>
                <div className="rounded-lg border border-dashed border-dark-500 bg-dark-900/20 p-3">
                  <p className="text-xs text-gray-500">节省说明</p>
                  <p className="text-sm text-gray-300 mt-1">
                    {overview?.efficiency.audit.notes.potential_savings}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-white">最近审计事件</p>
                  <span className="text-xs text-gray-500">
                    {overview?.efficiency.audit.recent_events.length || 0} 条
                  </span>
                </div>
                {overview?.efficiency.audit.recent_events.length ? (
                  <div className="grid gap-3 mt-3">
                    {overview.efficiency.audit.recent_events.map((event, index) => (
                      <div
                        key={`${event.type}-${event.session_key}-${event.occurred_at || index}`}
                        className="rounded-lg border border-dark-500 bg-dark-900/30 p-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm text-white">{event.label}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDateTime(event.occurred_at)} · {event.session_key}
                            </p>
                          </div>
                          <span className="rounded-full bg-dark-800 px-2 py-1 text-[11px] text-gray-300">
                            {event.type === 'prompt_injection' ? '注入' : '命中'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-200 mt-2">{event.preview}</p>
                        <p className="text-xs text-gray-500 mt-2">{event.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-dark-500 bg-dark-900/20 p-3 mt-3 text-sm text-gray-500">
                    还没有审计事件。打开页面后会自动从本地会话索引里补建日志。
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 mt-4">
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">抽取产出率</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatPercent(overview?.efficiency.metrics.extraction_yield)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">新增候选 / 扫描消息</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">去重率</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatPercent(overview?.efficiency.metrics.duplicate_rate)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">重复跳过 / 扫描消息</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">覆盖率估算</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatPercent(overview?.efficiency.metrics.freshness_coverage)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">新增 + 重复 / 扫描消息</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">候选/长期 比</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {overview?.efficiency.metrics.candidate_to_durable_ratio === null
                    ? '暂无'
                    : overview?.efficiency.metrics.candidate_to_durable_ratio}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">候选池是否堆积过多</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">长期记忆条目</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatNumber(overview?.efficiency.metrics.durable_item_count)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">当前长期记忆总条数</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">长期记忆体积</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatNumber(overview?.efficiency.metrics.durable_bytes)} B
                </p>
                <p className="text-[11px] text-gray-500 mt-1">Markdown 文件大小</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">长期记忆估算 token</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatNumber(overview?.efficiency.metrics.durable_token_estimate)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">按文本长度粗估</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">候选池估算 token</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatNumber(overview?.efficiency.metrics.candidate_token_estimate)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">候选池当前负载</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">平均上下文预算</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatNumber(overview?.efficiency.metrics.average_context_tokens)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">来自最近会话</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">长期记忆上下文占比</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatPercent(overview?.efficiency.metrics.durable_context_share)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">长期记忆估算 token / 平均上下文</p>
              </div>
              <div className="rounded-lg border border-dark-500 bg-dark-800/60 p-3">
                <p className="text-xs text-gray-500">候选池上下文占比</p>
                <p className="text-lg font-semibold text-white mt-1">
                  {formatPercent(overview?.efficiency.metrics.candidate_context_share)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">候选池估算 token / 平均上下文</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-dark-500 bg-dark-700 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium text-white">新增候选记忆</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    适合先记录还没完全确认的偏好、规则或配置结论。
                  </p>
                </div>
                <span className="rounded-full bg-claw-500/10 px-3 py-1 text-xs text-claw-300">
                  推荐先放候选池
                </span>
              </div>

              <div className="grid gap-3 mt-5 md:grid-cols-[1fr_160px]">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="例如：用户偏好中文回答，先给结论，再给可执行下一步。"
                  className="input-base min-h-[120px] resize-y"
                />
                <div className="space-y-3">
                  <select
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value)}
                    className="input-base"
                  >
                    <option value="preference">偏好</option>
                    <option value="identity">身份</option>
                    <option value="rule">规则</option>
                    <option value="setup">配置</option>
                  </select>
                  <button
                    onClick={handleAddCandidate}
                    disabled={!draft.trim() || workingKey === 'add'}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {workingKey === 'add' ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    加入候选池
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium text-white">候选记忆</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    只有确认稳定的信息才应该晋升到长期记忆。
                  </p>
                </div>
                <span className="text-sm text-gray-500">{overview?.candidate_count || 0} 条</span>
              </div>

              {overview?.candidate_memories.length ? (
                <div className="space-y-3">
                  {overview.candidate_memories.map((candidate) => {
                    const metadataEntries = renderMetadata(candidate.metadata);
                    const suggestedTarget = String(candidate.metadata.suggested_target || '');
                    const confidence = typeof candidate.metadata.confidence === 'number'
                      ? Number(candidate.metadata.confidence)
                      : null;
                    return (
                      <div
                        key={candidate.id}
                        className="rounded-xl border border-dark-500 bg-dark-700/80 p-5 space-y-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-white leading-7">{candidate.content}</p>
                            <p className="text-xs text-gray-500 mt-3">
                              最近更新: {formatDateTime(candidate.updated_at || candidate.created_at)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDelete(candidate.id)}
                            disabled={workingKey === `delete:${candidate.id}`}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            title="删除候选记忆"
                          >
                            {workingKey === `delete:${candidate.id}` ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>

                        {(suggestedTarget || confidence !== null) && (
                          <div className="flex flex-wrap gap-2">
                            {suggestedTarget && (
                              <span className="rounded-full bg-claw-500/10 px-2.5 py-1 text-xs text-claw-300">
                                建议晋升到 {MEMORY_TYPE_LABELS[suggestedTarget] || suggestedTarget}
                              </span>
                            )}
                            {confidence !== null && (
                              <span className="rounded-full bg-dark-600 px-2.5 py-1 text-xs text-gray-300">
                                置信度 {Math.round(confidence * 100)}%
                              </span>
                            )}
                          </div>
                        )}

                        {metadataEntries.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {metadataEntries.map(([key, value]) => (
                              <span
                                key={`${candidate.id}-${key}`}
                                className="rounded-full bg-dark-600 px-2.5 py-1 text-xs text-gray-300"
                              >
                                {MEMORY_TYPE_LABELS[String(value)] || key}: {String(value)}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3">
                          {overview.durable_targets.map((target) => (
                            <button
                              key={`${candidate.id}-${target.id}`}
                              onClick={() => handlePromote(candidate.id, target.id)}
                              disabled={workingKey === `promote:${candidate.id}:${target.id}`}
                              className="inline-flex items-center gap-2 rounded-lg border border-dark-500 bg-dark-600 px-3 py-2 text-sm text-white hover:border-claw-500/40 hover:bg-dark-600/80 transition-all"
                            >
                              {workingKey === `promote:${candidate.id}:${target.id}` ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <ArrowRight size={14} className="text-claw-300" />
                              )}
                              晋升到 {target.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-dark-500 bg-dark-700/50 p-8 text-center">
                  <Database size={24} className="mx-auto text-gray-500 mb-3" />
                  <p className="text-white font-medium">候选池目前是空的</p>
                  <p className="text-sm text-gray-500 mt-2">
                    先把新的稳定偏好草稿放进来，再决定是否晋升到长期记忆。
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-white">长期记忆目标</h3>
              <p className="text-sm text-gray-500 mt-1">
                这里展示会被恢复流程优先读取的记忆文件摘要。
              </p>
            </div>

            {(overview?.durable_targets || []).map((target) => (
              <div key={target.id} className="rounded-2xl border border-dark-500 bg-dark-700 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-white font-medium">{target.label}</h4>
                    <p className="text-sm text-gray-400 mt-1">{target.description}</p>
                  </div>
                  <span className="rounded-full bg-claw-500/10 px-2.5 py-1 text-xs text-claw-300">
                    {target.item_count} 条
                  </span>
                </div>

                <div className="rounded-xl bg-dark-800/70 border border-dark-500 px-3 py-2 mt-4">
                  <p className="text-xs text-gray-500">{target.file_label}</p>
                  <p className="text-xs text-gray-600 mt-1">最近更新: {formatDateTime(target.last_updated)}</p>
                </div>

                {target.preview_items.length > 0 ? (
                  <div className="space-y-2 mt-4">
                    {target.preview_items.map((item) => (
                      <div
                        key={`${target.id}-${item}`}
                        className="rounded-lg border border-dark-500 bg-dark-600/50 px-3 py-2 text-sm text-gray-200"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-dark-500 bg-dark-800/50 px-3 py-5 mt-4 text-sm text-gray-500 text-center">
                    这个文件里还没有可预览的条目。
                  </div>
                )}
              </div>
            ))}

            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-yellow-300 mt-0.5" />
                <div>
                  <p className="text-yellow-100 font-medium">为什么不直接写系统基线</p>
                  <p className="text-sm text-yellow-200/80 mt-2">
                    `20-system-baseline.md`、`95-handoff.md`、`99-latest-context.md` 都是脚本生成的，
                    直接写进去会被后续刷新覆盖。长期记忆只落到稳定文件。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
