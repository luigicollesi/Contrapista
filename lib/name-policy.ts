const RESERVED_NAMES = new Set([
  "admin",
  "administrator",
  "administrador",
  "moderador",
  "moderator",
  "mod",
  "staff",
  "suporte",
  "support",
  "sistema",
  "system",
  "contrapista",
]);

const BANNED_EXACT_TOKENS = new Set([
  "anal",
  "anus",
  "arrombado",
  "ass",
  "bastard",
  "bicha",
  "bitch",
  "boquete",
  "buceta",
  "butt",
  "cacete",
  "caralho",
  "cock",
  "cu",
  "cunt",
  "dick",
  "fag",
  "faggot",
  "foda",
  "foder",
  "fodido",
  "fuck",
  "fucker",
  "fucking",
  "hentai",
  "merda",
  "nazi",
  "nazista",
  "nude",
  "nudes",
  "pau",
  "pinto",
  "piroca",
  "porn",
  "porno",
  "porra",
  "puta",
  "puto",
  "pussy",
  "rape",
  "rapist",
  "rola",
  "sex",
  "sexo",
  "shit",
  "slut",
  "tarado",
  "viado",
  "whore",
  "xereca",
  "xota",
  "xxx",
]);

const BANNED_COMPACT_PARTS = [
  "arrombado",
  "asshole",
  "buceta",
  "caralho",
  "chupa",
  "chupameu",
  "chupaminha",
  "cuzinho",
  "cuzao",
  "filhodaputa",
  "foda",
  "foder",
  "fuck",
  "motherfucker",
  "onlyfans",
  "pornhub",
  "porno",
  "punheta",
  "putaria",
  "puta",
  "rapist",
  "xvideos",
  "xereca",
  "xoxota",
];

const HATE_SPEECH_COMPACT_PARTS = [
  "heilhitler",
  "hitler",
  "kkk",
  "nigger",
  "nigga",
  "nazista",
  "whitepower",
];

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
};

function normalizeForNamePolicy(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[0123456789@$!+]/g, (char) => LEET_MAP[char] ?? char)
    .replace(/[^a-z]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNameTokens(value: string) {
  return normalizeForNamePolicy(value).split(" ").filter(Boolean);
}

function hasRepeatedCharacterAbuse(value: string) {
  return /(.)\1{5,}/u.test(value);
}

function hasBannedCompactPart(compact: string) {
  return [...BANNED_COMPACT_PARTS, ...HATE_SPEECH_COMPACT_PARTS].some((part) =>
    compact.includes(part),
  );
}

export function validateDisplayNamePolicy(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, message: "Informe um nome." };
  }

  if (hasRepeatedCharacterAbuse(trimmed)) {
    return {
      ok: false,
      message: "Escolha um nome sem repetição exagerada de caracteres.",
    };
  }

  const tokens = getNameTokens(trimmed);
  const compact = tokens.join("");

  if (!tokens.length) {
    return { ok: false, message: "Escolha um nome legível." };
  }

  if (tokens.some((token) => RESERVED_NAMES.has(token)) || RESERVED_NAMES.has(compact)) {
    return {
      ok: false,
      message: "Esse nome é reservado. Escolha outro nome.",
    };
  }

  if (tokens.some((token) => BANNED_EXACT_TOKENS.has(token))) {
    return {
      ok: false,
      message: "Esse nome contém termo impróprio. Escolha outro nome.",
    };
  }

  if (hasBannedCompactPart(compact)) {
    return {
      ok: false,
      message: "Esse nome contém termo impróprio. Escolha outro nome.",
    };
  }

  return { ok: true, message: "" };
}

export function assertDisplayNameAllowed(value: string) {
  const result = validateDisplayNamePolicy(value);

  if (!result.ok) {
    throw new Error(result.message);
  }
}
