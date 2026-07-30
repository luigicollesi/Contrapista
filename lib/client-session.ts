export const SESSION_STORAGE_KEY = "contrapista-session";
export const BROWSER_ID_STORAGE_KEY = "contrapista-browser-id";

export type SavedSession<
  TUser extends {
    id: string;
    browserId?: string;
  } = {
    id: string;
    browserId?: string;
    nickname?: string | null;
    color?: string | null;
  },
> = {
  roomCode: string;
  user: TUser;
};

export function leftCaseStorageKey(code: string) {
  return `contrapista-left-case-${code}`;
}

export function readSavedSession<TUser extends { id: string; browserId?: string }>(
  code?: string,
): SavedSession<TUser> | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const session = JSON.parse(stored) as SavedSession<TUser>;
    if (!/^\d{4}$/.test(session.roomCode) || !session.user?.id) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return !code || session.roomCode === code ? session : null;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function readUserId(code: string) {
  return readSavedSession(code)?.user.id ?? null;
}

export function saveSession<TUser extends { id: string; browserId?: string }>(
  session: SavedSession<TUser>,
) {
  if (session.user.browserId) {
    localStorage.setItem(BROWSER_ID_STORAGE_KEY, session.user.browserId);
  }

  const serialized = JSON.stringify(session);
  localStorage.setItem(SESSION_STORAGE_KEY, serialized);
  localStorage.setItem(`contrapista-room-${session.roomCode}`, serialized);
}

export function clearSession(code: string) {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(`contrapista-room-${code}`);
}

export function getBrowserId() {
  let browserId = localStorage.getItem(BROWSER_ID_STORAGE_KEY);

  if (!browserId) {
    browserId = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_STORAGE_KEY, browserId);
  }

  return browserId;
}
