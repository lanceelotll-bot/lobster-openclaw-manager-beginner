import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Loader2, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import {
  api,
  type CronJobDraft,
  type CronJobItem,
  type CronOverview as CronOverviewData,
} from '../../lib/tauri';

type FlashState =
  | {
      type: 'success' | 'error';
      message: string;
    }
  | null;

function getDefaultTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}

function createEmptyDraft(primaryModel: string | null = null): CronJobDraft {
  return {
    id: null,
    name: '',
    description: '',
    scheduleType: 'cron',
    scheduleValue: '0 9 * * *',
    timezone: getDefaultTimezone(),
    payloadKind: 'agentTurn',
    message: '',
    model: primaryModel || '',
    sessionTarget: 'main',
    enabled: true,
    announce: false,
    channel: '',
    to: '',
    accountId: '',
    wakeMode: 'next-heartbeat',
    notificationEnabled: false,
    notificationChannelId: '',
    notificationOnSuccess: true,
    notificationOnFailure: true,
  };
}

function toDraft(job: CronJobItem): CronJobDraft {
  return {
    id: job.id,
    name: job.name,
    description: job.description || '',
    scheduleType: job.schedule.kind === 'every' ? 'every' : job.schedule.kind === 'at' ? 'at' : 'cron',
    scheduleValue: job.schedule.expr || job.schedule.every || job.schedule.at || '',
    timezone: job.schedule.tz || getDefaultTimezone(),
    payloadKind: job.payload.kind === 'systemEvent' ? 'systemEvent' : 'agentTurn',
    message: job.payload.message || job.payload.text || '',
    model: job.payload.model || '',
    sessionTarget: job.session_target === 'isolated' ? 'isolated' : 'main',
    enabled: job.enabled,
    announce: job.delivery.mode === 'announce',
    channel: job.delivery.channel || '',
    to: job.delivery.to || '',
    accountId: job.delivery.account_id || '',
    wakeMode: job.wake_mode === 'now' ? 'now' : 'next-heartbeat',
    notificationEnabled: job.notification?.enabled === true,
    notificationChannelId: job.notification?.channel_id || '',
    notificationOnSuccess: job.notification?.notify_on?.includes('success') ?? true,
    notificationOnFailure: job.notification?.notify_on?.includes('failure') ?? true,
  };
}

