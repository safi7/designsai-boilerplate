'use client';

import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth.store';
import { ProfileCard } from './_components/profile-card';
import { SecurityCard } from './_components/security-card';

export default function AccountPage() {
  const t = useTranslations('account');
  const user = useAuthStore(s => s.user);
  if (!user) return null;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <ProfileCard user={user} />
        <SecurityCard user={user} />
      </div>
    </div>
  );
}
