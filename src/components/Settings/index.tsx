import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  Bell,
  FolderOpen,
  Loader2,
  Save,
  Send,
  Shield,
  Trash2,
  User,
  X,
  FileCode,
} from 'lucide-react';
import {
  api,
  AlertRuntimeStatus,
  AlertSettings as AlertSettingsShape,
  ManagerNotificationChannel,
} from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';

interface InstallResult {
  success: boolean;
  message: string;
  error?: string;
}

interface IdentityState {
  botName: string;
  userName: string;
  timezone: string;
}

interface SettingsProps {
  onEnvironmentChange?: () => void;
  alertRuntimeStatus?: AlertRuntimeStatus | null;
  onAlertStateChange?: () => Promise<void> | void;
}

const IDENTITY_STORAGE_KEY = 'openclaw-manager.identity';
const DEFAULT_IDENTITY: IdentityState = {
  botName: 'Clawd',
  userName: '主人',
  timezone: 'Asia/Shanghai',
};

const DEFAULT_ALERT_SETTINGS: AlertSettingsShape = {
  enabled: false,
  channel_type: null,
  target: '',
  auto_restart: true,
  confirm_down_polls: 2,
  cooldown_seconds: 300,
  enabled_events: ['down', 'recovered', 'restart_succeeded', 'restart_failed'],
};

