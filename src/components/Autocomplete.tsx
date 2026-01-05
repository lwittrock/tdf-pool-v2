import { useState, useRef, useEffect } from 'react';

interface AutocompleteOption {
  id: string;
  name: string;
  team?: string;
}

interface AutocompleteProps {
  options: AutocompleteOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Autocomplete({ options, value, onChange, placeholder, disabled }: AutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter options based on input
  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(inputValue.toLowerCase()) ||
    (option.team && option.team.toLowerCase().includes(inputValue.toLowerCase()))
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update input when value prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    setHighlightedIndex(0);
    
    // If input is cleared, clear the selection
    if (!newValue) {
      onChange('');
    }
  };

  const handleSelect = (option: AutocompleteOption) => {
    setInputValue(option.name);
    onChange(option.name);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tdf-accent disabled:bg-gray-100 disabled:cursor-not-allowed"
      />
      
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.map((option, index) => (
            <div
              key={option.id}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer ${
                index === highlightedIndex
                  ? 'bg-tdf-accent text-white'
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="font-medium">{option.name}</div>
              {option.team && (
                <div className={`text-xs ${
                  index === highlightedIndex ? 'text-white opacity-90' : 'text-gray-500'
                }`}>
                  {option.team}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {isOpen && filteredOptions.length === 0 && inputValue && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2 text-gray-500 text-sm">
          Geen renners gevonden
        </div>
      )}
    </div>
  );
}

// Multi-select autocomplete for DNF/DNS riders
interface MultiAutocompleteProps {
  options: AutocompleteOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function MultiAutocomplete({ options, selectedValues, onChange, placeholder }: MultiAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(option =>
    !selectedValues.includes(option.name) &&
    (option.name.toLowerCase().includes(inputValue.toLowerCase()) ||
    (option.team && option.team.toLowerCase().includes(inputValue.toLowerCase())))
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAdd = (option: AutocompleteOption) => {
    onChange([...selectedValues, option.name]);
    setInputValue('');
    setIsOpen(false);
  };

  const handleRemove = (name: string) => {
    onChange(selectedValues.filter(v => v !== name));
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected riders */}
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedValues.map(name => (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm"
            >
              {name}
              <button
                type="button"
                onClick={() => handleRemove(name)}
                className="text-gray-500 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tdf-accent"
      />

      {/* Dropdown */}
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.map((option) => (
            <div
              key={option.id}
              onClick={() => handleAdd(option)}
              className="px-3 py-2 cursor-pointer hover:bg-gray-100"
            >
              <div className="font-medium">{option.name}</div>
              {option.team && (
                <div className="text-xs text-gray-500">{option.team}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}