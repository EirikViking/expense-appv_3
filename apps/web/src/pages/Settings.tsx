import { useEffect, useMemo, useState } from 'react';
import type { AppUser, UserRole } from '@expense/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Settings as SettingsIcon, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { InviteShareCard } from '@/components/InviteShareCard';
import { GIT_COMMIT } from '@/lib/version';

type UserDraft = {
  name: string;
  role: UserRole;
  active: boolean;
};

export function SettingsPage() {
  const { t } = useTranslation();
  const { user, actorUser, isImpersonating, checkAuth } = useAuth();
  const isAdmin = actorUser?.role === 'admin';

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [creatingUser, setCreatingUser] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState('');
  const [lastResetLink, setLastResetLink] = useState('');

  const appOrigin = useMemo(() => window.location.origin, []);

  const toInviteLink = (token: string) => `${appOrigin}/set-password?token=${encodeURIComponent(token)}`;
  const toResetLink = (token: string) => `${appOrigin}/reset-password?token=${encodeURIComponent(token)}`;

  const loadUsers = async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const result = await api.adminListUsers();
      setUsers(result.users);
      setDrafts(
        Object.fromEntries(
          result.users.map((u) => [
            u.id,
            { name: u.name, role: u.role, active: u.active },
          ])
        )
      );
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t('settingsUsers.loadFailed'));
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op
    }
  };

  const confirmReset = async () => {
    if (resetPhrase.trim().toUpperCase() !== 'DELETE') return;
    setLoading(true);
    try {
      await api.resetData(true);
      alert(t('settingsPage.resetSuccess'));
      window.location.reload();
    } catch (err: any) {
      alert(`${t('settingsPage.resetFailed')}: ${err.message || t('settingsPage.unknownError')}`);
    } finally {
      setLoading(false);
      setResetPhrase('');
      setResetDialogOpen(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setUsersError(null);
    try {
      const result = await api.adminCreateUser({
        email: newEmail.trim(),
        name: newName.trim(),
        role: newRole,
      });
      setLastInviteLink(toInviteLink(result.invite_token));
      setNewEmail('');
      setNewName('');
      setNewRole('user');
      await loadUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t('settingsUsers.createFailed'));
    } finally {
      setCreatingUser(false);
    }
  };

  const saveUser = async (targetUser: AppUser) => {
    const draft = drafts[targetUser.id];
    if (!draft) return;

    setSavingUserId(targetUser.id);
    setUsersError(null);
    try {
      await api.adminUpdateUser(targetUser.id, {
        name: draft.name,
        role: draft.role,
        active: draft.active,
      });
      await loadUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t('settingsUsers.saveFailed'));
    } finally {
      setSavingUserId(null);
    }
  };

  const createResetLink = async (targetUserId: string) => {
    setUsersError(null);
    try {
      const result = await api.adminCreateResetLink(targetUserId);
      setLastResetLink(toResetLink(result.reset_token));
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t('settingsUsers.resetFailed'));
    }
  };

  const impersonateUser = async (targetUserId: string) => {
    setImpersonatingUserId(targetUserId);
    setUsersError(null);
    try {
      await api.adminImpersonateUser(targetUserId);
      await checkAuth();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t('settingsUsers.impersonateFailed'));
    } finally {
      setImpersonatingUserId(null);
    }
  };

  const clearImpersonation = async () => {
    setUsersError(null);
    try {
      await api.adminClearImpersonation();
      await checkAuth();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t('settingsUsers.impersonateFailed'));
    }
  };

  const deleteUser = async (targetUser: AppUser) => {
    if (!window.confirm(t('settingsUsers.deleteConfirm', { name: targetUser.name }))) return;
    setDeletingUserId(targetUser.id);
    setUsersError(null);
    try {
      await api.adminDeleteUser(targetUser.id);
      await loadUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : t('settingsUsers.deleteFailed'));
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-8 w-8 text-white/80" />
        <h1 className="text-3xl font-bold">{t('settingsPage.title')}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settingsPage.appearanceTitle')}</CardTitle>
          <CardDescription>{t('settingsPage.appearanceDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border border-white/15 rounded-lg bg-white/5">
            <div className="space-y-0.5">
              <span className="font-medium text-base block">{t('settingsPage.showBudgets')}</span>
              <p className="text-sm text-white/70">{t('settingsPage.showBudgetsDisabledHelp')}</p>
            </div>
            <span className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">
              {t('budgetsPage.comingSoon')}
            </span>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('settingsUsers.title')}
            </CardTitle>
            <CardDescription>{t('settingsUsers.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usersError && (
              <div className="rounded-md border border-red-300/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {usersError}
              </div>
            )}

            <form className="grid gap-2 md:grid-cols-4" onSubmit={createUser}>
              <Input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t('settingsUsers.email')}
              />
              <Input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('settingsUsers.name')}
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="h-10 rounded-md border border-white/15 bg-white/5 px-3 text-sm"
              >
                <option value="user">{t('settingsUsers.roleUser')}</option>
                <option value="admin">{t('settingsUsers.roleAdmin')}</option>
              </select>
              <Button type="submit" disabled={creatingUser}>
                {creatingUser ? t('settingsUsers.creating') : t('settingsUsers.create')}
              </Button>
            </form>

            {lastInviteLink && (
              <InviteShareCard
                title={t('settingsUsers.inviteCardTitle')}
                subtitle={t('settingsUsers.inviteCardSubtitle')}
                link={lastInviteLink}
                copyLabel={t('settingsUsers.copyLink')}
                copiedLabel={t('settingsUsers.copied')}
                shareLabel={t('settingsUsers.share')}
                emailLabel={t('settingsUsers.shareEmail')}
                telegramLabel={t('settingsUsers.shareTelegram')}
                whatsappLabel={t('settingsUsers.shareWhatsapp')}
                facebookLabel={t('settingsUsers.shareFacebook')}
              />
            )}

            {lastResetLink && (
              <div className="rounded-md border border-cyan-300/30 bg-cyan-500/10 p-3 text-sm">
                <p className="text-cyan-100 mb-2">{t('settingsUsers.resetReady')}</p>
                <div className="break-all text-cyan-100/90">{lastResetLink}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void copyText(lastResetLink)}
                >
                  {t('settingsUsers.copyLink')}
                </Button>
              </div>
            )}

            {isImpersonating && actorUser && (
              <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="mb-2">
                  {t('settingsUsers.impersonatingAs')}: <strong>{user?.name || user?.email}</strong>
                </p>
                <Button variant="outline" size="sm" onClick={() => void clearImpersonation()}>
                  {t('settingsUsers.stopImpersonation')}
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {usersLoading && <p className="text-sm text-white/70">{t('settingsUsers.loading')}</p>}
              {!usersLoading && users.map((u) => {
                const draft = drafts[u.id] || { name: u.name, role: u.role, active: u.active };
                return (
                  <div key={u.id} className="grid gap-2 rounded-lg border border-white/15 bg-white/5 p-3 md:grid-cols-7">
                    <div className="md:col-span-2">
                      <p className="text-xs text-white/60">{t('settingsUsers.email')}</p>
                      <p className="text-sm">{u.email}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-white/60">{t('settingsUsers.name')}</p>
                      <Input
                        value={draft.name}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [u.id]: { ...draft, name: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-white/60">{t('settingsUsers.role')}</p>
                      <select
                        value={draft.role}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [u.id]: { ...draft, role: e.target.value as UserRole } }))}
                        className="h-10 w-full rounded-md border border-white/15 bg-white/5 px-3 text-sm"
                      >
                        <option value="user">{t('settingsUsers.roleUser')}</option>
                        <option value="admin">{t('settingsUsers.roleAdmin')}</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [u.id]: { ...draft, active: e.target.checked } }))}
                        />
                        {t('settingsUsers.active')}
                      </label>
                    </div>
                    <div className="flex flex-wrap items-end gap-2 md:col-span-7 md:justify-end">
                      <Button size="sm" variant="outline" onClick={() => void createResetLink(u.id)}>
                        {t('settingsUsers.resetLink')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={impersonatingUserId === u.id || isImpersonating || u.id === actorUser?.id}
                        onClick={() => void impersonateUser(u.id)}
                      >
                        {impersonatingUserId === u.id ? t('settingsUsers.loading') : t('settingsUsers.impersonate')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deletingUserId === u.id || u.id === actorUser?.id}
                        onClick={() => void deleteUser(u)}
                      >
                        {deletingUserId === u.id ? t('settingsPage.deleting') : t('transactions.delete')}
                      </Button>
                      <Button size="sm" disabled={savingUserId === u.id} onClick={() => void saveUser(u)}>
                        {savingUserId === u.id ? t('settingsUsers.saving') : t('settingsUsers.save')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border border-red-300/30 bg-red-500/5">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t('settingsPage.dangerZone')}
          </CardTitle>
          <CardDescription className="text-white/70">{t('settingsPage.dangerHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border border-red-300/30 rounded-lg bg-red-500/10">
            <div className="space-y-0.5">
              <p className="font-medium text-red-100">{t('settingsPage.deleteAllData')}</p>
              <p className="text-sm text-red-100/80">{t('settingsPage.deleteAllDataHelp')}</p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setResetDialogOpen(true)}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('settingsPage.deleteAllData')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={resetDialogOpen}
        onOpenChange={(open) => {
          if (!loading) {
            setResetDialogOpen(open);
            if (!open) setResetPhrase('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settingsPage.confirmDeleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('settingsPage.confirmDeleteHelp')}{' '}
              <span className="font-semibold">{t('settingsPage.deleteKeyword')}</span>{' '}
              {t('settingsPage.confirmDeleteHelpSuffix')}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={resetPhrase}
            onChange={(e) => setResetPhrase(e.target.value)}
            placeholder={t('settingsPage.typeDelete')}
            aria-label={t('settingsPage.typeDelete')}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetDialogOpen(false);
                setResetPhrase('');
              }}
              disabled={loading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReset}
              disabled={loading || resetPhrase.trim().toUpperCase() !== 'DELETE'}
            >
              {loading ? t('settingsPage.deleting') : t('settingsPage.confirmDeleteAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-right text-xs text-white/55">
        {t('settingsPage.buildLabel')}: <code className="rounded bg-white/10 px-1.5 py-0.5">{buildId}</code>
      </p>
    </div>
  );
}
  const buildId = GIT_COMMIT.slice(0, 7);
