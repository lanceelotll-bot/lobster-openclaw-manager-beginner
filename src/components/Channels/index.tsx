import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  MessageCircle,
  Hash,
  Slack,
  MessagesSquare,
  MessageSquare,
  Check,
  Loader2,
  ChevronRight,
  Apple,
  Bell,
  Eye,
  EyeOff,
  Play,
  QrCode,
  CheckCircle,
  XCircle,
  Download,
  Package,
  AlertTriangle,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import type {
  ChannelConfig as ChannelConfigData,
  ChannelOverviewItem,
  ChannelsOverview as ChannelsOverviewData,
} from '../../lib/tauri';

interface FeishuPluginStatus {
  installed: boolean;
  version: string | null;
  plugin_name: string | null;
}

interface ChannelField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'textarea' | 'json';
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  rows?: number;
}

const WEBCHAT_CHANNEL_ID = 'webchat';

const dmPolicyOptions = [
  { value: 'pairing', label: '配对模式' },
  { value: 'allowlist', label: '白名单' },
  { value: 'open', label: '开放模式' },
  { value: 'disabled', label: '禁用' },
];

const groupPolicyOptions = [
  { value: 'allowlist', label: '白名单' },
  { value: 'open', label: '开放' },
  { value: 'disabled', label: '禁用' },
];

const dmAccessFields: ChannelField[] = [
  {
    key: 'dmPolicy',
    label: '私聊策略',
    type: 'select',
    options: dmPolicyOptions,
  },
  {
    key: 'allowFrom',
    label: '允许私聊用户',
    type: 'textarea',
    placeholder: '每行一个用户 ID，或用逗号分隔',
    rows: 3,
  },
];

const groupAccessFields: ChannelField[] = [
  {
    key: 'groupPolicy',
    label: '群组策略',
    type: 'select',
    options: groupPolicyOptions,
  },
  {
    key: 'groupAllowFrom',
    label: '允许群组发送者',
    type: 'textarea',
    placeholder: '每行一个用户 ID，或用逗号分隔',
    rows: 3,
  },
];

const WEBCHAT_CHANNEL: ChannelConfigData = {
  id: WEBCHAT_CHANNEL_ID,
  channel_type: 'webchat',
  enabled: true,
  config: {},
};

const channelInfo: Record<
  string,
  {
    name: string;
    icon: React.ReactNode;
    color: string;
    fields: ChannelField[];
    helpText?: string;
  }
