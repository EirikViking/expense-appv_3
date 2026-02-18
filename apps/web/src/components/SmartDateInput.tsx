import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parseDateInput } from '@/lib/date-input';

type SmartDateInputProps = {
  value: string;
  onChange: (isoDate: string) => void;
  onErrorChange?: (message: string | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  invalidFormatMessage?: string;
  invalidDateMessage?: string;
  clearMessage?: string;
};

export function SmartDateInput({
  value,
  onChange,
  onErrorChange,
  placeholder = 'YYYY-MM-DD eller DD.MM.YYYY',
  ariaLabel,
  invalidFormatMessage = 'Ugyldig datoformat.',
  invalidDateMessage = 'Ugyldig dato.',
  clearMessage = '',
}: SmartDateInputProps) {
  const hiddenDateInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const applyDraft = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) {
      onChange('');
      onErrorChange?.(clearMessage || null);
      return;
    }

    const parsed = parseDateInput(trimmed);
    if (!parsed.ok) {
      onErrorChange?.(parsed.reason === 'invalid_format' ? invalidFormatMessage : invalidDateMessage);
      return;
    }

    setDraft(parsed.iso);
    onChange(parsed.iso);
    onErrorChange?.(null);
  };

  return (
    <div className="relative flex items-center gap-2">
      <Input
        type="text"
        inputMode="numeric"
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          onErrorChange?.(null);
        }}
        onBlur={(e) => applyDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyDraft(draft);
          }
        }}
      />
      <input
        ref={hiddenDateInputRef}
        type="date"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          onChange(next);
          onErrorChange?.(null);
        }}
        className="absolute right-0 top-0 h-9 w-9 opacity-0 pointer-events-none z-40"
        aria-hidden
        tabIndex={-1}
      />
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} (velg i kalender)` : 'Velg dato i kalender'}
        className="relative z-50 h-9 w-9 shrink-0 rounded-md border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
        onClick={() => {
          const picker = hiddenDateInputRef.current;
          if (!picker) return;
          if (typeof picker.showPicker === 'function') picker.showPicker();
          else picker.focus();
        }}
      >
        <Calendar className="mx-auto h-4 w-4" />
      </button>
    </div>
  );
}

