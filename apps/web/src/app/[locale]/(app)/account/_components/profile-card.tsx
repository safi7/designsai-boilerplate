'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES, LocaleSchema, type UserResponse } from '@boilerplate/shared-schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALES } from '@/i18n/routing';
import { usersApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';
import { initials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';

const ProfileFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
  language: LocaleSchema,
});
type ProfileForm = z.infer<typeof ProfileFormSchema>;

export function ProfileCard({ user }: { user: UserResponse }) {
  const t = useTranslations('account');
  const tAuth = useTranslations('auth');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const tLanguages = useTranslations('languages');
  const queryClient = useQueryClient();
  const setUser = useAuthStore(s => s.setUser);
  const router = useRouter();
  const pathname = usePathname();
  const fileInput = useRef<HTMLInputElement>(null);

  const onUser = (next: UserResponse) => {
    setUser(next);
    queryClient.setQueryData(queryKeys.me, next);
  };

  const form = useForm<ProfileForm>({
    resolver: zodResolver(ProfileFormSchema),
    values: { name: user.name, lastName: user.lastName ?? '', language: (user.language === 'es' ? 'es' : 'en') as ProfileForm['language'] },
  });

  const save = useMutation({
    mutationFn: (values: ProfileForm) => usersApi.updateProfile({ name: values.name, lastName: values.lastName || null, language: values.language }),
    onSuccess: next => {
      onUser(next);
      toast.success(tCommon('saved'));
      if (next.language !== user.language) router.replace(pathname, { locale: next.language as (typeof LOCALES)[number] });
    },
    onError: error => toast.error(errorMessage(error, tErrors)),
  });
  const upload = useMutation({ mutationFn: usersApi.uploadAvatar, onSuccess: onUser, onError: error => toast.error(errorMessage(error, tErrors)) });
  const removeAvatar = useMutation({
    mutationFn: usersApi.removeAvatar,
    onSuccess: onUser,
    onError: error => toast.error(errorMessage(error, tErrors)),
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) return toast.error(tErrors('payload_too_large'));
    if (!(AVATAR_CONTENT_TYPES as readonly string[]).includes(file.type)) return toast.error(tErrors('unsupported_media_type'));
    upload.mutate(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile')}</CardTitle>
        <CardDescription>{t('profileDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-lg">{initials(user.name, user.lastName)}</AvatarFallback>
          </Avatar>
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
                {upload.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Upload />}
                {t('uploadAvatar')}
              </Button>
              {user.avatarUrl ? (
                <Button variant="ghost" size="sm" disabled={removeAvatar.isPending} onClick={() => removeAvatar.mutate()}>
                  {t('removeAvatar')}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t('avatarHint')}</p>
            <input
              ref={fileInput}
              type="file"
              accept={AVATAR_CONTENT_TYPES.join(',')}
              className="hidden"
              aria-label={t('avatar')}
              onChange={event => {
                onFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
        </div>

        <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(values => save.mutate(values))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={tAuth('firstName')} autoComplete="given-name" error={form.formState.errors.name?.message} {...form.register('name')} />
            <FormField
              label={tAuth('lastName')}
              autoComplete="family-name"
              error={form.formState.errors.lastName?.message}
              {...form.register('lastName')}
            />
          </div>
          <FormField label={tAuth('email')} value={user.email} readOnly disabled />
          <div className="grid gap-2">
            <Label htmlFor="language">{t('language')}</Label>
            <select
              id="language"
              className="h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              {...form.register('language')}
            >
              {LOCALES.map(locale => (
                <option key={locale} value={locale}>
                  {tLanguages(locale)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
              {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {tCommon('save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