> = {
  telegram: {
    name: 'Telegram',
    icon: <MessageCircle size={20} />,
    color: 'text-blue-400',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '从 @BotFather 获取', required: true },
      { key: 'userId', label: 'User ID', type: 'text', placeholder: '你的 Telegram User ID', required: true },
      {
        key: 'groups',
        label: '群组 / Topic 权限 JSON',
        type: 'json',
        placeholder: '{\n  "-1001234567890": {\n    "requireMention": false,\n    "allowFrom": ["1628904587"]\n  }\n}',
        rows: 6,
      },
      ...dmAccessFields,
      ...groupAccessFields,
    ],
    helpText: '支持 DM 配对、allowFrom 群组权限和 groups/topic 细粒度配置。',
  },
  discord: {
    name: 'Discord',
    icon: <Hash size={20} />,
    color: 'text-indigo-400',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Discord Bot Token', required: true },
      { key: 'testChannelId', label: '测试 Channel ID', type: 'text', placeholder: '用于发送测试消息的频道 ID (可选)' },
      {
        key: 'groupPolicy',
        label: '频道 / Guild 策略',
        type: 'select',
        options: groupPolicyOptions,
      },
      {
        key: 'guilds',
        label: 'Guild 权限 JSON',
        type: 'json',
        placeholder: '{\n  "123456789012345678": {\n    "requireMention": false,\n    "users": ["987654321098765432"],\n    "roles": ["111111111111111111"]\n  }\n}',
        rows: 7,
      },
      ...dmAccessFields,
    ],
    helpText: '支持 DM allowFrom，以及 guild 内 users / roles / requireMention 权限。',
  },
  slack: {
    name: 'Slack',
    icon: <Slack size={20} />,
    color: 'text-purple-400',
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...', required: true },
      { key: 'appToken', label: 'App Token', type: 'password', placeholder: 'xapp-...' },
      { key: 'testChannelId', label: '测试 Channel ID', type: 'text', placeholder: '用于发送测试消息的频道 ID (可选)' },
      ...dmAccessFields,
      {
        key: 'groupPolicy',
        label: '频道策略',
        type: 'select',
        options: groupPolicyOptions,
      },
      {
        key: 'channels',
        label: '频道权限 JSON',
        type: 'json',
        placeholder: '{\n  "C0123456789": {\n    "requireMention": false,\n    "users": ["U0123456789"]\n  }\n}',
        rows: 6,
      },
    ],
    helpText: '支持 DM allowFrom，以及按频道配置 users / requireMention。',
  },
  feishu: {
    name: '飞书',
    icon: <MessagesSquare size={20} />,
    color: 'text-blue-500',
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', placeholder: '飞书应用 App ID', required: true },
      { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '飞书应用 App Secret', required: true },
      { key: 'testChatId', label: '测试 Chat ID', type: 'text', placeholder: '用于发送测试消息的群聊/用户 ID (可选)' },
      {
        key: 'connectionMode',
        label: '连接模式',
        type: 'select',
        options: [
          { value: 'websocket', label: 'WebSocket (推荐)' },
          { value: 'webhook', label: 'Webhook' },
        ],
      },
      {
        key: 'domain',
        label: '部署区域',
        type: 'select',
        options: [
          { value: 'feishu', label: '国内 (feishu.cn)' },
          { value: 'lark', label: '海外 (larksuite.com)' },
        ],
      },
      {
        key: 'groups',
        label: '群权限 JSON',
        type: 'json',
        placeholder: '{\n  "oc_xxx": {\n    "requireMention": false,\n    "allowFrom": ["ou_user1", "ou_user2"]\n  }\n}',
        rows: 6,
      },
      ...dmAccessFields,
      ...groupAccessFields,
    ],
    helpText: '支持 DM 配对 / allowFrom，以及群级 requireMention 与 allowFrom。',
  },
  imessage: {
    name: 'iMessage',
    icon: <Apple size={20} />,
    color: 'text-green-400',
    fields: [
      ...dmAccessFields,
      ...groupAccessFields,
      {
        key: 'groups',
        label: '群权限 JSON',
        type: 'json',
        placeholder: '{\n  "chat_id": {\n    "requireMention": false,\n    "allowFrom": ["handle_or_id"]\n  }\n}',
        rows: 6,
      },
    ],
    helpText: '支持 DM / group allowFrom，适合把允许使用的人单独列出来。',
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: <MessageCircle size={20} />,
    color: 'text-green-500',
    fields: [
      ...dmAccessFields,
      ...groupAccessFields,
      {
        key: 'groups',
        label: '群权限 JSON',
        type: 'json',
        placeholder: '{\n  "120363403215116621@g.us": {\n    "requireMention": true,\n    "allowFrom": ["+8613800138000"]\n  }\n}',
        rows: 6,
      },
    ],
    helpText: '支持 allowFrom / groupAllowFrom / groups；扫码登录只负责账号本身。',
  },
  wechat: {
    name: '微信',
    icon: <MessageSquare size={20} />,
    color: 'text-green-600',
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', placeholder: '微信开放平台 App ID' },
      { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '微信开放平台 App Secret' },
    ],
    helpText: '微信公众号/企业微信配置',
  },
  dingtalk: {
    name: '钉钉',
    icon: <Bell size={20} />,
    color: 'text-blue-600',
    fields: [
      { key: 'appKey', label: 'App Key', type: 'text', placeholder: '钉钉应用 App Key' },
      { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '钉钉应用 App Secret' },
    ],
    helpText: '从钉钉开放平台获取',
  },
  webchat: {
    name: '网页端',
    icon: <MessageSquare size={20} />,
    color: 'text-cyan-400',
    fields: [],
    helpText: 'WebChat 本身不需要 token 配置，主要用于打开原始网页聊天和设置会话共享策略。',
  },
};

interface TestResult {
  success: boolean;
  message: string;
  error: string | null;
}

interface SessionRoutingState {
  dmScope: string;
  identityLinksText: string;
}

function getChannelName(channelType: string) {
  return channelInfo[channelType]?.name || channelType;
}

function buildDisplayChannels(channelList: ChannelConfigData[]) {
  return [WEBCHAT_CHANNEL, ...channelList.filter((channel) => channel.id !== WEBCHAT_CHANNEL_ID)];
}

