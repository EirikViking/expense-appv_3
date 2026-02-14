import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InviteShareCard } from '@/components/InviteShareCard';
import { buildInviteFallbackLinks, tryNativeShare } from '@/lib/invite-share';

describe('InviteShareCard', () => {
  it('renders invite share actions', () => {
    const html = renderToStaticMarkup(
      React.createElement(InviteShareCard, {
        title: 'Invite lenke',
        subtitle: 'Vises kun én gang. Kopier eller del med brukeren.',
        link: 'https://example.com/set-password?token=abc',
        copyLabel: 'Kopier lenke',
        copiedLabel: 'Kopiert',
        shareLabel: 'Del',
        emailLabel: 'E-post',
        telegramLabel: 'Telegram',
        whatsappLabel: 'WhatsApp',
        facebookLabel: 'Facebook',
      })
    );

    expect(html).toContain('Invite lenke');
    expect(html).toContain('Kopier lenke');
    expect(html).toContain('Del');
    expect(html).toContain('Telegram');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('facebook.com/sharer/sharer.php');
  });

  it('supports native share and returns fallback when unavailable', async () => {
    const shareMock = vi.fn(async () => undefined);
    const shared = await tryNativeShare('https://example.com/invite', { share: shareMock }, 'Invite lenke');
    expect(shared).toBe(true);
    expect(shareMock).toHaveBeenCalledTimes(1);

    const notShared = await tryNativeShare('https://example.com/invite', {});
    expect(notShared).toBe(false);
  });

  it('builds fallback share links', () => {
    const links = buildInviteFallbackLinks('https://example.com/set-password?token=abc');

    expect(links.email.startsWith('mailto:?subject=')).toBe(true);
    expect(links.telegram).toContain('https://t.me/share/url');
    expect(links.whatsapp).toContain('https://wa.me/?text=');
    expect(links.facebook).toContain('https://www.facebook.com/sharer/sharer.php');
  });
});
