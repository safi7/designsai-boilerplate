'use client';

import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';
import { AuthGate } from './auth-gate';
import { Sidebar } from './sidebar';

/** Authenticated layout: persistent sidebar on desktop, drawer on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);

  return (
    <AuthGate>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-72 shrink-0 border-r border-sidebar-border md:block">
          <Sidebar />
        </aside>

        <div className={cn('fixed inset-0 z-40 md:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}>
          <div className={cn('absolute inset-0 bg-black/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={() => setOpen(false)} />
          <aside
            className={cn('absolute inset-y-0 left-0 w-72 border-r shadow-xl transition-transform', open ? 'translate-x-0' : '-translate-x-full')}
          >
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 z-10" onClick={() => setOpen(false)} aria-label="Close menu">
              <X />
            </Button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center gap-2 border-b px-3 md:hidden">
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label={t('recent')}>
              <Menu />
            </Button>
            <span className="font-semibold">{config.appName}</span>
          </header>
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