export function Settings({ onEnvironmentChange, alertRuntimeStatus, onAlertStateChange }: SettingsProps) {
  const isWebReplica = import.meta.env.MODE === 'web';
  const addNotification = useAppStore((state) => state.addNotification);

  const [identity, setIdentity] = useState<IdentityState>(DEFAULT_IDENTITY);
  const [saving, setSaving] = useState(false);
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallResult, setUninstallResult] = useState<InstallResult | null>(null);
  const [alertSettings, setAlertSettings] = useState<AlertSettingsShape>(DEFAULT_ALERT_SETTINGS);
  const [alertChannels, setAlertChannels] = useState<
    Array<{
      id: string;
      label: string;
      target_label: string;
      target_placeholder: string;
      target_field: string;
      configured: boolean;
      running: boolean;
      default_target: string;
    }>
  >([]);
  const [alertIssues, setAlertIssues] = useState<string[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertTesting, setAlertTesting] = useState(false);
  const [alertTestResult, setAlertTestResult] = useState<string | null>(null);
  const [notificationChannels, setNotificationChannels] = useState<ManagerNotificationChannel[]>([]);
  const [notificationIssues, setNotificationIssues] = useState<string[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationTestingId, setNotificationTestingId] = useState<string | null>(null);
  const [notificationTestResults, setNotificationTestResults] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<IdentityState>;
      setIdentity({
        botName: parsed.botName || DEFAULT_IDENTITY.botName,
        userName: parsed.userName || DEFAULT_IDENTITY.userName,
        timezone: parsed.timezone || DEFAULT_IDENTITY.timezone,
      });
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (!isWebReplica) return;

    let cancelled = false;
    const loadWebSettings = async () => {
      setAlertsLoading(true);
      setNotificationsLoading(true);
      try {
        const [alertPayload, notificationPayload] = await Promise.all([
          api.getAlertSettings(),
          api.getNotificationChannels(),
        ]);
        if (cancelled) return;
        setAlertSettings(alertPayload.settings);
        setAlertChannels(alertPayload.available_channels);
        setAlertIssues(alertPayload.issues);
        setNotificationChannels(notificationPayload.channels);
        setNotificationIssues(notificationPayload.issues);
      } catch (error) {
        if (!cancelled) {
          const message = String(error);
          setAlertIssues([`加载状态通知配置失败: ${message}`]);
          setNotificationIssues([`加载单向通知渠道失败: ${message}`]);
        }
      } finally {
        if (!cancelled) {
          setAlertsLoading(false);
          setNotificationsLoading(false);
        }
      }
    };

    void loadWebSettings();
    return () => {
      cancelled = true;
    };
  }, [isWebReplica]);

  const selectedChannel = useMemo(
    () => alertChannels.find((item) => item.id === alertSettings.channel_type) || null,
    [alertChannels, alertSettings.channel_type]
  );

  const updateNotificationChannel = (channelId: string, patch: Partial<ManagerNotificationChannel>) => {
    setNotificationChannels((current) =>
      current.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));

      if (isWebReplica) {
        const [alertPayload, notificationPayload] = await Promise.all([
          api.saveAlertSettings(alertSettings),
          api.saveNotificationChannels(notificationChannels),
        ]);
        setAlertSettings(alertPayload.settings);
        setAlertChannels(alertPayload.available_channels);
        setAlertIssues(alertPayload.issues);
        setNotificationChannels(notificationPayload.channels);
        setNotificationIssues(notificationPayload.issues);
        await onAlertStateChange?.();
      }

      addNotification({
        type: 'success',
        title: '设置已保存',
        message: isWebReplica
          ? '身份配置、状态通知和单向通知渠道已更新。'
          : '身份配置已保存在本机浏览器中。',
      });
    } catch (error) {
      addNotification({
        type: 'error',
        title: '保存失败',
        message: String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestAlert = async () => {
    if (!isWebReplica) return;
    setAlertTesting(true);
    setAlertTestResult(null);
    try {
      const result = await api.sendTestAlert(alertSettings);
      setAlertTestResult(`${result.message}（${result.delivery_status}）`);
      addNotification({
        type: result.success ? 'success' : 'warning',
        title: result.success ? '测试通知已发送' : '测试通知未发送',
        message: `${result.message}（${result.delivery_status}）`,
      });
    } catch (error) {
      setAlertTestResult(`测试通知失败: ${String(error)}`);
      addNotification({
        type: 'error',
        title: '测试通知失败',
        message: String(error),
      });
    } finally {
      setAlertTesting(false);
    }
  };

  const handleTestNotificationChannel = async (channelId: string) => {
    if (!isWebReplica) return;
    setNotificationTestingId(channelId);
    try {
      const result = await api.sendTestNotificationChannel(channelId);
      setNotificationTestResults((current) => ({
        ...current,
        [channelId]: `${result.message}（${result.delivery_status}）`,
      }));
      addNotification({
        type: result.success ? 'success' : 'warning',
        title: result.success ? '测试通知已发送' : '测试通知未发送',
        message: `${result.message}（${result.delivery_status}）`,
      });
    } catch (error) {
      const message = String(error);
      setNotificationTestResults((current) => ({
        ...current,
        [channelId]: `测试通知失败: ${message}`,
      }));
      addNotification({
        type: 'error',
        title: '测试通知失败',
        message,
      });
    } finally {
      setNotificationTestingId(null);
    }
  };

  const openConfigDir = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      const home = await invoke<{ config_dir: string }>('get_system_info');
      await open(home.config_dir);
    } catch (error) {
      addNotification({
        type: 'error',
        title: '打开目录失败',
        message: String(error),
      });
    }
  };

  const handleUninstall = async () => {
    setUninstalling(true);
    setUninstallResult(null);
    try {
      const result = await invoke<InstallResult>('uninstall_openclaw');
      setUninstallResult(result);
      if (result.success) {
        onEnvironmentChange?.();
        setTimeout(() => {
          setShowUninstallConfirm(false);
        }, 2000);
      }
    } catch (error) {
      setUninstallResult({
        success: false,
        message: '卸载过程中发生错误',
        error: String(error),
      });
    } finally {
      setUninstalling(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-3xl space-y-6">
        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-claw-500/20 flex items-center justify-center">
              <User size={20} className="text-claw-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">身份配置</h3>
              <p className="text-xs text-gray-500">设置 AI 助手的名称和称呼，保存在当前浏览器。</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">AI 助手名称</label>
              <input
                type="text"
                value={identity.botName}
                onChange={(event) => setIdentity({ ...identity, botName: event.target.value })}
                placeholder="Clawd"
                className="input-base"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">你的称呼</label>
              <input
                type="text"
                value={identity.userName}
                onChange={(event) => setIdentity({ ...identity, userName: event.target.value })}
                placeholder="主人"
                className="input-base"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">时区</label>
              <select
                value={identity.timezone}
                onChange={(event) => setIdentity({ ...identity, timezone: event.target.value })}
                className="input-base"
              >
                <option value="Asia/Shanghai">Asia/Shanghai (北京时间)</option>
                <option value="Asia/Hong_Kong">Asia/Hong_Kong (香港时间)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (东京时间)</option>
                <option value="America/New_York">America/New_York (纽约时间)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (洛杉矶时间)</option>
                <option value="Europe/London">Europe/London (伦敦时间)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>

        {isWebReplica ? (
          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Send size={20} className="text-cyan-300" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">单向通知渠道</h3>
                <p className="text-xs text-gray-500">
                  给定时任务单独配置飞书、钉钉等通知出口，只负责推送结果摘要，不进入对话会话。
                </p>
              </div>
            </div>

            {notificationsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin" />
                正在加载单向通知渠道...
              </div>
            ) : (
              <div className="space-y-4">
                {notificationIssues.length > 0 ? (
                  <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                    {notificationIssues.join(' ')}
                  </div>
                ) : null}

                {notificationChannels.map((channel) => (
                  <div key={channel.id} className="rounded-xl border border-dark-500 bg-dark-600/60 p-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{channel.label}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${
                              channel.supported
                                ? channel.enabled
                                  ? 'bg-emerald-500/15 text-emerald-200'
                                  : 'bg-dark-500 text-gray-300'
                                : 'bg-amber-500/15 text-amber-200'
                            }`}
                          >
                            {channel.supported ? (channel.enabled ? '已启用' : '未启用') : '规划中'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{channel.description}</p>
                      </div>
                      {channel.supported ? (
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={channel.enabled}
                            onChange={(event) =>
                              updateNotificationChannel(channel.id, { enabled: event.target.checked })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-dark-500 peer-focus:ring-2 peer-focus:ring-claw-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-claw-500"></div>
                        </label>
                      ) : null}
                    </div>

                    {channel.supported ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-sm text-gray-400 mb-2">显示名称</label>
                          <input
                            type="text"
                            value={channel.name}
                            onChange={(event) =>
                              updateNotificationChannel(channel.id, { name: event.target.value })
                            }
                            placeholder={channel.label}
                            className="input-base"
                          />
                        </div>

                        <div>
                          <label className="block text-sm text-gray-400 mb-2">Webhook 地址</label>
                          <input
                            type="text"
                            value={channel.webhook_url}
                            onChange={(event) =>
                              updateNotificationChannel(channel.id, { webhook_url: event.target.value })
                            }
                            placeholder={channel.webhook_placeholder}
                            className="input-base"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm text-gray-400 mb-2">签名密钥（可选）</label>
                          <input
                            type="text"
                            value={channel.secret}
                            onChange={(event) =>
                              updateNotificationChannel(channel.id, { secret: event.target.value })
                            }
                            placeholder={channel.secret_placeholder}
                            className="input-base"
                          />
                          <p className="mt-2 text-xs text-gray-500">
                            如果你的机器人启用了安全签名，再填写这里。没有启用的话可以留空。
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dark-500 bg-dark-700/60 px-4 py-3 text-xs text-gray-400">
                        这一类通知还没有接入具体服务商，所以现在只保留规划位，不会显示在定时任务选择里。
                      </div>
                    )}

                    {notificationTestResults[channel.id] ? (
                      <div className="rounded-xl border border-dark-500 bg-dark-700/60 px-4 py-3 text-sm text-gray-200">
                        {notificationTestResults[channel.id]}
                      </div>
                    ) : null}

                    {channel.supported ? (
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => handleTestNotificationChannel(channel.id)}
                          disabled={notificationTestingId === channel.id}
                          className="btn-secondary flex items-center gap-2"
                        >
                          {notificationTestingId === channel.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Send size={16} />
                          )}
                          发送测试通知
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {isWebReplica ? (
          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Bell size={20} className="text-blue-300" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">状态通知</h3>
                <p className="text-xs text-gray-500">异常下线、自动重启和恢复上线都会通过这里配置的渠道发送。</p>
              </div>
            </div>

            {alertsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin" />
                正在加载状态通知配置...
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-dark-600/70 p-4 border border-dark-500">
                    <p className="text-xs text-gray-500">监控状态</p>
                    <p className="mt-2 text-sm font-medium text-white">
                      {alertRuntimeStatus?.paused_reason === 'manual_stop'
                        ? '已暂停（手动停止服务）'
                        : alertRuntimeStatus?.restart_in_flight
                        ? '正在自动重启'
                        : alertRuntimeStatus?.monitor_active
                        ? '运行中'
                        : '未启动'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {alertRuntimeStatus?.cooldown_remaining_ms
                        ? `冷却剩余 ${Math.ceil(alertRuntimeStatus.cooldown_remaining_ms / 1000)} 秒`
                        : `连续掉线计数 ${alertRuntimeStatus?.consecutive_down_polls ?? 0}`}
                    </p>
                  </div>

                  <div className="rounded-xl bg-dark-600/70 p-4 border border-dark-500">
                    <p className="text-xs text-gray-500">当前服务状态</p>
                    <p className="mt-2 text-sm font-medium text-white">
                      {alertRuntimeStatus?.service_running ? '服务在线' : '服务离线'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {alertRuntimeStatus?.last_event ? `最近事件: ${alertRuntimeStatus.last_event.message}` : '最近暂无状态事件'}
                    </p>
                  </div>
                </div>

                {alertIssues.length > 0 ? (
                  <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
                    {alertIssues.join(' ')}
                  </div>
                ) : null}

                <div className="flex items-center justify-between rounded-xl bg-dark-600/70 px-4 py-3 border border-dark-500">
                  <div>
                    <p className="text-sm text-white">启用渠道告警</p>
                    <p className="text-xs text-gray-500">服务异常下线、恢复和重启结果会发送到指定渠道。</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertSettings.enabled}
                      onChange={(event) =>
                        setAlertSettings({ ...alertSettings, enabled: event.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-dark-500 peer-focus:ring-2 peer-focus:ring-claw-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-claw-500"></div>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">告警渠道</label>
                    <select
                      value={alertSettings.channel_type || ''}
                      onChange={(event) => {
                        const nextChannel = alertChannels.find((item) => item.id === event.target.value) || null;
                        setAlertSettings({
                          ...alertSettings,
                          channel_type: event.target.value || null,
                          target: nextChannel?.default_target || alertSettings.target,
                        });
                      }}
                      className="input-base"
                    >
                      <option value="">选择一个已启用渠道</option>
                      {alertChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.label}
                          {channel.running ? '（运行中）' : '（已配置）'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {selectedChannel?.target_label || '告警目标'}
                    </label>
                    <input
                      type="text"
                      value={alertSettings.target}
                      onChange={(event) =>
                        setAlertSettings({ ...alertSettings, target: event.target.value })
                      }
                      placeholder={selectedChannel?.target_placeholder || '填写接收告警的目标 ID'}
                      className="input-base"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      复用已启用渠道，但仍需要一个明确的接收目标，不会自动猜最后一次会话对象。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center justify-between rounded-xl bg-dark-600/70 px-4 py-3 border border-dark-500">
                    <div>
                      <p className="text-sm text-white">异常后自动重启</p>
                      <p className="text-xs text-gray-500">连续两次检测到掉线后自动尝试一次恢复。</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={alertSettings.auto_restart}
                        onChange={(event) =>
                          setAlertSettings({ ...alertSettings, auto_restart: event.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-500 peer-focus:ring-2 peer-focus:ring-claw-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-claw-500"></div>
                    </label>
                  </div>

                  <div className="rounded-xl bg-dark-600/70 px-4 py-3 border border-dark-500">
                    <p className="text-sm text-white">冷却说明</p>
                    <p className="mt-1 text-xs text-gray-500">
                      当前固定为连续 {alertSettings.confirm_down_polls} 次确认异常，自动重启后冷却{' '}
                      {alertSettings.cooldown_seconds} 秒。
                    </p>
                  </div>
                </div>

                {alertTestResult ? (
                  <div className="rounded-xl border border-dark-500 bg-dark-600/60 px-4 py-3 text-sm text-gray-200">
                    {alertTestResult}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleTestAlert}
                    disabled={alertTesting}
                    className="btn-secondary flex items-center gap-2"
                  >
                    {alertTesting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    发送测试通知
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Shield size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">安全设置</h3>
              <p className="text-xs text-gray-500">权限和访问控制</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-dark-600 rounded-lg">
              <div>
                <p className="text-sm text-white">启用白名单</p>
                <p className="text-xs text-gray-500">只允许白名单用户访问</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-dark-500 peer-focus:ring-2 peer-focus:ring-claw-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-claw-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-dark-600 rounded-lg">
              <div>
                <p className="text-sm text-white">文件访问权限</p>
                <p className="text-xs text-gray-500">允许 AI 读写本地文件</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-dark-500 peer-focus:ring-2 peer-focus:ring-claw-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-claw-500"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <FileCode size={20} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">高级设置</h3>
              <p className="text-xs text-gray-500">配置文件和目录</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={openConfigDir}
              className="w-full flex items-center gap-3 p-4 bg-dark-600 rounded-lg hover:bg-dark-500 transition-colors text-left"
            >
              <FolderOpen size={18} className="text-gray-400" />
              <div className="flex-1">
                <p className="text-sm text-white">打开配置目录</p>
                <p className="text-xs text-gray-500">~/.openclaw</p>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-dark-700 rounded-2xl p-6 border border-red-900/30">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">危险操作</h3>
              <p className="text-xs text-gray-500">以下操作不可撤销，请谨慎操作</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setShowUninstallConfirm(true)}
              className="w-full flex items-center gap-3 p-4 bg-red-950/30 rounded-lg hover:bg-red-900/40 transition-colors text-left border border-red-900/30"
            >
              <Trash2 size={18} className="text-red-400" />
              <div className="flex-1">
                <p className="text-sm text-red-300">卸载 OpenClaw</p>
                <p className="text-xs text-red-400/70">从系统中移除 OpenClaw CLI 工具</p>
              </div>
            </button>
          </div>
        </div>

        {showUninstallConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <AlertTriangle size={20} className="text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">确认卸载</h3>
                </div>
                <button
                  onClick={() => {
                    setShowUninstallConfirm(false);
                    setUninstallResult(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {!uninstallResult ? (
                <>
                  <p className="text-gray-300 mb-4">确定要卸载 OpenClaw 吗？此操作将：</p>
                  <ul className="text-sm text-gray-400 mb-6 space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                      停止正在运行的服务
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                      移除 OpenClaw CLI 工具
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                      配置文件将被保留在 ~/.openclaw
                    </li>
                  </ul>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowUninstallConfirm(false)}
                      className="flex-1 px-4 py-2.5 bg-dark-600 hover:bg-dark-500 text-white rounded-lg transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleUninstall}
                      disabled={uninstalling}
                      className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {uninstalling ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          卸载中...
                        </>
                      ) : (
                        <>
                          <Trash2 size={16} />
                          确认卸载
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div
                  className={`p-4 rounded-lg ${
                    uninstallResult.success ? 'bg-green-900/30 border border-green-800' : 'bg-red-900/30 border border-red-800'
                  }`}
                >
                  <p className={`text-sm ${uninstallResult.success ? 'text-green-300' : 'text-red-300'}`}>
                    {uninstallResult.message}
                  </p>
                  {uninstallResult.error ? (
                    <p className="text-xs text-red-400 mt-2 font-mono">{uninstallResult.error}</p>
                  ) : null}
                  {uninstallResult.success ? (
                    <p className="text-xs text-gray-400 mt-3">对话框将自动关闭...</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}
