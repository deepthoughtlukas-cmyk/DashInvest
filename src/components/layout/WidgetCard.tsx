import React from 'react';
import { GripHorizontal, X } from 'lucide-react';

interface WidgetCardProps {
  title: string;
  badge?: string;
  locked: boolean;
  noPadding?: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({
  title,
  badge,
  locked,
  noPadding = false,
  onRemove,
  children,
}) => {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-800/90 bg-[#0f1623] shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      {/* Header / Drag Handle */}
      <div
        className={`widget-drag-handle flex shrink-0 items-center justify-between gap-2 border-b border-slate-800/80 bg-[#121a29] px-3 py-1.5 ${
          locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {!locked && <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
          <h3 className="truncate text-xs font-semibold tracking-wide text-slate-200">{title}</h3>
          {badge && (
            <span className="shrink-0 rounded border border-slate-700/80 bg-slate-800/80 px-1.5 py-0.2 text-[10px] font-medium text-slate-400">
              {badge}
            </span>
          )}
        </div>

        {!locked && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Widget entfernen"
            className="widget-no-drag rounded p-0.5 text-slate-500 transition hover:bg-slate-800 hover:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className={`min-h-0 flex-1 overflow-hidden ${noPadding ? '' : 'p-3'}`}>
        {children}
      </div>
    </div>
  );
};
