import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Coins, MessageSquare, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { api, type UsageOverview as UsageOverviewData } from '../../lib/tauri';

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('zh-CN').format(value);
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

function formatAge(ageMs: number | null | undefined) {
  if (typeof ageMs !== 'number' || Number.isNaN(ageMs) || ageMs < 0) return '未知';
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function getSessionLabel(key: string) {
  if (key === 'agent:main:main') return '主会话';
  if (key.includes(':telegram:')) return 'Telegram';
  if (key.includes(':discord:')) return 'Discord';
  if (key.includes(':slack:')) return 'Slack';
  if (key.includes(':feishu:')) return '飞书';
  if (key.includes(':whatsapp:')) return 'WhatsApp';
  if (key.includes(':cron:')) return '定时任务';
  return '其他会话';
}

function getUsageTone(percent: number) {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-claw-500';
}

export function UsageOverview() {
  const [overview, setOverview] = useState<UsageOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await api.getUsageOverview();
      setOverview(result);
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

  return (
    <section className="bg-dark-700 rounded-2xl border border-dark-500 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins size={16} className="text-claw-400" />
            <h3 className="text-sm font-semibold text-white">Token / 对话消耗</h3>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            展示 provider 配额窗口和最近会话的 token 消耗。
          </p>
        </div>
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
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">读取消耗数据失败</p>
              <p className="mt-1 text-xs text-red-200/80">{error}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <Activity size={14} />
            <span className="text-xs">Provider</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {loading ? '...' : formatNumber(overview?.providers.length || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <MessageSquare size={14} />
            <span className="text-xs">最近会话</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {loading ? '...' : formatNumber(overview?.total_sessions || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-dark-500 bg-dark-800 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <Coins size={14} />
            <span className="text-xs">累计 token 估算</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-white">
            {loading ? '...' : formatNumber(overview?.total_token_estimate || 0)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            更新于 {loading ? '...' : formatDateTime(overview?.updated_at)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">Provider 用量</h4>
            <span className="text-xs text-gray-500">来源: `openclaw channels list --json`</span>
          </div>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1].map((item) => (
                <div key={item} className="h-32 animate-pulse rounded-xl border border-dark-500 bg-dark-800" />
              ))}
            </div>
          ) : overview?.providers.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {overview.providers.map((provider) => (
                <div key={provider.provider} className="rounded-xl border border-dark-500 bg-dark-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{provider.display_name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {provider.plan ? `计划 ${provider.plan}` : provider.provider}
                      </p>
                    </div>
                    {provider.error ? (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200">
                        异常
                      </span>
                    ) : (
                      <span className="rounded-full border border-dark-400 bg-dark-700 px-2 py-1 text-[11px] text-gray-300">
                        正常
                      </span>
                    )}
                  </div>
                  {provider.error ? (
                    <p className="mt-3 text-xs leading-5 text-red-200/80">{provider.error}</p>
                  ) : provider.windows.length ? (
                    <div className="mt-4 space-y-3">
                      {provider.windows.map((window) => (
                        <div key={`${provider.provider}-${window.label}`} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{window.label}</span>
                            <span>{window.used_percent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-dark-600">
                            <div
                              className={clsx('h-full rounded-full transition-all', getUsageTone(window.used_percent))}
                              style={{ width: `${Math.max(2, Math.min(window.used_percent, 100))}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-gray-500">
                            重置时间 {formatDateTime(window.reset_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-gray-500">当前 provider 没有返回配额窗口信息。</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dark-500 bg-dark-800 px-4 py-8 text-center text-sm text-gray-500">
              暂时没有 provider 用量数据。
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-white">最近会话</h4>
            <span className="text-xs text-gray-500">已过滤调试型 `:run:` 会话</span>
          </div>
          <div className="space-y-3">
            {loading ? (
              [0, 1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-xl border border-dark-500 bg-dark-800" />
              ))
            ) : overview?.sessions.length ? (
              overview.sessions.slice(0, 6).map((session) => (
                <div key={session.key} className="rounded-xl border border-dark-500 bg-dark-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{getSessionLabel(session.key)}</p>
                      <p className="mt-1 truncate text-[11px] text-gray-500">{session.key}</p>
                    </div>
                    <span className="rounded-full border border-dark-400 bg-dark-700 px-2 py-1 text-[11px] text-gray-300">
                      {formatAge(session.age_ms)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                    <div>
                      <p>输入</p>
                      <p className="mt-1 text-sm font-medium text-white">{formatNumber(session.input_tokens)}</p>
                    </div>
                    <div>
                      <p>输出</p>
                      <p className="mt-1 text-sm font-medium text-white">{formatNumber(session.output_tokens)}</p>
                    </div>
                    <div>
                      <p>总 token</p>
                      <p className="mt-1 text-sm font-medium text-white">{formatNumber(session.total_tokens)}</p>
                    </div>
                    <div>
                      <p>上下文</p>
                      <p className="mt-1 text-sm font-medium text-white">{formatNumber(session.context_tokens)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-400">
                    {session.model_provider ? (
                      <span className="rounded-full border border-dark-400 bg-dark-700 px-2 py-1">
                        {session.model_provider}
                      </span>
                    ) : null}
                    {session.model ? (
                      <span className="rounded-full border border-dark-400 bg-dark-700 px-2 py-1">
                        {session.model}
                      </span>
                    ) : null}
                    {session.kind ? (
                      <span className="rounded-full border border-dark-400 bg-dark-700 px-2 py-1">
                        {session.kind}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dark-500 bg-dark-800 px-4 py-8 text-center text-sm text-gray-500">
                暂时没有可展示的会话消耗数据。
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
