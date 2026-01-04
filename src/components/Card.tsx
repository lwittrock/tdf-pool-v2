import { type ReactNode } from 'react';

interface CardProps {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function Card({ onClick, children, className = '' }: CardProps) {
  return (
    <div className={`bg-tdf-card rounded-lg shadow-md overflow-hidden ${className}`}>
      <div
        onClick={onClick}
        className={`p-3 ${onClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

interface CardRowProps {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
}

export function CardRow({ left, middle, right }: CardRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center justify-center min-w-[50px]">
        {left}
      </div>
      <div className="flex-1 min-w-0">
        {middle}
      </div>
      <div className="text-right min-w-[60px]">
        {right}
      </div>
    </div>
  );
}

interface CardExpandedSectionProps {
  title: string;
  children: ReactNode;
  isExpanded: boolean;
}

export function CardExpandedSection({ title, children, isExpanded }: CardExpandedSectionProps) {
  if (!isExpanded) return null;
  
  return (
    <div className="px-3 pb-3 bg-tdf-expanded border-t border-gray-200">
      <div className="pt-3">
        <h3 className="text-xs font-semibold mb-2 text-tdf-text-secondary">{title}</h3>
        {children}
      </div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string | number;
  subtitle?: string;
}

export function DetailRow({ label, value, subtitle }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-tdf-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        {subtitle && <span className="text-xs text-tdf-text-muted">{subtitle}</span>}
        <span className="text-sm font-bold text-tdf-text-primary">{value}</span>
      </div>
    </div>
  );
}