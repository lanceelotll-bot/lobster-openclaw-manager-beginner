import { AlertCircle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { AlertEvent, AlertRuntimeStatus } from '../../lib/tauri';

interface AlertEventsCardProps {
  events: AlertEvent[];
  runtimeStatus: AlertRuntimeStatus | null;
}

function formatRelativeTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function eventStyle(type: AlertEvent['type']) {
  switch (type) {
    case 'down':
      return {
        icon: AlertCircle,
        label: '异常下线',
        tone: 'text-red-300 bg-red-500/10 border-red-500/20',
      };
    case 'recovered':
      return {
        icon: CheckCircle2,
        label: '恢复上线',
        tone: 'text-green-300 bg-green-500/10 border-green-500/20',
      };
    case 'restart_succeeded':
      return {
        icon: RefreshCw,
        label: '重启成功',
        tone: 'text-claw-200 bg-claw-500/10 border-claw-500/20',
      };
    default:
      return {
        icon: ShieldAlert,
        label: '重启失败',
        tone: 'text-yellow-200 bg-yellow-500/10 border-yellow-500/20',
      };
  }
}

function deliveryLabel(status: string) {
  switch (status) {
    case 'sent':
      return '已发送';
    case 'disabled':
      return '已关闭';
    case 'disabled_event':
      return '该事件未启用';
    case 'skipped_missing_channel':
      return '未配置渠道';
    case 'skipped_missing_target':
      return '未填写目标';
    case 'failed':
      return '发送失败';
    default:
      return status || '未知';
  }
}

export function AlertEventsCard({ events, runtimeStatus }: AlertEventsCardProps) {
  const isWebReplica = import.meta.env.MODE === 'web';

  if (!isWebReplica) return null;

  return (
    <div className="bg-dark-700 rounded-2xl border border-dark-500 p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">状态通知</h3>
          <p className="mt-1 text-sm text-gray-500">异常下线、自动重启和恢复上线都会记录在这里。</p>
        </div>
        <div className="rounded-xl bg-dark-600 px-3 py-2 text-right">
          <p className="text-xs text-gray-500">监控状态</p>
          <p className={clsx('text-sm font-medium', runtimeStatus?.monitor_active ? 'text-green-300' : 'text-gray-400')}>
            {runtimeStatus?.paused_reason === 'manual_stop'
              ? '已暂停（手动停止）'
              : runtimeStatus?.monitor_active
              ? '运行中'
              : '未启动'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {runtimeStatus?.cooldown_remaining_ms
              ? `冷却 ${Math.ceil(runtimeStatus.cooldown_remaining_ms / 1000)} 秒`
              : `连续掉线计数 ${runtimeStatus?.consecutive_down_polls ?? 0}`}
          </p>
        </div>
      </div>

      {runtimeStatus?.issues?.length ? (
        <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          {runtimeStatus.issues.join(' ')}
        </div>
      ) : null}

      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dark-500 bg-dark-600/60 px-4 py-5 text-sm text-gray-400">
            暂无状态事件。
          </div>
        ) : (
          events.map((event) => {
            const style = eventStyle(event.type);
            const Icon = style.icon;
            return (
              <div
                key={event.id}
                className="rounded-xl border border-dark-500 bg-dark-600/60 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs', style.tone)}>
                        <Icon size={12} />
                        {style.label}
                      </span>
                      <span className="text-xs text-gray-500">{formatRelativeTimestamp(event.timestamp)}</span>
                    </div>
                    <p className="mt-2 text-sm text-white">{event.message}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      来源: {event.source} · 渠道发送: {deliveryLabel(event.delivery_status)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
