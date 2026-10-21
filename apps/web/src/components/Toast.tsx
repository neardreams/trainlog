// 通知（2.2 秒後自動消失），外觀同 v9
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useChrome } from '@/lib/chrome';
import { Icon } from '@/lib/icons';

export function Toast() {
  const toast = useChrome((s) => s.toast);
  const [hiddenId, setHiddenId] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setHiddenId(toast.id), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  const on = !!toast && toast.id !== hiddenId;
  return (
    <div className={clsx('toast', on && 'on')} role="status" aria-live="polite">
      <Icon name="check" />
      <span>{toast?.text}</span>
    </div>
  );
}