function formatDateTime(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '未知';
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getScheduleText(job: CronJobItem) {
  if (job.schedule.kind === 'every' && job.schedule.every) return `每 ${job.schedule.every}`;
  if (job.schedule.kind === 'at' && job.schedule.at) return `一次性 ${job.schedule.at}`;
  if (job.schedule.expr) {
    return `${job.schedule.expr}${job.schedule.tz ? ` · ${job.schedule.tz}` : ''}`;
  }
  return '未配置';
}

function getStatusTone(job: CronJobItem) {
  const status = job.state.last_status || job.state.last_run_status || 'idle';
  if (status === 'error') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (status === 'ok') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  return 'border-dark-400 bg-dark-700 text-gray-300';
}

function getStatusText(job: CronJobItem) {
  const status = job.state.last_status || job.state.last_run_status || 'idle';
  if (status === 'error') return '最近失败';
  if (status === 'ok') return '最近成功';
  return '等待执行';
}

function getEnabledJobs(overview: CronOverviewData | null) {
  return (overview?.jobs || []).filter((job) => job.enabled).length;
}

function getNotificationStatusText(status: string | null | undefined) {
  if (status === 'sent') return '最近发送成功';
  if (status === 'failed') return '最近发送失败';
  if (status === 'skipped_event') return '本次未命中通知条件';
  if (status === 'skipped_missing_webhook') return '缺少 Webhook';
  if (status === 'disabled') return '通知渠道未启用';
  return '暂无发送记录';
}

export function Cron() {
  const [overview, setOverview] = useState<CronOverviewData | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [primaryModel, setPrimaryModel] = useState<string | null>(null);
  const [modelCatalogIssue, setModelCatalogIssue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<CronJobDraft>(createEmptyDraft());

  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const [cronResult, aiConfigResult] = await Promise.allSettled([
        api.getCronOverview(),
        api.getAIConfig(),
      ]);

      if (cronResult.status === 'fulfilled') {
        setOverview(cronResult.value);
      } else {
        setOverview(null);
        setError(String(cronResult.reason));
      }

      if (aiConfigResult.status === 'fulfilled') {
        setAvailableModels(aiConfigResult.value.available_models || []);
        setPrimaryModel(aiConfigResult.value.primary_model || null);
        setModelCatalogIssue(null);
      } else {
        setAvailableModels([]);
        setPrimaryModel(null);
        setModelCatalogIssue('可用模型列表读取失败，暂时只能保留已有模型值。');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreate = () => {
    setFlash(null);
    setDraft(createEmptyDraft(primaryModel));
    setEditorOpen(true);
  };

  const openEdit = (job: CronJobItem) => {
    setFlash(null);
    setDraft(toDraft(job));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setDraft(createEmptyDraft(primaryModel));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.notificationEnabled && !draft.notificationChannelId) {
      setFlash({ type: 'error', message: '已开启单向通知，但还没有选择通知渠道。' });
      return;
    }
    if (draft.notificationEnabled && !draft.notificationOnSuccess && !draft.notificationOnFailure) {
      setFlash({ type: 'error', message: '单向通知至少要勾选成功或失败其中一种结果。' });
      return;
    }
    setSaving(true);
    setFlash(null);
    try {
      if (draft.id) {
        await api.updateCronJob(draft);
        setFlash({ type: 'success', message: '定时任务已更新。' });
      } else {
        await api.createCronJob(draft);
        setFlash({ type: 'success', message: '定时任务已创建。' });
      }
      setEditorOpen(false);
      setDraft(createEmptyDraft(primaryModel));
      await loadData(true);
    } catch (e) {
      setFlash({ type: 'error', message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (job: CronJobItem) => {
    setWorkingId(job.id);
    setFlash(null);
    try {
      if (job.enabled) {
        await api.disableCronJob(job.id);
        setFlash({ type: 'success', message: `${job.name} 已停用。` });
      } else {
        await api.enableCronJob(job.id);
        setFlash({ type: 'success', message: `${job.name} 已启用。` });
      }
      await loadData(true);
    } catch (e) {
      setFlash({ type: 'error', message: String(e) });
    } finally {
      setWorkingId(null);
    }
  };

  const handleRun = async (job: CronJobItem) => {
    setWorkingId(job.id);
    setFlash(null);
    try {
      await api.runCronJob(job.id);
      setFlash({ type: 'success', message: `${job.name} 已手动触发。` });
      await loadData(true);
    } catch (e) {
      setFlash({ type: 'error', message: String(e) });
    } finally {
      setWorkingId(null);
    }
  };

  const handleRemove = async (job: CronJobItem) => {
    if (!window.confirm(`确认删除定时任务「${job.name}」？`)) return;
    setWorkingId(job.id);
    setFlash(null);
    try {
      await api.removeCronJob(job.id);
      setFlash({ type: 'success', message: `${job.name} 已删除。` });
      await loadData(true);
    } catch (e) {
      setFlash({ type: 'error', message: String(e) });
    } finally {
      setWorkingId(null);
    }
  };

  const modelOptions =
    draft.model && !availableModels.includes(draft.model)
      ? [draft.model, ...availableModels]
      : availableModels;
  const modelHelpText =
    modelCatalogIssue
      ? modelCatalogIssue
      : draft.id && !draft.model
      ? primaryModel
        ? `这个任务当前没有固定模型，运行时会跟随主模型（当前是 ${primaryModel}）。保存后会继续保持“跟随主模型”。`
        : '这个任务当前没有固定模型，运行时会跟随主模型。'
      : draft.model && !availableModels.includes(draft.model)
      ? '这个任务当前引用的模型已经不在可用列表里，建议改成下拉中的模型。'
      : availableModels.length > 0
      ? `新建任务默认会使用当前主模型。需要跟随未来主模型时，可选“跟随主模型”。共 ${availableModels.length} 个可用模型。`
      : '暂未读取到可用模型。';
  const notificationChannels = (overview?.notification_channels || []).filter((item) => item.supported);

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="space-y-6">
        <section className="bg-dark-700 rounded-2xl border border-dark-500 p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 size={16} className="text-claw-400" />
                <h3 className="text-sm font-semibold text-white">定时任务管理</h3>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                集成 OpenClaw 原生命令：查看调度器状态、编辑任务、立即运行。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRefreshing(true);
                  void loadData(true);
                }}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-dark-500 bg-dark-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-dark-400 hover:text-white disabled:opacity-60"
              >
                <RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} />
                刷新
              </button>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-claw-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-claw-400"
              >
                <Plus size={14} />
                新建任务
              </button>
            </div>
          </div>

          {flash ? (
            <div
              className={clsx(
                'rounded-xl border px-4 py-3 text-sm',
                flash.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200'
              )}
            >
              {flash.message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">读取定时任务失败</p>
                  <p className="mt-1 text-xs text-red-200/80">{error}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
              <p className="text-xs text-gray-400">调度器</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {loading ? '...' : overview?.scheduler?.enabled ? '已启用' : '未启用'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {overview?.scheduler?.store_path || '未返回存储路径'}
              </p>
            </div>
            <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
              <p className="text-xs text-gray-400">任务总数</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {loading ? '...' : overview?.jobs.length || 0}
              </p>
            </div>
            <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
              <p className="text-xs text-gray-400">已启用</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {loading ? '...' : getEnabledJobs(overview)}
              </p>
            </div>
            <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
              <p className="text-xs text-gray-400">下次唤醒</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {loading ? '...' : formatDateTime(overview?.scheduler?.next_wake_at_ms)}
              </p>
            </div>
          </div>
        </section>

        {editorOpen ? (
          <section className="bg-dark-700 rounded-2xl border border-dark-500 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {draft.id ? '编辑定时任务' : '新建定时任务'}
                </h3>
                <p className="mt-1 text-xs text-gray-400">
                  先用最常见字段完成配置，复杂参数仍然保留给 CLI。
                </p>
              </div>
              <button
                onClick={closeEditor}
                disabled={saving}
                className="rounded-lg border border-dark-500 bg-dark-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-dark-400 hover:text-white disabled:opacity-60"
              >
                取消
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">任务名称</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                    placeholder="例如：每日摘要推送"
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">描述</span>
                  <input
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                    placeholder="给自己留的备注，可选"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">调度类型</span>
                  <select
                    value={draft.scheduleType}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        scheduleType: event.target.value as CronJobDraft['scheduleType'],
                      })
                    }
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                  >
                    <option value="cron">Cron 表达式</option>
                    <option value="every">每隔一段时间</option>
                    <option value="at">一次性执行</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">触发时间</span>
                  <input
                    value={draft.scheduleValue}
                    onChange={(event) => setDraft({ ...draft, scheduleValue: event.target.value })}
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                    placeholder={
                      draft.scheduleType === 'cron'
                        ? '0 9 * * *'
                        : draft.scheduleType === 'every'
                        ? '30m'
                        : '2026-03-08T09:00:00+08:00'
                    }
                    required
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">会话策略</span>
                  <select
                    value={draft.sessionTarget}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        sessionTarget: event.target.value as CronJobDraft['sessionTarget'],
                      })
                    }
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                  >
                    <option value="main">复用主会话</option>
                    <option value="isolated">独立会话</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">唤醒模式</span>
                  <select
                    value={draft.wakeMode}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        wakeMode: event.target.value as CronJobDraft['wakeMode'],
                      })
                    }
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                  >
                    <option value="next-heartbeat">下一个心跳</option>
                    <option value="now">立即唤醒</option>
                  </select>
                </label>
                {draft.scheduleType === 'cron' ? (
                  <label className="space-y-2">
                    <span className="text-xs text-gray-400">时区</span>
                    <input
                      value={draft.timezone}
                      onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
                      className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                      placeholder="Asia/Shanghai"
                    />
                  </label>
                ) : null}
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">任务类型</span>
                  <select
                    value={draft.payloadKind}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        payloadKind: event.target.value as CronJobDraft['payloadKind'],
                      })
                    }
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                  >
                    <option value="agentTurn">Agent 对话</option>
                    <option value="systemEvent">系统事件</option>
                  </select>
                </label>
                {draft.payloadKind === 'agentTurn' ? (
                  <label className="space-y-2">
                    <span className="text-xs text-gray-400">模型覆盖</span>
                    <select
                      value={draft.model}
                      onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                      className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                    >
                      <option value="">
                        {primaryModel ? `跟随主模型（当前: ${primaryModel}）` : '跟随主模型'}
                      </option>
                      {modelOptions.map((modelId) => (
                        <option key={modelId} value={modelId}>
                          {modelId}
                          {modelId === primaryModel ? ' · 默认' : ''}
                          {modelId === draft.model && !availableModels.includes(modelId)
                            ? ' · 当前任务使用，但未在可用列表中'
                            : ''}
                        </option>
                      ))}
                    </select>
                    <p
                      className={clsx(
                        'text-xs',
                        modelCatalogIssue || (draft.model && !availableModels.includes(draft.model))
                          ? 'text-amber-300'
                          : 'text-gray-500'
                      )}
                    >
                      {modelHelpText}
                    </p>
                  </label>
                ) : null}
              </div>

              <label className="space-y-2 block">
                <span className="text-xs text-gray-400">
                  {draft.payloadKind === 'systemEvent' ? '系统事件内容' : '任务消息'}
                </span>
                <textarea
                  value={draft.message}
                  onChange={(event) => setDraft({ ...draft, message: event.target.value })}
                  className="min-h-36 w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                  placeholder={
                    draft.payloadKind === 'systemEvent'
                      ? '填入系统提醒内容'
                      : '填入让 agent 执行的任务说明'
                  }
                  required
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">对话渠道</span>
                  <input
                    value={draft.channel}
                    onChange={(event) => setDraft({ ...draft, channel: event.target.value })}
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                    placeholder="telegram / discord / last"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">投递目标</span>
                  <input
                    value={draft.to}
                    onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                    placeholder="chatId / channelId / userId"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-gray-400">账号 ID</span>
                  <input
                    value={draft.accountId}
                    onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}
                    className="w-full rounded-xl border border-dark-500 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                    placeholder="多账号场景可选"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-dark-500 bg-dark-800 px-4 py-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">单向通知渠道</p>
                    <p className="mt-1 text-xs text-gray-500">
                      任务执行完成后，由 Manager 把摘要推送到飞书或钉钉，不参与会话，也不占用聊天上下文。
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={draft.notificationEnabled}
                      onChange={(event) =>
                        setDraft({ ...draft, notificationEnabled: event.target.checked })
                      }
                      className="h-4 w-4 rounded border-dark-500 bg-dark-900 text-claw-500"
                    />
                    启用单向通知
                  </label>
                </div>

                {draft.notificationEnabled ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-xs text-gray-400">通知渠道</span>
                      <select
                        value={draft.notificationChannelId}
                        onChange={(event) =>
                          setDraft({ ...draft, notificationChannelId: event.target.value })
                        }
                        className="w-full rounded-xl border border-dark-500 bg-dark-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-claw-400"
                      >
                        <option value="">先选择一个单向通知渠道</option>
                        {notificationChannels.map((channel) => (
                          <option
                            key={channel.id}
                            value={channel.id}
                            disabled={!channel.enabled || !channel.configured}
                          >
                            {channel.name || channel.label}
                            {!channel.enabled ? ' · 未启用' : !channel.configured ? ' · 未配置' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500">
                        先到设置页填好飞书或钉钉 Webhook，这里才会真正可用。
                      </p>
                    </label>

                    <div className="space-y-2">
                      <span className="text-xs text-gray-400">通知条件</span>
                      <div className="flex flex-wrap gap-4 rounded-xl border border-dark-500 bg-dark-900 px-4 py-3">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={draft.notificationOnSuccess}
                            onChange={(event) =>
                              setDraft({ ...draft, notificationOnSuccess: event.target.checked })
                            }
                            className="h-4 w-4 rounded border-dark-500 bg-dark-900 text-claw-500"
                          />
                          成功时通知
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={draft.notificationOnFailure}
                            onChange={(event) =>
                              setDraft({ ...draft, notificationOnFailure: event.target.checked })
                            }
                            className="h-4 w-4 rounded border-dark-500 bg-dark-900 text-claw-500"
                          />
                          失败时通知
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">
                        当前版本发送执行摘要和错误信息，不发送完整会话内容。
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-5 rounded-xl border border-dark-500 bg-dark-800 px-4 py-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-dark-500 bg-dark-900 text-claw-500"
                  />
                  创建后启用
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={draft.announce}
                    onChange={(event) => setDraft({ ...draft, announce: event.target.checked })}
                    className="h-4 w-4 rounded border-dark-500 bg-dark-900 text-claw-500"
                  />
                  将结果投递到对话渠道
                </label>
                <p className="text-xs text-gray-500">
                  这里是 OpenClaw 原生会话投递；上面的单向通知由 Manager 额外发送摘要。
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={saving}
                  className="rounded-lg border border-dark-500 bg-dark-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-dark-400 hover:text-white disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-claw-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-claw-400 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {draft.id ? '保存修改' : '创建任务'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="space-y-4">
          {loading ? (
            [0, 1].map((item) => (
              <div key={item} className="h-56 animate-pulse rounded-2xl border border-dark-500 bg-dark-700" />
            ))
          ) : overview?.jobs.length ? (
            overview.jobs.map((job) => {
              const busy = workingId === job.id;
              return (
                <article
                  key={job.id}
                  className="rounded-2xl border border-dark-500 bg-dark-700 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">{job.name}</h3>
                        <span
                          className={clsx(
                            'rounded-full border px-2 py-1 text-[11px]',
                            job.enabled
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : 'border-dark-400 bg-dark-800 text-gray-300'
                          )}
                        >
                          {job.enabled ? '启用中' : '已停用'}
                        </span>
                        <span className={clsx('rounded-full border px-2 py-1 text-[11px]', getStatusTone(job))}>
                          {getStatusText(job)}
                        </span>
                      </div>
                      {job.description ? (
                        <p className="mt-2 text-sm text-gray-400">{job.description}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openEdit(job)}
                        className="rounded-lg border border-dark-500 bg-dark-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-dark-400 hover:text-white"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleToggle(job)}
                        disabled={busy}
                        className="rounded-lg border border-dark-500 bg-dark-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-dark-400 hover:text-white disabled:opacity-60"
                      >
                        {job.enabled ? '停用' : '启用'}
                      </button>
                      <button
                        onClick={() => handleRun(job)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-dark-500 bg-dark-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-dark-400 hover:text-white disabled:opacity-60"
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                        立即运行
                      </button>
                      <button
                        onClick={() => handleRemove(job)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
                      >
                        <Trash2 size={12} />
                        删除
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
                      <p className="text-xs text-gray-400">计划</p>
                      <p className="mt-2 text-sm font-medium text-white">{getScheduleText(job)}</p>
                    </div>
                    <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
                      <p className="text-xs text-gray-400">任务类型</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {job.payload.kind === 'systemEvent' ? '系统事件' : 'Agent 对话'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        会话 {job.session_target || 'main'} · 唤醒 {job.wake_mode || 'now'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
                      <p className="text-xs text-gray-400">下次执行</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatDateTime(job.state.next_run_at_ms)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
                      <p className="text-xs text-gray-400">最近执行</p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {formatDateTime(job.state.last_run_at_ms)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {job.state.last_duration_ms ? `${job.state.last_duration_ms} ms` : '无耗时数据'}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
                      <p className="text-xs text-gray-400">
                        {job.payload.kind === 'systemEvent' ? '事件内容' : '任务内容'}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">
                        {job.payload.message || job.payload.text || '无内容'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-dark-500 bg-dark-800 p-4 space-y-3">
                      <div>
                        <p className="text-xs text-gray-400">模型</p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {job.payload.model || (primaryModel ? `跟随主模型（当前: ${primaryModel}）` : '跟随主模型')}
                        </p>
                        {job.payload.model && availableModels.length > 0 && !availableModels.includes(job.payload.model) ? (
                          <p className="mt-1 text-xs text-amber-300">当前任务使用的模型已不在可用列表中。</p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">结果投递</p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {job.delivery.mode || '不投递'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {job.delivery.channel || '未指定渠道'}
                          {job.delivery.to ? ` · ${job.delivery.to}` : ''}
                          {job.delivery.account_id ? ` · ${job.delivery.account_id}` : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">单向通知</p>
                        <p className="mt-2 text-sm font-medium text-white">
                          {job.notification?.enabled
                            ? job.notification.channel_label || job.notification.channel_id || '已启用'
                            : '未启用'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {job.notification?.enabled
                            ? `触发条件：${
                                job.notification.notify_on.includes('success') &&
                                job.notification.notify_on.includes('failure')
                                  ? '成功 + 失败'
                                  : job.notification.notify_on.includes('success')
                                  ? '仅成功'
                                  : '仅失败'
                              }`
                            : '不会额外推送到飞书/钉钉等单向通知渠道'}
                        </p>
                        {job.notification?.enabled ? (
                          <p className="mt-1 text-xs text-gray-500">
                            {getNotificationStatusText(job.notification.last_delivery_status)}
                            {job.notification.last_delivery_at
                              ? ` · ${new Date(job.notification.last_delivery_at).toLocaleString('zh-CN', {
                                  hour12: false,
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : ''}
                          </p>
                        ) : null}
                        {job.notification?.last_delivery_error ? (
                          <p className="mt-2 text-xs leading-5 text-amber-300">
                            {job.notification.last_delivery_error}
                          </p>
                        ) : null}
                      </div>
                      {job.state.last_error ? (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs leading-5 text-red-200">
                          {job.state.last_error}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dark-500 bg-dark-900 px-3 py-3 text-xs text-gray-500">
                          最近没有错误。
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dark-500 bg-dark-700 px-6 py-12 text-center">
              <p className="text-sm text-white">暂时没有定时任务</p>
              <p className="mt-2 text-xs text-gray-500">可以先建一个每日提醒，后续再到 CLI 做高级参数。</p>
              <button
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-claw-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-claw-400"
              >
                <Plus size={14} />
                新建任务
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
