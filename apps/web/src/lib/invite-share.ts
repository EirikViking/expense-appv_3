export interface ShareNavigatorLike {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
}

export function buildInviteShareText(link: string): string {
  return `Opprett konto via denne lenken: ${link}`;
}

export function buildInviteFallbackLinks(link: string): {
  email: string;
  telegram: string;
  whatsapp: string;
  facebook: string;
} {
  const subject = encodeURIComponent('Invite til Utgiftsanalyse');
  const body = encodeURIComponent(buildInviteShareText(link));
  const encodedLink = encodeURIComponent(link);
  const encodedText = encodeURIComponent(buildInviteShareText(link));

  return {
    email: `mailto:?subject=${subject}&body=${body}`,
    telegram: `https://t.me/share/url?url=${encodedLink}&text=${encodedText}`,
    whatsapp: `https://wa.me/?text=${encodedText}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`,
  };
}

export async function tryNativeShare(
  link: string,
  navigatorLike?: ShareNavigatorLike,
  title: string = 'Invite lenke'
): Promise<boolean> {
  const nav = navigatorLike ?? (globalThis as any).navigator;
  if (!nav || typeof nav.share !== 'function') return false;

  try {
    await nav.share({
      title,
      text: buildInviteShareText(link),
      url: link,
    });
    return true;
  } catch {
    return false;
  }
}