function hasValidConfig(channel: ChannelConfigData) {
  const info = channelInfo[channel.channel_type];
  if (!info) return channel.enabled;

  const requiredFields = info.fields.filter((field) => field.required);
  if (requiredFields.length === 0) return channel.enabled;

  return requiredFields.some((field) => {
    const value = channel.config[field.key];
    return value !== undefined && value !== null && value !== '';
  });
}

function getChannelStateMeta(channel: ChannelConfigData, overviewItem?: ChannelOverviewItem) {
  if (channel.id === WEBCHAT_CHANNEL_ID) {
    return {
      label: overviewItem?.running ? '已就绪' : '本机入口',
      tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
      dot: 'bg-cyan-400',
    };
  }
  if (overviewItem?.last_error) {
    return {
      label: '需关注',
      tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
      dot: 'bg-amber-400',
    };
  }
  if (overviewItem?.running) {
    return {
      label: '运行中',
      tone: 'text-green-300 bg-green-500/10 border-green-500/30',
      dot: 'bg-green-400',
    };
  }
  if (hasValidConfig(channel) || overviewItem?.configured) {
    return {
      label: '已配置',
      tone: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
      dot: 'bg-blue-400',
    };
  }
  return {
    label: '未配置',
    tone: 'text-gray-400 bg-dark-600/70 border-dark-500',
    dot: 'bg-gray-500',
  };
}

