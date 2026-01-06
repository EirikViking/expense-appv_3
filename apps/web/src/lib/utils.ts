import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format Norwegian currency
export function formatCurrency(amount: number, showSign = false): string {
  const formatted = new Intl.NumberFormat('nb-NO', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));

  const sign = showSign ? (amount >= 0 ? '+' : '-') : (amount < 0 ? '-' : '');
  return `${sign}${formatted} kr`;
}

// Format compact currency (for charts)
export function formatCompactCurrency(amount: number): string {
  if (amount == null || isNaN(amount)) return '0 kr';
  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M kr`;
  }
  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(1)}k kr`;
  }
  return `${amount.toFixed(0)} kr`;
}

// Format percentage
export function formatPercentage(value: number, decimals = 1): string {
  if (value == null || isNaN(value)) return '+0.0%';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

// Format date in Norwegian format
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  try {
    return new Intl.DateTimeFormat('nb-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}

// Format date for display (shorter)
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr; // Return original if invalid
  try {
    return new Intl.DateTimeFormat('nb-NO', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return dateStr; // Return original string if formatting fails
  }
}

// Format month
export function formatMonth(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + '-01');
  if (isNaN(date.getTime())) return dateStr;
  try {
    return new Intl.DateTimeFormat('nb-NO', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}

// Format date as YYYY-MM-DD without timezone conversion
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get date range helpers
export function getMonthRange(date: Date = new Date()): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: formatDateLocal(start),
    end: formatDateLocal(end),
  };
}

export function getPreviousMonthRange(date: Date = new Date()): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const end = new Date(date.getFullYear(), date.getMonth(), 0);
  return {
    start: formatDateLocal(start),
    end: formatDateLocal(end),
  };
}

export function getLast30DaysRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: formatDateLocal(start),
    end: formatDateLocal(end),
  };
}

export function getLast90DaysRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return {
    start: formatDateLocal(start),
    end: formatDateLocal(end),
  };
}

// Truncate text with ellipsis
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

// Get initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Color helpers for categories
export const categoryColors = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e',
];

export function getColorByIndex(index: number): string {
  return categoryColors[index % categoryColors.length];
}
