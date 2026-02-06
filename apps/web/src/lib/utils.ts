import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/\s/g, '').replace(',', '.');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function parseDateInput(dateStr: string): Date | null {
  const matchDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (matchDate) {
    const year = Number(matchDate[1]);
    const month = Number(matchDate[2]);
    const day = Number(matchDate[3]);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const matchMonth = /^(\d{4})-(\d{2})$/.exec(dateStr);
  if (matchMonth) {
    const year = Number(matchMonth[1]);
    const month = Number(matchMonth[2]);
    const date = new Date(year, month - 1, 1);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Format Norwegian currency
export function formatCurrency(amount: number, showSign = false): string {
  const safeAmount = toFiniteNumber(amount);
  const formatted = new Intl.NumberFormat('nb-NO', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safeAmount));

  const sign = showSign ? (safeAmount >= 0 ? '+' : '-') : (safeAmount < 0 ? '-' : '');
  return `${sign}${formatted} kr`;
}

// Format compact currency (for charts)
export function formatCompactCurrency(amount: number): string {
  const safeAmount = toFiniteNumber(amount);
  if (!Number.isFinite(safeAmount)) return '0 kr';
  if (Math.abs(safeAmount) >= 1000000) {
    return `${(safeAmount / 1000000).toFixed(1)}M kr`;
  }
  if (Math.abs(safeAmount) >= 1000) {
    return `${(safeAmount / 1000).toFixed(1)}k kr`;
  }
  return `${safeAmount.toFixed(0)} kr`;
}

// Format percentage
export function formatPercentage(value: number, decimals = 1): string {
  const safeValue = toFiniteNumber(value);
  if (!Number.isFinite(safeValue)) return '+0.0%';
  return `${safeValue >= 0 ? '+' : ''}${safeValue.toFixed(decimals)}%`;
}

// Format date in Norwegian format
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = parseDateInput(dateStr);
  if (!date) return dateStr;
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
  const date = parseDateInput(dateStr);
  if (!date) return dateStr; // Return original if invalid
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
  const date = parseDateInput(`${dateStr}-01`) ?? parseDateInput(dateStr);
  if (!date) return dateStr;
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

export function getYearToDateRange(date: Date = new Date()): { start: string; end: string } {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date);
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
