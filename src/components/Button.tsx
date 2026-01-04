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
      className={`flex-1 py-3 px-2 rounded-lg font-semibold transition-all text-xs sm:text-sm lg:text-base ${
        active
          ? 'bg-tdf-accent text-white border-2 border-tdf-accent'
          : 'bg-tdf-button-inactive text-tdf-button-text border-2 border-transparent'
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
        className="w-full px-4 py-3 pr-10 rounded-lg bg-white border-2 border-gray-300 text-tdf-text-primary focus:border-tdf-accent text-sm sm:text-base"
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