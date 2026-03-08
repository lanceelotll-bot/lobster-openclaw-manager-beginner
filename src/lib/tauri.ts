import { invoke } from '@tauri-apps/api/core';
import { apiLogger } from './logger';

const WEB_COMPAT = import.meta.env.MODE === 'web';

// 检查是否在 Tauri 环境中运行
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    (WEB_COMPAT || '__TAURI_INTERNALS__' in window)
  );
}

// 带日志的 invoke 封装（自动检查 Tauri 环境）
async function invokeWithLog<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('不在 Tauri 环境中运行，请通过 Tauri 应用启动');
  }
  apiLogger.apiCall(cmd, args);
  try {
    const result = await invoke<T>(cmd, args);
    apiLogger.apiResponse(cmd, result);
    return result;
  } catch (error) {
    apiLogger.apiError(cmd, error);
    throw error;
  }
}

// 服务状态
export interface ServiceStatus {
  running: boolean;
  pid: number | null;
  port: number;
  uptime_seconds: number | null;
  memory_mb: number | null;
  cpu_percent: number | null;
}

export interface AlertChannelOption {
  id: string;
  label: string;
  target_label: string;
  target_placeholder: string;
  target_field: string;
  configured: boolean;
  running: boolean;
  default_target: string;
}

export interface AlertSettings {
  enabled: boolean;
  channel_type: string | null;
  target: string;
  auto_restart: boolean;
  confirm_down_polls: number;
  cooldown_seconds: number;
  enabled_events: string[];
}

export interface AlertSettingsPayload {
  settings: AlertSettings;
  available_channels: AlertChannelOption[];
  issues: string[];
  config_path: string;
}

export interface AlertDeliveryDetail {
  status: string;
  error: string | null;
  channel_type: string | null;
  target: string | null;
}

export interface AlertEvent {
  id: string;
  type: 'down' | 'recovered' | 'restart_succeeded' | 'restart_failed';
  timestamp: string;
  source: 'detector' | 'auto_restart' | 'manual_action' | string;
  message: string;
  delivery_status: string;
  delivery_detail: AlertDeliveryDetail | null;
}

export interface AlertEventsPayload {
  events: AlertEvent[];
}

export interface AlertRuntimeStatus {
  monitor_active: boolean;
  bootstrapped: boolean;
  service_running: boolean;
  service_pid: number | null;
  expected_running: boolean;
  paused_reason: string | null;
  maintenance_until: string | null;
  consecutive_down_polls: number;
  incident_active: boolean;
  incident_started_at: string | null;
  restart_in_flight: boolean;
  restart_attempted: boolean;
  cooldown_until: string | null;
  cooldown_remaining_ms: number;
  last_poll_at: string | null;
  last_poll_error: string | null;
  last_event: AlertEvent | null;
  issues: string[];
}

export interface AlertSendResult {
  success: boolean;
  message: string;
  delivery_status: string;
  delivery_detail: AlertDeliveryDetail | null;
}

export interface ManagerNotificationChannel {
  id: string;
  label: string;
  description: string;
  kind: string;
  supported: boolean;
  name: string;
  enabled: boolean;
  configured: boolean;
  webhook_url: string;
  secret: string;
  has_secret: boolean;
  webhook_placeholder: string;
  secret_placeholder: string;
}

export interface ManagerNotificationChannelsPayload {
  channels: ManagerNotificationChannel[];
  issues: string[];
  config_path: string;
}

export interface ManagerNotificationSendResult {
  success: boolean;
  message: string;
  delivery_status: string;
  delivery_detail: Record<string, unknown> | null;
}

// 系统信息
export interface SystemInfo {
  os: string;
  os_version: string;
  arch: string;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  node_version: string | null;
  config_dir: string;
}

// AI Provider 选项（旧版兼容）
export interface AIProviderOption {
  id: string;
  name: string;
  icon: string;
  default_base_url: string | null;
  models: AIModelOption[];
  requires_api_key: boolean;
}

export interface AIModelOption {
  id: string;
  name: string;
  description: string | null;
  recommended: boolean;
}

// 官方 Provider 预设
export interface OfficialProvider {
  id: string;
  name: string;
  icon: string;
  default_base_url: string | null;
  api_type: string;
  suggested_models: SuggestedModel[];
  requires_api_key: boolean;
  docs_url: string | null;
}

export interface SuggestedModel {
  id: string;
  name: string;
  description: string | null;
  context_window: number | null;
  max_tokens: number | null;
  recommended: boolean;
}

// 已配置的 Provider
export interface ConfiguredProvider {
  name: string;
  base_url: string;
  api_key_masked: string | null;
  has_api_key: boolean;
  models: ConfiguredModel[];
}

