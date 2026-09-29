import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string, lastName?: string | null): string {
  return `${name.charAt(0)}${lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';
}
