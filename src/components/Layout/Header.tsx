import { useState } from 'react';
import { PageType } from '../../App';
import { RefreshCw, ExternalLink, Loader2, LayoutDashboard } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';

interface HeaderProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
}

const pageTitles: Record<PageType, { title: string; description: string }> = {
  dashboard: { title: '概览', description: '服务状态、日志与快捷操作' },
  ai: { title: 'AI 模型配置', description: '配置 AI 提供商和模型' },
  channels: { title: '消息渠道', description: '配置 Telegram、Discord、飞书等' },
  cron: { title: '定时任务', description: '查看用量并管理自动执行任务' },
  memory: { title: '记忆中心', description: '管理候选记忆和长期记忆文件' },
  testing: { title: '测试诊断', description: '系统诊断与问题排查' },
  logs: { title: '应用日志', description: '查看 Manager 应用的控制台日志' },
  settings: { title: '设置', description: '身份配置与高级选项' },
};

export function Header({ currentPage, onNavigate }: HeaderProps) {
  const { title, description } = pageTitles[currentPage];
  const [opening, setOpening] = useState(false);

  const handleOpenOriginalConsole = async () => {
    setOpening(true);
    try {
      const url = await invoke<string>('get_dashboard_url');
      await open(url);
    } catch (e) {
      console.error('打开原始控制台失败:', e);
      window.open('http://127.0.0.1:18789', '_blank');
    } finally {
      setOpening(false);
    }
  };

  return (
    <header className="h-14 bg-dark-800/50 border-b border-dark-600 flex items-center justify-between px-6 titlebar-drag backdrop-blur-sm">
      {/* 左侧：页面标题 */}
      <div className="titlebar-no-drag">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-xs text-gray-500">{description}</p>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center gap-2 titlebar-no-drag">
        <button
          onClick={() => window.location.reload()}
          className="icon-button text-gray-400 hover:text-white"
          title="刷新"
        >
          <RefreshCw size={16} />
        </button>
        {currentPage !== 'dashboard' && (
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-300 hover:text-white transition-colors"
            title="返回管理台概览"
          >
            <LayoutDashboard size={14} />
            <span>概览</span>
          </button>
        )}
        <button
          onClick={handleOpenOriginalConsole}
          disabled={opening}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          title="打开 OpenClaw 原始控制台"
        >
          {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
          <span>原始控制台</span>
        </button>
      </div>
    </header>
  );
}