export interface ConfiguredModel {
  full_id: string;
  id: string;
  name: string;
  api_type: string | null;
  context_window: number | null;
  max_tokens: number | null;
  is_primary: boolean;
}

// AI 配置概览
export interface AIConfigOverview {
  primary_model: string | null;
  configured_providers: ConfiguredProvider[];
  available_models: string[];
}

// 模型配置
export interface ModelConfig {
  id: string;
  name: string;
  api: string | null;
  input: string[];
  context_window: number | null;
  max_tokens: number | null;
  reasoning: boolean | null;
  cost: { input: number; output: number; cache_read: number; cache_write: number } | null;
}

// 渠道配置
export interface ChannelConfig {
  id: string;
  channel_type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface ChannelOverviewItem {
  id: string;
  channel_type: string;
  configured: boolean;
  running: boolean;
  account_count: number;
  running_account_count: number;
  mode: string | null;
  last_error: string | null;
}

export interface ChannelsOverview {
  channels: ChannelOverviewItem[];
  configured_count: number;
  running_count: number;
  coexistence_enabled: boolean;
  recommended_focus_channel: string | null;
  channel_order: string[];
  status_available: boolean;
  status_error: string | null;
}

export interface UsageWindow {
  label: string;
  used_percent: number;
  reset_at: number | null;
}

export interface ProviderUsageItem {
  provider: string;
  display_name: string;
  plan: string | null;
  error: string | null;
  windows: UsageWindow[];
}

export interface SessionUsageItem {
  key: string;
  updated_at: number;
  age_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  context_tokens: number | null;
  model: string | null;
  model_provider: string | null;
  kind: string | null;
}

export interface UsageOverview {
  updated_at: number | null;
  providers: ProviderUsageItem[];
  sessions: SessionUsageItem[];
  total_sessions: number;
  total_token_estimate: number;
}

export interface CronSchedulerStatus {
  enabled: boolean;
  store_path: string | null;
  jobs: number;
  next_wake_at_ms: number | null;
}

export interface CronJobSchedule {
  kind: string;
  expr: string | null;
  every: string | null;
  at: string | null;
  tz: string | null;
}

export interface CronJobPayload {
  kind: string;
  message: string | null;
  text: string | null;
  model: string | null;
}

export interface CronJobState {
  next_run_at_ms: number | null;
  last_run_at_ms: number | null;
  last_status: string | null;
  last_run_status: string | null;
  last_duration_ms: number | null;
  last_error: string | null;
  consecutive_errors: number;
}

export interface CronJobDelivery {
  mode: string | null;
  channel: string | null;
  to: string | null;
  account_id: string | null;
}

export interface CronJobNotification {
  enabled: boolean;
  channel_id: string | null;
  channel_label: string | null;
  channel_enabled: boolean;
  channel_configured: boolean;
  notify_on: string[];
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  last_delivery_error: string | null;
}

export interface CronJobItem {
  id: string;
  agent_id: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  schedule: CronJobSchedule;
  payload: CronJobPayload;
  session_target: string | null;
  wake_mode: string | null;
  state: CronJobState;
  delivery: CronJobDelivery;
  notification: CronJobNotification;
  created_at_ms: number | null;
  updated_at_ms: number | null;
}

export interface CronOverview {
  scheduler: CronSchedulerStatus | null;
  jobs: CronJobItem[];
  notification_channels: Array<{
    id: string;
    label: string;
    name: string;
    description: string;
    enabled: boolean;
    configured: boolean;
    supported: boolean;
  }>;
}

export interface CronJobDraft {
  id?: string | null;
  name: string;
  description: string;
  scheduleType: 'cron' | 'every' | 'at';
  scheduleValue: string;
  timezone: string;
  payloadKind: 'agentTurn' | 'systemEvent';
  message: string;
  model: string;
  sessionTarget: 'main' | 'isolated';
  enabled: boolean;
  announce: boolean;
  channel: string;
  to: string;
  accountId: string;
  wakeMode: 'now' | 'next-heartbeat';
  notificationEnabled: boolean;
  notificationChannelId: string;
  notificationOnSuccess: boolean;
  notificationOnFailure: boolean;
}

// 诊断结果
export interface DiagnosticResult {
  name: string;
  passed: boolean;
  message: string;
  suggestion: string | null;
}

// AI 测试结果
export interface AITestResult {
  success: boolean;
  provider: string;
  model: string;
  response: string | null;
  error: string | null;
  latency_ms: number | null;
}

// API 封装（带日志）
export const api = {
  // 服务管理
  getServiceStatus: () => invokeWithLog<ServiceStatus>('get_service_status'),
  startService: () => invokeWithLog<string>('start_service'),
  stopService: () => invokeWithLog<string>('stop_service'),
  restartService: () => invokeWithLog<string>('restart_service'),
  getLogs: (lines?: number) => invokeWithLog<string[]>('get_logs', { lines }),

  // 系统信息
  getSystemInfo: () => invokeWithLog<SystemInfo>('get_system_info'),
  checkOpenclawInstalled: () => invokeWithLog<boolean>('check_openclaw_installed'),
  getOpenclawVersion: () => invokeWithLog<string | null>('get_openclaw_version'),

  // 配置管理
  getConfig: () => invokeWithLog<unknown>('get_config'),
  saveConfig: (config: unknown) => invokeWithLog<string>('save_config', { config }),
  getEnvValue: (key: string) => invokeWithLog<string | null>('get_env_value', { key }),
  saveEnvValue: (key: string, value: string) =>
    invokeWithLog<string>('save_env_value', { key, value }),

  // AI Provider（旧版兼容）
  getAIProviders: () => invokeWithLog<AIProviderOption[]>('get_ai_providers'),

  // AI 配置（新版）
  getOfficialProviders: () => invokeWithLog<OfficialProvider[]>('get_official_providers'),
  getAIConfig: () => invokeWithLog<AIConfigOverview>('get_ai_config'),
  saveProvider: (
    providerName: string,
    baseUrl: string,
    apiKey: string | null,
    apiType: string,
    models: ModelConfig[]
  ) =>
    invokeWithLog<string>('save_provider', {
      providerName,
      baseUrl,
      apiKey,
      apiType,
      models,
    }),
  deleteProvider: (providerName: string) =>
    invokeWithLog<string>('delete_provider', { providerName }),
  setPrimaryModel: (modelId: string) =>
    invokeWithLog<string>('set_primary_model', { modelId }),
  addAvailableModel: (modelId: string) =>
    invokeWithLog<string>('add_available_model', { modelId }),
  removeAvailableModel: (modelId: string) =>
    invokeWithLog<string>('remove_available_model', { modelId }),

  // 渠道
  getChannelsConfig: () => invokeWithLog<ChannelConfig[]>('get_channels_config'),
  getChannelsOverview: () => invokeWithLog<ChannelsOverview>('get_channels_overview'),
  saveChannelConfig: (channel: ChannelConfig) =>
    invokeWithLog<string>('save_channel_config', { channel }),
  getAlertSettings: () => invokeWithLog<AlertSettingsPayload>('get_alert_settings'),
  saveAlertSettings: (settings: AlertSettings) =>
    invokeWithLog<AlertSettingsPayload>('save_alert_settings', { settings }),
  getAlertEvents: (limit?: number) =>
    invokeWithLog<AlertEventsPayload>('get_alert_events', { limit }),
  sendTestAlert: (settings?: Partial<AlertSettings>) =>
    invokeWithLog<AlertSendResult>('send_test_alert', { settings }),
  getAlertRuntimeStatus: () =>
    invokeWithLog<AlertRuntimeStatus>('get_alert_runtime_status'),
  getNotificationChannels: () =>
    invokeWithLog<ManagerNotificationChannelsPayload>('get_notification_channels'),
  saveNotificationChannels: (channels: ManagerNotificationChannel[]) =>
    invokeWithLog<ManagerNotificationChannelsPayload>('save_notification_channels', { channels }),
  sendTestNotificationChannel: (channelId: string, message?: string) =>
    invokeWithLog<ManagerNotificationSendResult>('send_test_notification_channel', {
      channelId,
      message,
    }),
  getUsageOverview: () => invokeWithLog<UsageOverview>('get_usage_overview'),
  getCronOverview: () => invokeWithLog<CronOverview>('get_cron_overview'),
  createCronJob: (input: CronJobDraft) =>
    invokeWithLog<string>('create_cron_job', { input }),
  updateCronJob: (input: CronJobDraft) =>
    invokeWithLog<string>('update_cron_job', { input }),
  enableCronJob: (jobId: string) =>
    invokeWithLog<string>('enable_cron_job', { jobId }),
  disableCronJob: (jobId: string) =>
    invokeWithLog<string>('disable_cron_job', { jobId }),
  runCronJob: (jobId: string) =>
    invokeWithLog<string>('run_cron_job', { jobId }),
  removeCronJob: (jobId: string) =>
    invokeWithLog<string>('remove_cron_job', { jobId }),

  // 诊断测试
  runDoctor: () => invokeWithLog<DiagnosticResult[]>('run_doctor'),
  testAIConnection: () => invokeWithLog<AITestResult>('test_ai_connection'),
  testChannel: (channelType: string) =>
    invokeWithLog<unknown>('test_channel', { channelType }),
};
