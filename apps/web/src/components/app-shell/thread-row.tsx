'use client';

import type { AgentThread } from '@boilerplate/shared-schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Pencil, Star, StarOff, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { threadsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

export function ThreadRow({ thread, onNavigate }: { thread: AgentThread; onNavigate?: () => void }) {
  const t = useTranslations('chat');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [title, setTitle] = useState(thread.title);
  const active = pathname === `/chat/${thread.id}`;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
  const update = useMutation({
    mutationFn: (patch: { title?: string; isFavorite?: boolean }) => threadsApi.update(thread.id, patch),
    onSuccess: () => {
      setDialog(null);
      void invalidate();
    },
    onError: error => toast.error(errorMessage(error, tErrors)),
  });
  const remove = useMutation({
    mutationFn: () => threadsApi.remove(thread.id),
    onSuccess: () => {
      setDialog(null);
      void invalidate();
      if (active) router.push('/chat');
    },
    onError: error => toast.error(errorMessage(error, tErrors)),
  });

  return (
    <div
      className={cn('group relative flex items-center rounded-md text-sm', active ? 'bg-sidebar-accent font-medium' : 'hover:bg-sidebar-accent/60')}
    >
      <Link
        href={`/chat/${thread.id}`}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5"
        aria-current={active ? 'page' : undefined}
      >
        {thread.status === 'running' ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : null}
        <span className="truncate">{thread.title}</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="mr-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={thread.title}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => update.mutate({ isFavorite: !thread.isFavorite })}>
            {thread.isFavorite ? <StarOff /> : <Star />}
            {thread.isFavorite ? t('unfavorite') : t('favorite')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setTitle(thread.title);
              setDialog('rename');
            }}
          >
            <Pencil />
            {tCommon('rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2 />
            {tCommon('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'rename'} onOpenChange={open => !open && setDialog(null)}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={event => {
              event.preventDefault();
              if (title.trim()) update.mutate({ title: title.trim() });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('renamePrompt')}</DialogTitle>
            </DialogHeader>
            <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={191} autoFocus aria-label={t('renamePrompt')} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {tCommon('cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={update.isPending || !title.trim()}>
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={open => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>{t('deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tCommon('cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
