import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { buildInviteFallbackLinks, tryNativeShare } from '@/lib/invite-share';

type InviteShareCardProps = {
  title: string;
  subtitle: string;
  link: string;
  copyLabel: string;
  copiedLabel: string;
  shareLabel: string;
  emailLabel: string;
  telegramLabel: string;
  whatsappLabel: string;
  facebookLabel: string;
};

export function InviteShareCard(props: InviteShareCardProps) {
  const {
    title,
    subtitle,
    link,
    copyLabel,
    copiedLabel,
    shareLabel,
    emailLabel,
    telegramLabel,
    whatsappLabel,
    facebookLabel,
  } = props;
  const [copied, setCopied] = useState(false);

  const fallbackLinks = useMemo(() => buildInviteFallbackLinks(link), [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    await tryNativeShare(link);
  };

  return (
    <div className="rounded-md border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm space-y-3">
      <div>
        <p className="text-emerald-100 font-semibold">{title}</p>
        <p className="text-emerald-100/80">{subtitle}</p>
      </div>

      <div className="rounded border border-emerald-200/30 bg-black/20 px-3 py-2 font-mono text-xs break-all text-emerald-100/90">
        {link}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          {copied ? copiedLabel : copyLabel}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void share()}>
          {shareLabel}
        </Button>
        <a href={fallbackLinks.email} target="_blank" rel="noreferrer">
          <Button type="button" variant="outline" size="sm">{emailLabel}</Button>
        </a>
        <a href={fallbackLinks.telegram} target="_blank" rel="noreferrer">
          <Button type="button" variant="outline" size="sm">{telegramLabel}</Button>
        </a>
        <a href={fallbackLinks.whatsapp} target="_blank" rel="noreferrer">
          <Button type="button" variant="outline" size="sm">{whatsappLabel}</Button>
        </a>
        <a href={fallbackLinks.facebook} target="_blank" rel="noreferrer">
          <Button type="button" variant="outline" size="sm">{facebookLabel}</Button>
        </a>
      </div>
    </div>
  );
}