export function Channels() {
  const [channels, setChannels] = useState<ChannelConfigData[]>([]);
  const [overview, setOverview] = useState<ChannelsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingOverview, setRefreshingOverview] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [feishuPluginStatus, setFeishuPluginStatus] = useState<FeishuPluginStatus | null>(null);
  const [feishuPluginLoading, setFeishuPluginLoading] = useState(false);
  const [feishuPluginInstalling, setFeishuPluginInstalling] = useState(false);
  const [sessionRouting, setSessionRouting] = useState<SessionRoutingState>({
    dmScope: 'main',
    identityLinksText: '',
  });
  const [sessionSaving, setSessionSaving] = useState(false);
  const [openingWebchat, setOpeningWebchat] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  const togglePasswordVisibility = (fieldKey: string) => {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) {
        next.delete(fieldKey);
      } else {
        next.add(fieldKey);
      }
      return next;
    });
  };

  const checkFeishuPlugin = async () => {
    setFeishuPluginLoading(true);
    try {
      const status = await invoke<FeishuPluginStatus>('check_feishu_plugin');
      setFeishuPluginStatus(status);
    } catch (e) {
      console.error('检查飞书插件失败:', e);
      setFeishuPluginStatus({ installed: false, version: null, plugin_name: null });
    } finally {
      setFeishuPluginLoading(false);
    }
  };

  const handleInstallFeishuPlugin = async () => {
    setFeishuPluginInstalling(true);
    try {
      const result = await invoke<string>('install_feishu_plugin');
      alert(result);
      await checkFeishuPlugin();
    } catch (e) {
      alert('安装失败: ' + e);
    } finally {
      setFeishuPluginInstalling(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const result = await invoke<ChannelConfigData[]>('get_channels_config');
      setChannels(result);
      return result;
    } catch (e) {
      console.error('获取渠道配置失败:', e);
      setChannels([]);
      return [];
    }
  };

  const fetchOverview = async () => {
    try {
      const result = await invoke<ChannelsOverviewData>('get_channels_overview');
      setOverview(result);
      return result;
    } catch (e) {
      console.error('获取渠道总览失败:', e);
      setOverview(null);
      return null;
    }
  };

  const loadSessionRouting = async () => {
    try {
      const config = await invoke<Record<string, unknown>>('get_config');
      const session = (config?.session as Record<string, unknown> | undefined) || {};
      setSessionRouting({
        dmScope: typeof session.dmScope === 'string' ? session.dmScope : 'main',
        identityLinksText: session.identityLinks
          ? JSON.stringify(session.identityLinks, null, 2)
          : '',
      });
    } catch (e) {
      console.error('读取会话共享配置失败:', e);
    }
  };

  const handleOpenWebchat = async () => {
    setOpeningWebchat(true);
    try {
      const url = await invoke<string>('get_dashboard_url');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert('打开网页端失败: ' + e);
    } finally {
      setOpeningWebchat(false);
    }
  };

  const handleChannelSelect = (channelId: string, channelList?: ChannelConfigData[]) => {
    setSelectedChannel(channelId);
    setTestResult(null);

    const list = buildDisplayChannels(channelList || channels);
    const channel = list.find((item) => item.id === channelId);

    if (!channel) {
      setConfigForm({});
      return;
    }

    const form: Record<string, string> = {};
    Object.entries(channel.config).forEach(([key, value]) => {
      if (typeof value === 'boolean') {
        form[key] = value ? 'true' : 'false';
      } else if (Array.isArray(value)) {
        form[key] = value.map((item) => String(item)).join('\n');
      } else if (value && typeof value === 'object') {
        form[key] = JSON.stringify(value, null, 2);
      } else {
        form[key] = String(value ?? '');
      }
    });
    setConfigForm(form);

    if (channel.channel_type === 'feishu') {
      checkFeishuPlugin();
    }
  };

  const pickPreferredChannel = (channelList: ChannelConfigData[], preferredChannelId?: string | null) => {
    const displayChannels = buildDisplayChannels(channelList);
    const candidates = [
      preferredChannelId,
      selectedChannel,
      channelList.find((item) => hasValidConfig(item))?.id,
      WEBCHAT_CHANNEL_ID,
      displayChannels[0]?.id,
    ].filter(Boolean) as string[];

    return (
      candidates.find((candidate) =>
        displayChannels.some((channel) => channel.id === candidate)
      ) || null
    );
  };

  const refreshStaticChannelData = async (preferredChannelId?: string | null) => {
    try {
      const [channelList] = await Promise.all([fetchChannels(), loadSessionRouting()]);

      const nextSelection = pickPreferredChannel(channelList, preferredChannelId);
      if (nextSelection) {
        handleChannelSelect(nextSelection, channelList);
      } else {
        setSelectedChannel(null);
        setConfigForm({});
      }
      return channelList;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await refreshStaticChannelData();
      await refreshRealtimeStatus();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshRealtimeStatus = async () => {
    setRefreshingOverview(true);
    try {
      await fetchOverview();
    } finally {
      setRefreshingOverview(false);
    }
  };

  const handleSaveSessionRouting = async () => {
    setSessionSaving(true);
    try {
      const config = await invoke<Record<string, unknown>>('get_config');
      const session: Record<string, unknown> = {
        ...((config?.session as Record<string, unknown> | undefined) || {}),
        dmScope: sessionRouting.dmScope,
      };

      if (sessionRouting.identityLinksText.trim()) {
        const parsed = JSON.parse(sessionRouting.identityLinksText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('identityLinks 需要是对象 JSON');
        }
        session.identityLinks = parsed;
      } else {
        delete session.identityLinks;
      }

      await invoke('save_config', {
        config: {
          ...(config || {}),
          session,
        },
      });
      alert('网页端与会话共享配置已保存');
    } catch (e) {
      alert('保存会话共享配置失败: ' + e);
    } finally {
      setSessionSaving(false);
    }
  };

  const handleShowClearConfirm = () => {
    if (!selectedChannel) return;
    setShowClearConfirm(true);
  };

  const handleClearConfig = async () => {
    if (!selectedChannel) return;

    const channel = channels.find((item) => item.id === selectedChannel);
    const channelName = channel ? getChannelName(channel.channel_type) : selectedChannel;

    setShowClearConfirm(false);
    setClearing(true);
    try {
      await invoke('clear_channel_config', { channelId: selectedChannel });
      setConfigForm({});
      await refreshStaticChannelData(selectedChannel);
      await refreshRealtimeStatus();
      setTestResult({
        success: true,
        message: `${channelName} 配置已清空`,
        error: null,
      });
    } catch (e) {
      setTestResult({
        success: false,
        message: '清空失败',
        error: String(e),
      });
    } finally {
      setClearing(false);
    }
  };

  const handleQuickTest = async () => {
    if (!selectedChannel) return;

    setTesting(true);
    setTestResult(null);

    try {
      const result = await invoke<{
        success: boolean;
        channel: string;
        message: string;
        error: string | null;
      }>('test_channel', { channelType: selectedChannel });

      setTestResult({
        success: result.success,
        message: result.message,
        error: result.error,
      });
      await refreshRealtimeStatus();
    } catch (e) {
      setTestResult({
        success: false,
        message: '测试失败',
        error: String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleWhatsAppLogin = async () => {
    setLoginLoading(true);
    try {
      await invoke('start_channel_login', { channelType: 'whatsapp' });

      const pollInterval = setInterval(async () => {
        try {
          const result = await invoke<{
            success: boolean;
            message: string;
          }>('test_channel', { channelType: 'whatsapp' });

          if (result.success) {
            clearInterval(pollInterval);
            setLoginLoading(false);
            await refreshStaticChannelData('whatsapp');
            await refreshRealtimeStatus();
            setTestResult({
              success: true,
              message: 'WhatsApp 登录成功！',
              error: null,
            });
          }
        } catch {
          // 继续轮询
        }
      }, 3000);

      setTimeout(() => {
        clearInterval(pollInterval);
        setLoginLoading(false);
      }, 60000);

      alert('请在弹出的终端窗口中扫描二维码完成登录\n\n登录成功后界面会自动更新');
    } catch (e) {
      alert('启动登录失败: ' + e);
      setLoginLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedChannel) return;

    setSaving(true);
    try {
      const channel = channels.find((item) => item.id === selectedChannel);
      if (!channel) return;
      const fields = channelInfo[channel.channel_type]?.fields || [];
      const fieldMap = new Map(fields.map((field) => [field.key, field]));

      const config: Record<string, unknown> = {};
      Object.entries(configForm).forEach(([key, value]) => {
        const field = fieldMap.get(key);
        const normalizedValue = value.trim();

        if (!normalizedValue) {
          return;
        }
        if (field?.type === 'textarea') {
          const items = normalizedValue
            .split(/\r?\n|,/)
            .map((item) => item.trim())
            .filter(Boolean);
          if (items.length > 0) {
            config[key] = items;
          }
          return;
        }
        if (field?.type === 'json') {
          config[key] = JSON.parse(normalizedValue);
          return;
        }
        if (value === 'true') {
          config[key] = true;
        } else if (value === 'false') {
          config[key] = false;
        } else {
          config[key] = normalizedValue;
        }
      });

      await invoke('save_channel_config', {
        channel: {
          ...channel,
          config,
        },
      });

      await refreshStaticChannelData(selectedChannel);
      await refreshRealtimeStatus();
      alert('渠道配置已保存！');
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败: ' + e);
    } finally {
      setSaving(false);
    }
  };

  const displayChannels = buildDisplayChannels(channels);
  const webchatOverview: ChannelOverviewItem = {
    id: WEBCHAT_CHANNEL_ID,
    channel_type: 'webchat',
    configured: true,
    running: true,
    account_count: 1,
    running_account_count: 1,
    mode: 'browser',
    last_error: null,
  };
  const currentChannel = displayChannels.find((item) => item.id === selectedChannel);
  const currentInfo = currentChannel ? channelInfo[currentChannel.channel_type] : null;
  const overviewById = new Map< string, ChannelOverviewItem>([
    [WEBCHAT_CHANNEL_ID, webchatOverview],
    ...((overview?.channels || []).map((item) => [item.id, item]) as [string, ChannelOverviewItem][]),
  ]);
  const channelOrder = new Map((overview?.channel_order || []).map((id, index) => [id, index]));
  const baseChannelOrder = new Map(displayChannels.map((channel, index) => [channel.id, index]));
  const configuredCount =
    overview?.configured_count ??
    channels.filter((channel) => hasValidConfig(channel) || channel.enabled).length;
  const runningCount = overview?.running_count ?? 0;
  const coexistenceEnabled = overview?.coexistence_enabled ?? configuredCount > 1;

  const orderedChannels = [...displayChannels].sort((left, right) => {
    const leftOrder = channelOrder.get(left.id) ?? baseChannelOrder.get(left.id) ?? 999;
    const rightOrder = channelOrder.get(right.id) ?? baseChannelOrder.get(right.id) ?? 999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    return getChannelName(left.channel_type).localeCompare(getChannelName(right.channel_type), 'zh-CN');
  });

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
        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">对话渠道总览</h3>
              <p className="text-sm text-gray-400 mt-1">
                直接从下面的渠道列表点进去配置，页面不再区分“关注渠道”。
              </p>
            </div>
            <button
              onClick={async () => {
                await refreshStaticChannelData(selectedChannel);
                await refreshRealtimeStatus();
              }}
              disabled={refreshingOverview}
              className="btn-secondary flex items-center gap-2"
            >
              {refreshingOverview ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              刷新渠道状态
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <div className="rounded-xl border border-dark-500 bg-dark-600/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">已配置</p>
              <p className="mt-2 text-2xl font-semibold text-white">{configuredCount}</p>
              <p className="mt-1 text-xs text-gray-500">至少填好了基础配置的渠道</p>
            </div>
            <div className="rounded-xl border border-dark-500 bg-dark-600/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">运行中</p>
              <p className="mt-2 text-2xl font-semibold text-white">{runningCount}</p>
              <p className="mt-1 text-xs text-gray-500">
                {overview ? '已经连上并在接收消息的渠道' : '正在后台拉取实时状态'}
              </p>
            </div>
            <div className="rounded-xl border border-dark-500 bg-dark-600/70 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">共存模式</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {coexistenceEnabled ? '多渠道共存' : configuredCount ? '单渠道' : '未接入'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                OpenClaw 可以同时挂多个渠道，不需要二选一
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-claw-500/20 bg-claw-500/5 p-4">
            <p className="text-sm text-gray-300">
              多渠道仍然可以同时共存；这里只保留一个列表供你直接切换配置，不再额外维护一层“关注渠道”状态。
            </p>
          </div>

          {!overview?.status_available && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              当前没拿到实时运行状态，页面先展示静态配置。
              {overview?.status_error ? ` 原因: ${overview.status_error}` : ''}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-2">
            <h3 className="text-sm font-medium text-gray-400 mb-3 px-1">消息渠道</h3>
            {orderedChannels.map((channel) => {
              const info = channelInfo[channel.channel_type] || {
                name: channel.channel_type,
                icon: <MessageSquare size={20} />,
                color: 'text-gray-400',
                fields: [],
              };
              const isSelected = selectedChannel === channel.id;
              const detail = overviewById.get(channel.id);
              const stateMeta = getChannelStateMeta(channel, detail);

              return (
                <button
                  key={channel.id}
                  onClick={() => handleChannelSelect(channel.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 p-4 rounded-xl border transition-all',
                    isSelected
                      ? 'bg-dark-600 border-claw-500'
                      : 'bg-dark-700 border-dark-500 hover:border-dark-400'
                  )}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-dark-500">
                    <span className={info.color}>{info.icon}</span>
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className={clsx('text-sm font-medium truncate', isSelected ? 'text-white' : 'text-gray-300')}>
                      {info.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', stateMeta.tone)}>
                        <span className={clsx('w-1.5 h-1.5 rounded-full', stateMeta.dot)} />
                        {stateMeta.label}
                      </span>
                      <span className="text-gray-500">账号 {detail?.account_count ?? 0}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className={isSelected ? 'text-claw-400' : 'text-gray-600'} />
                </button>
              );
            })}
          </div>

          <div className="md:col-span-2">
            {currentChannel && currentInfo ? (
              <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center bg-dark-500', currentInfo.color)}>
                      {currentInfo.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">配置 {currentInfo.name}</h3>
                      {currentInfo.helpText && (
                        <p className="text-xs text-gray-500">{currentInfo.helpText}</p>
                      )}
                    </div>
                  </div>
                </div>
                {currentChannel.channel_type === 'webchat' ? (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                      <p className="text-sm text-gray-300">
                        网页端不是独立 bot 账号，而是附着在当前 Gateway 上的 WebChat 客户端。你可以把它当作一个额外入口，随时切到浏览器继续聊。
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-dark-500 bg-dark-600/60 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">WebChat</p>
                        <p className="mt-2 text-lg font-semibold text-white">本机浏览器入口</p>
                        <p className="mt-1 text-xs text-gray-500">默认连到当前 agent 的主会话</p>
                      </div>
                      <div className="rounded-xl border border-dark-500 bg-dark-600/60 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">DM 会话模式</p>
                        <p className="mt-2 text-lg font-semibold text-white">{sessionRouting.dmScope}</p>
                        <p className="mt-1 text-xs text-gray-500">决定 Telegram / Discord / WebChat 是否共用上下文</p>
                      </div>
                      <div className="rounded-xl border border-dark-500 bg-dark-600/60 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">共享映射</p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {sessionRouting.identityLinksText.trim() ? '已配置' : '未配置'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">用 identityLinks 把同一个人跨渠道合并到同一会话</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">DM 会话隔离策略</label>
                      <select
                        value={sessionRouting.dmScope}
                        onChange={(e) =>
                          setSessionRouting((prev) => ({ ...prev, dmScope: e.target.value }))
                        }
                        className="input-base"
                      >
                        <option value="main">main: 所有私聊共用主会话</option>
                        <option value="per-peer">per-peer: 按用户隔离</option>
                        <option value="per-channel-peer">per-channel-peer: 按渠道 + 用户隔离</option>
                        <option value="per-account-channel-peer">per-account-channel-peer: 按账号 + 渠道 + 用户隔离</option>
                      </select>
                      <p className="mt-2 text-xs text-gray-500">
                        多人共用一个机器人，推荐 `per-channel-peer`；同一渠道跑多个账号，推荐 `per-account-channel-peer`。
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-2">跨渠道共享用户映射 (session.identityLinks)</label>
                      <textarea
                        value={sessionRouting.identityLinksText}
                        onChange={(e) =>
                          setSessionRouting((prev) => ({ ...prev, identityLinksText: e.target.value }))
                        }
                        placeholder={'{\n  "alex": ["telegram:1628904587", "discord:987654321098765432"]\n}'}
                        className="input-base min-h-[180px] resize-y font-mono text-sm"
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        只有在 `per-peer / per-channel-peer / per-account-channel-peer` 下，这个映射才会把同一个人跨渠道合并成同一条私聊上下文。
                      </p>
                    </div>

                    <div className="pt-4 border-t border-dark-500 flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleOpenWebchat}
                        disabled={openingWebchat}
                        className="btn-secondary flex items-center gap-2"
                      >
                        {openingWebchat ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                        打开原始 WebChat
                      </button>
                      <button
                        onClick={handleSaveSessionRouting}
                        disabled={sessionSaving}
                        className="btn-primary flex items-center gap-2"
                      >
                        {sessionSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        保存会话共享
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {currentChannel.channel_type === 'feishu' && (
                      <div className="mb-4">
                        {feishuPluginLoading ? (
                          <div className="p-4 bg-dark-600 rounded-xl border border-dark-500 flex items-center gap-3">
                            <Loader2 size={20} className="animate-spin text-gray-400" />
                            <span className="text-gray-400">正在检查飞书插件状态...</span>
                          </div>
                        ) : feishuPluginStatus?.installed ? (
                          <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30 flex items-center gap-3">
                            <Package size={20} className="text-green-400" />
                            <div className="flex-1">
                              <p className="text-green-400 font-medium">飞书插件已安装</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {feishuPluginStatus.plugin_name || '@m1heng-clawd/feishu'}
                                {feishuPluginStatus.version && ` v${feishuPluginStatus.version}`}
                              </p>
                            </div>
                            <CheckCircle size={16} className="text-green-400" />
                          </div>
                        ) : (
                          <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30">
                            <div className="flex items-start gap-3">
                              <AlertTriangle size={20} className="text-amber-400 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-amber-400 font-medium">需要安装飞书插件</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  飞书渠道需要先安装 @m1heng-clawd/feishu 插件才能使用。
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    onClick={handleInstallFeishuPlugin}
                                    disabled={feishuPluginInstalling}
                                    className="btn-primary flex items-center gap-2 text-sm py-2"
                                  >
                                    {feishuPluginInstalling ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <Download size={14} />
                                    )}
                                    {feishuPluginInstalling ? '安装中...' : '一键安装插件'}
                                  </button>
                                  <button
                                    onClick={checkFeishuPlugin}
                                    disabled={feishuPluginLoading}
                                    className="btn-secondary flex items-center gap-2 text-sm py-2"
                                  >
                                    刷新状态
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                  或手动执行: <code className="px-1.5 py-0.5 bg-dark-600 rounded text-gray-400">openclaw plugins install @m1heng-clawd/feishu</code>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-4">
                      {currentInfo.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm text-gray-400 mb-2">
                            {field.label}
                            {field.required && <span className="text-red-400 ml-1">*</span>}
                            {configForm[field.key] && <span className="ml-2 text-green-500 text-xs">✓</span>}
                          </label>

                          {field.type === 'select' ? (
                            <select
                              value={configForm[field.key] || ''}
                              onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                              className="input-base"
                            >
                              <option value="">请选择...</option>
                              {field.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : field.type === 'password' ? (
                            <div className="relative">
                              <input
                                type={visiblePasswords.has(field.key) ? 'text' : 'password'}
                                value={configForm[field.key] || ''}
                                onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                                placeholder={field.placeholder}
                                className="input-base pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(field.key)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                title={visiblePasswords.has(field.key) ? '隐藏' : '显示'}
                              >
                                {visiblePasswords.has(field.key) ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </div>
                          ) : field.type === 'textarea' || field.type === 'json' ? (
                            <textarea
                              value={configForm[field.key] || ''}
                              onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                              rows={field.rows || 4}
                              className={clsx(
                                'input-base resize-y',
                                field.type === 'json' ? 'min-h-[160px] font-mono text-sm' : 'min-h-[96px]'
                              )}
                            />
                          ) : (
                            <input
                              type={field.type}
                              value={configForm[field.key] || ''}
                              onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                              placeholder={field.placeholder}
                              className="input-base"
                            />
                          )}
                        </div>
                      ))}

                      {currentChannel.channel_type === 'whatsapp' && (
                        <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                          <div className="flex items-center gap-3 mb-3">
                            <QrCode size={24} className="text-green-400" />
                            <div>
                              <p className="text-white font-medium">扫码登录</p>
                              <p className="text-xs text-gray-400">WhatsApp 需要扫描二维码登录</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleWhatsAppLogin}
                              disabled={loginLoading}
                              className="flex-1 btn-secondary flex items-center justify-center gap-2"
                            >
                              {loginLoading ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <QrCode size={16} />
                              )}
                              {loginLoading ? '等待登录...' : '启动扫码登录'}
                            </button>
                            <button
                              onClick={async () => {
                                await refreshStaticChannelData(currentChannel.id);
                                await refreshRealtimeStatus();
                                await handleQuickTest();
                              }}
                              disabled={testing}
                              className="btn-secondary flex items-center justify-center gap-2 px-4"
                              title="刷新状态"
                            >
                              {testing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-2 text-center">
                            登录成功后点击右侧按钮刷新状态，或运行: openclaw channels login --channel whatsapp
                          </p>
                        </div>
                      )}

                      <div className="pt-4 border-t border-dark-500 flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="btn-primary flex items-center gap-2"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          保存配置
                        </button>

                        <button
                          onClick={handleQuickTest}
                          disabled={testing}
                          className="btn-secondary flex items-center gap-2"
                        >
                          {testing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                          快速测试
                        </button>

                        {!showClearConfirm ? (
                          <button
                            onClick={handleShowClearConfirm}
                            disabled={clearing}
                            className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300 hover:border-red-500/50"
                          >
                            {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            清空配置
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-lg border border-red-500/50">
                            <span className="text-sm text-red-300">确定清空？</span>
                            <button
                              onClick={handleClearConfig}
                              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                            >
                              确定
                            </button>
                            <button
                              onClick={() => setShowClearConfirm(false)}
                              className="px-2 py-1 text-xs bg-dark-600 text-gray-300 rounded hover:bg-dark-500 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        )}
                      </div>

                      {testResult && (
                        <div
                          className={clsx(
                            'mt-4 p-4 rounded-xl flex items-start gap-3',
                            testResult.success ? 'bg-green-500/10' : 'bg-red-500/10'
                          )}
                        >
                          {testResult.success ? (
                            <CheckCircle size={20} className="text-green-400 mt-0.5" />
                          ) : (
                            <XCircle size={20} className="text-red-400 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className={clsx('font-medium', testResult.success ? 'text-green-400' : 'text-red-400')}>
                              {testResult.success ? '测试成功' : '测试失败'}
                            </p>
                            <p className="text-sm text-gray-400 mt-1">{testResult.message}</p>
                            {testResult.error && (
                              <p className="text-xs text-red-300 mt-2 whitespace-pre-wrap">
                                {testResult.error}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="h-full min-h-[360px] flex items-center justify-center text-gray-500 bg-dark-700/50 rounded-2xl border border-dark-500">
                <p>从左侧渠道列表选择一个入口开始配置</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
