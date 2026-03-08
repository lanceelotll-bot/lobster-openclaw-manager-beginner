import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';

const iconMap = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const styleMap = {
  success: 'border-green-500/30 bg-green-500/10 text-green-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
  warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
  info: 'border-claw-500/30 bg-claw-500/10 text-claw-100',
} as const;

export function NotificationTray() {
  const notifications = useAppStore((state) => state.notifications);
  const removeNotification = useAppStore((state) => state.removeNotification);
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    notifications.forEach((notification) => {
      if (timersRef.current.has(notification.id)) return;
      const timer = window.setTimeout(() => {
        removeNotification(notification.id);
        timersRef.current.delete(notification.id);
      }, 6000);
      timersRef.current.set(notification.id, timer);
    });

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [notifications, removeNotification]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-3">
      <AnimatePresence initial={false}>
        {notifications.map((notification) => {
          const Icon = iconMap[notification.type];
          return (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={clsx(
                'pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl backdrop-blur',
                styleMap[notification.type]
              )}
            >
              <div className="flex items-start gap-3">
                <Icon size={18} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{notification.title}</p>
                  {notification.message ? (
                    <p className="mt-1 text-xs text-gray-300">{notification.message}</p>
                  ) : null}
                </div>
                <button
                  onClick={() => removeNotification(notification.id)}
                  className="rounded-lg p-1 text-gray-400 transition-colors hover:text-white"
                  title="关闭通知"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
