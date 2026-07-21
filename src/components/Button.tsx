import { type ReactNode } from 'react';

interface ButtonProps {
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
}

export function TabButton({ onClick, active = false, children, className = '' }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 py-2.5 px-2 rounded-xl font-semibold shadow-sm transition-all text-xs sm:text-sm lg:text-base ${
        active
          ? 'bg-tdf-accent text-tdf-on-accent border border-tdf-accent'
          : 'bg-white text-tdf-text-secondary border border-gray-200 hover:bg-tdf-card-hover'
      } ${className}`}
    >
      {children}
    </button>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Zoek..." }: SearchInputProps) {
  return (
    <div className="relative w-full">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white border border-gray-200 shadow-sm text-tdf-text-primary focus:outline-none focus:border-tdf-accent text-sm sm:text-base"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-tdf-text-muted"
          aria-label="Clear search"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}