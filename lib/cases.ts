import { chatCompletion, getAvailableAiModelCount } from "@/lib/ai";
import { AiModelsUnavailableError } from "@/lib/ai/errors";
import { dbQuery } from "@/lib/db";
import {
  getClueDistribution,
  getMinimumCluesPerPlayer,
  getTrueCluePercentageStates,
} from "@/lib/room-config";
import {
  DEFAULT_ROOM_CONFIG,
  setRoomActiveCase,
  type RoomConfig,
} from "@/lib/rooms";

export type GameCase = {
  id: string;
  title: string;
  case_text: string;
  final_answer: string;
  true_clues: string[];
  false_clues: string[];
  created_at?: string;
};

export type CaseSummary = {
  id: string;
  title: string;
  totalClues: number;
  falseCluePercentage: number;
  created_at?: string;
};

type GeneratedCase = Omit<GameCase, "id" | "created_at">;

const MAX_CASE_GENERATION_ATTEMPTS = 3;
const MIN_CASE_GENERATION_TOKENS = 4_600;
const MAX_CASE_GENERATION_TOKENS = 7_000;
const caseGenerationLocks = new Map<string, Promise<GameCase>>();
const CASE_JSON_KEYS = [
  "title",
  "case_text",
  "true_clues",
  "false_clues",
  "final_answer",
] as const;

function distributeCluesAcrossQuestions(total: number) {
  const base = Math.floor(total / 3);
  const remainder = total % 3;

  return [0, 1, 2].map((index) => base + (index < remainder ? 1 : 0));
}

let lastCaseCreationDurationSeconds: number | null = null;

class CaseSavedWithoutRoomActivationError extends Error {
  constructor(readonly gameCase: GameCase) {
    super(
      "O caso foi salvo, mas a sala não estava mais pronta para ativá-lo. Voltem para a ante-sala e iniciem novamente quando quiserem.",
    );
    this.name = "CaseSavedWithoutRoomActivationError";
  }
}

export function getLastCaseCreationDurationSeconds() {
  return lastCaseCreationDurationSeconds;
}

function rememberCaseCreationDuration(startedAt: number) {
  lastCaseCreationDurationSeconds = Math.max(
    1,
    Math.round((Date.now() - startedAt) / 1000),
  );
}

function hasCaseJsonShape(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return CASE_JSON_KEYS.every((key) => key in value);
}

function tryParseJsonCandidate(candidate: string) {
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

function isJsonCodeFence(language: string | undefined) {
  return !language || language.toLowerCase() === "json";
}

function extractBalancedObject(text: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, index + 1).trim();
      }
    }
  }

  return null;
}

function findJsonCandidate(text: string) {
  const candidates: string[] = [];
  const repairCandidates: string[] = [];
  const trimmed = text.trim();

  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
  }

  for (const match of text.matchAll(/```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g)) {
    const [, language, content] = match;

    if (!isJsonCodeFence(language)) {
      continue;
    }

    const candidate = content.trim();

    if (candidate.startsWith("{")) {
      candidates.push(candidate);
      repairCandidates.push(candidate);
    }
  }

  const firstBrace = text.indexOf("{");

  if (firstBrace < 0) {
    return null;
  }

  const lastBrace = text.lastIndexOf("}");

  if (lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1).trim();
    candidates.push(candidate);
    repairCandidates.push(candidate);
  }

  for (let index = firstBrace; index >= 0 && index < text.length; index += 1) {
    if (text[index] !== "{") {
      continue;
    }

    const candidate = extractBalancedObject(text, index);

    if (candidate) {
      candidates.push(candidate);
      repairCandidates.push(candidate);
    }
  }

  for (const candidate of candidates) {
    const parsed = tryParseJsonCandidate(candidate);

    if (hasCaseJsonShape(parsed)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    const parsed = tryParseJsonCandidate(candidate);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return candidate;
    }
  }

  return repairCandidates[0] ?? null;
}

function extractJson(text: string) {
  const candidate = findJsonCandidate(text);

  if (candidate) {
    return candidate;
  }

  if (text.includes("{")) {
    throw new Error("A IA retornou um objeto JSON incompleto.");
  }

  throw new Error(
    `A IA respondeu texto em vez de JSON: ${text.slice(0, 80)}`,
  );
}

function normalizeClueArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((clue) => String(clue ?? "").trim())
    .filter(Boolean);
}

function countRoomUsers(users: unknown) {
  return Array.isArray(users) ? users.length : 0;
}

function areCaseCreationUsersReady(users: unknown) {
  return (
    Array.isArray(users) &&
    users.length > 0 &&
    users.every((user) => {
      if (!user || typeof user !== "object") {
        return false;
      }

      const data = user as {
        nickname?: unknown;
        color?: unknown;
        ready?: unknown;
      };

      return Boolean(data.nickname && data.color && data.ready === true);
    })
  );
}

async function assertRoomStillReadyForCaseCreation(roomCode: string) {
  const current = await dbQuery<{
    activecase: string | null;
    users: unknown;
  }>(
    `
      SELECT activecase::text AS activecase, users
      FROM game_rooms
      WHERE room_code = $1
    `,
    [roomCode],
  );
  const room = current.rows[0];

  if (!room) {
    throw new Error("Sala não encontrada durante a criação do caso.");
  }

  if (room.activecase) {
    return;
  }

  if (!areCaseCreationUsersReady(room.users)) {
    throw new Error(
      "A sala mudou de estado antes de receber o caso criado. Voltem para a ante-sala e tentem novamente.",
    );
  }
}

function isCaseCreationStateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes("sala não encontrada durante") ||
    normalized.includes("não há jogadores") ||
    normalized.includes("sala mudou de estado") ||
    normalized.includes("todos os jogadores precisam estar prontos")
  );
}

function normalizeCaseConfig(config: Partial<RoomConfig> | null | undefined) {
  function numberOrDefault(key: Exclude<keyof RoomConfig, "timersEnabled">) {
    const value = config?.[key];
    const numericValue = typeof value === "number" ? value : Number(value);

    return Number.isFinite(numericValue) ? numericValue : DEFAULT_ROOM_CONFIG[key];
  }

  return {
    timersEnabled:
      typeof config?.timersEnabled === "boolean"
        ? config.timersEnabled
        : DEFAULT_ROOM_CONFIG.timersEnabled,
    readingTimeSeconds: numberOrDefault("readingTimeSeconds"),
    clueSelectionTimeSeconds: numberOrDefault("clueSelectionTimeSeconds"),
    revealedClueAnalysisTimeSeconds: numberOrDefault(
      "revealedClueAnalysisTimeSeconds",
    ),
    roundAnalysisTimeSeconds: numberOrDefault("roundAnalysisTimeSeconds"),
    finalGuessTimeSeconds: numberOrDefault("finalGuessTimeSeconds"),
    trueCluesPerPlayer: numberOrDefault("trueCluesPerPlayer"),
    cluesPerPlayer: numberOrDefault("cluesPerPlayer"),
  } satisfies RoomConfig;
}

function hasPlaceholderText(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "..." ||
    normalized.includes("<") ||
    normalized.includes(">") ||
    normalized.includes("pista verdadeira") ||
    normalized.includes("pista falsa") ||
    normalized.includes("título curto") ||
    normalized.includes("perguntas numeradas") ||
    normalized.includes("resposta: ...") ||
    normalized.includes("string original") ||
    normalized.includes("string com") ||
    normalized.includes("array com") ||
    normalized.includes("sem placeholder") ||
    /\.{3,}/.test(normalized)
  );
}

function assertNoPlaceholders(label: string, values: string[]) {
  const invalidValue = values.find(hasPlaceholderText);

  if (invalidValue) {
    throw new Error(
      `Resposta da IA manteve placeholder em ${label}: ${invalidValue.slice(0, 80)}`,
    );
  }
}

function assertGeneratedCase(
  value: unknown,
  requiredTrueClues: number,
  requiredFalseClues: number,
): GeneratedCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A resposta precisa ser um objeto JSON.");
  }

  const data = value as Partial<Record<keyof GeneratedCase, unknown>>;
  const receivedKeys = Object.keys(value);
  const trueClues = normalizeClueArray(data.true_clues);
  const falseClues = normalizeClueArray(data.false_clues);

  for (const key of ["title", "case_text", "final_answer"] as const) {
    if (!(key in value)) {
      throw new Error(
        `Campo obrigatório ausente: ${key}. Chaves recebidas: ${receivedKeys.join(", ") || "nenhuma"}.`,
      );
    }

    if (typeof data[key] !== "string" || !data[key]?.trim()) {
      throw new Error(`Campo obrigatório vazio ou inválido: ${key}.`);
    }
  }

  if (trueClues.length !== requiredTrueClues) {
    throw new Error(
      `Resposta da IA deveria ter exatamente ${requiredTrueClues} pistas verdadeiras, mas retornou ${trueClues.length}.`,
    );
  }

  if (falseClues.length !== requiredFalseClues) {
    throw new Error(
      `Resposta da IA deveria ter exatamente ${requiredFalseClues} pistas falsas, mas retornou ${falseClues.length}.`,
    );
  }

  const title = data.title as string;
  const caseText = data.case_text as string;
  const finalAnswer = data.final_answer as string;

  assertNoPlaceholders("campos principais", [title, caseText, finalAnswer]);
  assertNoPlaceholders("pistas verdadeiras", trueClues);
  assertNoPlaceholders("pistas falsas", falseClues);

  const questionSection = caseText.match(
    /Perguntas centrais do caso:\s*([\s\S]+)$/i,
  )?.[1];
  const numberedQuestions = questionSection
    ? [...questionSection.matchAll(/(?:^|\n)\s*([1-3])[.)]\s*[^?\n]+\?/g)].map(
        (match) => Number(match[1]),
      )
    : [];

  if (numberedQuestions.join(",") !== "1,2,3") {
    throw new Error(
      "O caso precisa terminar com exatamente três perguntas diretas numeradas de 1 a 3.",
    );
  }

  const numberedAnswers = [
    ...finalAnswer.matchAll(/(?:^|\n)\s*([1-3])[.)]\s*\S/g),
  ].map((match) => Number(match[1]));

  if (numberedAnswers.join(",") !== "1,2,3") {
    throw new Error(
      "A resposta final precisa conter exatamente três respostas numeradas de 1 a 3.",
    );
  }

  return {
    title: title.trim(),
    case_text: caseText.trim(),
    final_answer: finalAnswer.trim(),
    true_clues: trueClues.slice(0, requiredTrueClues),
    false_clues: falseClues.slice(0, requiredFalseClues),
  };
}

function parseGeneratedJson(text: string) {
  const jsonText = extractJson(text);

  return JSON.parse(jsonText) as unknown;
}

async function repairGeneratedCase(
  text: string,
  validationError: unknown,
  requiredTrueClues: number,
  requiredFalseClues: number,
  sessionId: string,
  excludedCombinations: Set<string>,
  beforeRequest?: () => Promise<void>,
) {
  const errorMessage =
    validationError instanceof Error
      ? validationError.message
      : "estrutura de caso inválida";
  const trueGroups = distributeCluesAcrossQuestions(requiredTrueClues);
  const falseGroups = distributeCluesAcrossQuestions(requiredFalseClues);

  await beforeRequest?.();

  const repair = await chatCompletion({
    temperature: 0,
    maxTokens: 4600,
    sessionId,
    onProgress: async (progress) => {
      if (progress.type === "model_selected") {
        excludedCombinations.add(`${progress.apiKeySlot}:${progress.modelSlot}`);
      }
    },
    responseFormat: CASE_RESPONSE_FORMAT,
    messages: [
      {
        role: "system",
        content:
          "Você corrige um caso para cumprir exatamente o JSON solicitado. Corrija tanto sintaxe JSON quanto campos ou conteúdo inválidos. Responda somente um objeto JSON completo, com as chaves title, case_text, true_clues, false_clues e final_answer. Preserve a história quando possível. Cada pista deve ser uma charada, enigma, ditado adaptado ou jogo de palavras ligado a somente uma das três perguntas, sem declarar sua resposta. Distribua ao menos uma true_clue por pergunta. Não escreva markdown, explicações ou chaves extras.",
      },
      {
        role: "user",
        content: `
O resultado abaixo falhou nesta validação: ${errorMessage}

Reescreva-o como um caso completo e válido. Mantenha exatamente ${requiredTrueClues} true_clues e ${requiredFalseClues} false_clues.
Distribua internamente true_clues entre as perguntas 1–3 em ${trueGroups.join("/")} pistas e false_clues em ${falseGroups.join("/")}. Pistas do mesmo conjunto se complementam. Não revele os conjuntos nem identifique a pergunta na pista.

Resultado recebido:
${text}
`.trim(),
      },
    ],
  });

  return parseGeneratedJson(repair.text);
}

function roomCaseGenerationSessionId(roomCode: string) {
  return `contrapista:room:${roomCode}:case-generation:v2`;
}

const CASE_GENERATION_SYSTEM_PROMPT = `
Crie um caso original em pt-BR para o jogo de dedução Contrapista.
Retorne somente este JSON:
{"title":"...","case_text":"...","true_clues":[],"false_clues":[],"final_answer":"..."}

Use exatamente essas 5 chaves e essa ordem. Primeiro caractere: "{". Último: "}". Use aspas duplas JSON. Sem markdown, cerca de código, chaves extras, comentários, planejamento ou texto externo.

Construa silenciosamente de trás para frente:
1. Crie primeiro três respostas diretas, compatíveis entre si, numeradas de 1 a 3; elas formam a solução e a cronologia real.
2. A partir dessas respostas, crie exatamente três perguntas diretas e simples, numeradas de 1 a 3 na mesma ordem.
3. Para cada pergunta, crie uma rota enigmática até a resposta correta; crie também rotas para respostas erradas plausíveis conforme a quantidade de false_clues.
4. Transforme as rotas corretas em true_clues e as rotas erradas em false_clues.
5. Molde case_text em torno das três respostas e termine com as três perguntas. Não exponha o planejamento.

Campos:
- title: começa com "O CASO DO" ou "O CASO DA".
- case_text: 2–3 parágrafos com incidente, 3–4 suspeitos, álibis, horários (opcional), objetos e vestígios; termina com "Perguntas centrais do caso:" e exatamente três perguntas curtas nas linhas "1.", "2." e "3.".
- true_clues e false_clues: pistas curtas, complementares e sem rótulos. Nenhuma pista listada nesses arrays pode aparecer ou ser parafraseada em case_text.
- final_answer: exatamente três respostas nas linhas "1.", "2." e "3.", correspondendo às perguntas na mesma ordem; pode explicar brevemente a dedução sem introduzir fatos necessários novos.

Regras de dedução:
- case_text + true_clues provam uma única solução sem conhecimento externo.
- Organize cada tipo de pista em até três conjuntos internos, um por pergunta. Cada pista pertence a somente um conjunto. Não revele, rotule nem agrupe esses conjuntos no JSON.
- Em conjuntos com várias pistas, cada pista fornece apenas uma parte e elas precisam ser combinadas para revelar a conclusão. Em conjuntos com uma pista, sua charada exige interpretação e não declara a resposta.
- true_clues conduzem da pergunta à resposta correta; false_clues conduzem da pergunta a uma resposta errada plausível, mas refutável. Nenhuma false_clue pode sustentar outra solução completa.
- Nenhuma pista pode responder diretamente à pergunta, citar literalmente sua resposta ou entregar sozinha culpado, objeto, método, motivo ou local.
- Toda true_clue e false_clue deve ser enigmática por si e exigir interpretação. Prefira charadas curtas, ditados populares adaptados, metáforas e jogos de palavras que codifiquem um passo da dedução.
- Varie também descrição indireta, duplo sentido, rima, palavra oculta, iniciais, inversão, letras alternadas, associação e pistas complementares. Não repita o mesmo mecanismo em sequência. Cada enigma deve ser claro e solucionável em pt-BR.
- Evite pistas vagas, explícitas demais ou repetitivas. Varie crime, cenário, motivo, método, objeto e lógica.

Não baseie a solução apenas em câmera, GPS, DNA, registro digital, confissão ou mensagem explícita.
`.trim();

function casePrompt({
  requiredTrueClues,
  requiredFalseClues,
  previousError,
}: {
  playerCount: number;
  requiredTrueClues: number;
  requiredFalseClues: number;
  trueCluePercentage: number;
  cluesPerPlayer: number;
  previousError?: string;
}) {
  if (requiredTrueClues < 3) {
    throw new Error("São necessárias pelo menos 3 true_clues.");
  }

  const trueGroups = distributeCluesAcrossQuestions(requiredTrueClues);
  const falseGroups = distributeCluesAcrossQuestions(requiredFalseClues);

  return `
- true_clues: exatamente ${requiredTrueClues} itens.
- false_clues: exatamente ${requiredFalseClues} itens.
- Separe internamente true_clues em três conjuntos: ${trueGroups[0]} para a pergunta 1, ${trueGroups[1]} para a pergunta 2 e ${trueGroups[2]} para a pergunta 3.
- Separe internamente false_clues em três conjuntos: ${falseGroups[0]} para a pergunta 1, ${falseGroups[1]} para a pergunta 2 e ${falseGroups[2]} para a pergunta 3.
- Dentro de cada conjunto, as pistas devem se complementar sem repetir informação: juntas levam à resposta correta ou, no conjunto falso, a uma resposta errada plausível.
- Mantenha os arrays simples e misture a ordem das pistas; não use número da pergunta, rótulo de conjunto ou campos extras.
- Antes de responder, valide que title, case_text, true_clues, false_clues e final_answer existem, estão preenchidos e são as únicas chaves do JSON.
${previousError ? `- Corrija: ${previousError}` : ""}
`.trim();
}

const CASE_RESPONSE_FORMAT = { type: "json_object" } as const;

async function ensureCaseSchema() {
  await dbQuery(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS cases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL CHECK (btrim(title) <> ''),
      case_text text NOT NULL CHECK (btrim(case_text) <> ''),
      final_answer text NOT NULL CHECK (btrim(final_answer) <> ''),
      true_clues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(true_clues) = 'array'),
      false_clues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(false_clues) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE cases
      DROP CONSTRAINT IF EXISTS cases_minimum_true_clues,
      DROP CONSTRAINT IF EXISTS cases_minimum_false_clues;
  `);
}

async function generateCaseWithAi(
  playerCount: number,
  config: RoomConfig,
  sessionId: string,
  beforeRequest?: () => Promise<void>,
) {
  const distribution = getClueDistribution({ ...config, playerCount });
  const totalClues = playerCount * distribution.cluesPerPlayer;
  const requiredTrueClues = Math.round(
    (totalClues * distribution.trueCluePercentage) / 100,
  );
  const requiredFalseClues = totalClues - requiredTrueClues;
  const maxTokens = Math.min(
    MAX_CASE_GENERATION_TOKENS,
    Math.max(MIN_CASE_GENERATION_TOKENS, 3_000 + totalClues * 40),
  );
  const availableCombinations = await getAvailableAiModelCount();
  const maxAttempts = Math.min(
    MAX_CASE_GENERATION_ATTEMPTS,
    availableCombinations,
  );

  if (maxAttempts === 0) {
    throw new AiModelsUnavailableError(
      "Nenhuma combinação de chave e modelo está disponível para gerar o caso.",
    );
  }

  const errors: string[] = [];
  const excludedCombinations = new Set<string>();
  let previousError: string | undefined;
  let correctionUsed = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await beforeRequest?.();

      const chat = await chatCompletion({
        temperature: attempt === 0 ? 0.35 : 0.1,
        maxTokens,
        sessionId,
        excludedCombinations: [...excludedCombinations],
        onProgress: async (progress) => {
          if (progress.type === "model_selected") {
            excludedCombinations.add(
              `${progress.apiKeySlot}:${progress.modelSlot}`,
            );
          }
        },
        responseFormat: CASE_RESPONSE_FORMAT,
        messages: [
          {
            role: "system",
            content: CASE_GENERATION_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: casePrompt({
              playerCount,
              requiredTrueClues,
              requiredFalseClues,
              trueCluePercentage: distribution.trueCluePercentage,
              cluesPerPlayer: distribution.cluesPerPlayer,
              previousError,
            }),
          },
        ],
      });

      try {
        return assertGeneratedCase(
          parseGeneratedJson(chat.text),
          requiredTrueClues,
          requiredFalseClues,
        );
      } catch (validationError) {
        if (correctionUsed) {
          throw validationError;
        }

        correctionUsed = true;
        return assertGeneratedCase(
          await repairGeneratedCase(
            chat.text,
            validationError,
            requiredTrueClues,
            requiredFalseClues,
            sessionId,
            excludedCombinations,
            beforeRequest,
          ),
          requiredTrueClues,
          requiredFalseClues,
        );
      }
    } catch (error) {
      if (isCaseCreationStateError(error)) {
        throw error;
      }

      previousError = error instanceof Error ? error.message : String(error);
      errors.push(previousError);

      if (
        error instanceof AiModelsUnavailableError &&
        error.failures.length === 0
      ) {
        break;
      }
    }
  }

  console.warn("[case-generation] Todas as tentativas falharam.", errors);
  throw new Error(
    `Não foi possível gerar um caso válido após ${errors.length} tentativa(s).`,
  );
}

export async function getCase(caseId: string) {
  await ensureCaseSchema();

  const result = await dbQuery<GameCase>(
    `
      SELECT
        id::text AS id,
        title,
        case_text,
        final_answer,
        true_clues,
        false_clues,
        created_at
      FROM cases
      WHERE id = $1
    `,
    [caseId],
  );

  const row = result.rows[0];

  return row
    ? {
        ...row,
        true_clues: normalizeClueArray(row.true_clues),
        false_clues: normalizeClueArray(row.false_clues),
      }
    : null;
}

export async function listCaseSummaries(
  limit = 50,
  options: { minTotalClues?: number } = {},
): Promise<CaseSummary[]> {
  await ensureCaseSchema();

  const minTotalClues = Math.max(0, Math.floor(options.minTotalClues ?? 0));
  const result = await dbQuery<{
    id: string;
    title: string;
    true_count: number | string;
    false_count: number | string;
    created_at?: string;
  }>(
    `
      SELECT
        id::text AS id,
        title,
        jsonb_array_length(true_clues) AS true_count,
        jsonb_array_length(false_clues) AS false_count,
        created_at
      FROM cases
      WHERE jsonb_array_length(true_clues) + jsonb_array_length(false_clues) >= $2
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit, minTotalClues],
  );

  return result.rows.map((row) => {
    const trueCount = Number(row.true_count) || 0;
    const falseCount = Number(row.false_count) || 0;
    const totalClues = trueCount + falseCount;
    const falseCluePercentage =
      totalClues > 0 ? Math.round((falseCount / totalClues) * 100) : 0;

    return {
      id: row.id,
      title: row.title,
      totalClues,
      falseCluePercentage,
      created_at: row.created_at,
    };
  });
}

export async function createCaseForRoom(roomCode: string) {
  await ensureCaseSchema();

  const existing = caseGenerationLocks.get(roomCode);

  if (existing) {
    return existing;
  }

  const generation = (async () => {
    const activeRoom = await dbQuery<{
      activecase: string | null;
      users: unknown;
    } & RoomConfig>(
      `
        SELECT
          gr.activecase::text AS activecase,
          gr.users,
          cfg.reading_time_seconds AS "readingTimeSeconds",
          cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
          cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
          cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
          cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
          cfg.true_clues_per_player AS "trueCluesPerPlayer",
          cfg.clues_per_player AS "cluesPerPlayer",
          cfg.timers_enabled AS "timersEnabled"
        FROM game_rooms gr
        LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
        WHERE gr.room_code = $1
      `,
      [roomCode],
    );
    const room = activeRoom.rows[0];

    if (!room) {
      throw new Error("Sala não encontrada durante a criação do caso.");
    }

    const activeCaseId = room?.activecase;

    if (activeCaseId) {
      const existingCase = await getCase(activeCaseId);

      if (existingCase) {
        return existingCase;
      }
    }

    const playerCount = countRoomUsers(room?.users);

    if (playerCount < 1) {
      throw new Error("Não há jogadores na sala para criar o caso.");
    }

    const roomConfig = normalizeCaseConfig(room);
    const caseCreationStartedAt = Date.now();
    const ensureRoomReadyForNextAiRequest = () =>
      assertRoomStillReadyForCaseCreation(roomCode);
    const generatedCase = await generateCaseWithAi(
      playerCount,
      roomConfig,
      roomCaseGenerationSessionId(roomCode),
      ensureRoomReadyForNextAiRequest,
    );
    const result = await dbQuery<GameCase>(
      `
        INSERT INTO cases (
          title,
          case_text,
          final_answer,
          true_clues,
          false_clues
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        RETURNING
          id::text AS id,
          title,
          case_text,
          final_answer,
          true_clues,
          false_clues,
          created_at
      `,
      [
        generatedCase.title,
        generatedCase.case_text,
        generatedCase.final_answer,
        JSON.stringify(generatedCase.true_clues),
        JSON.stringify(generatedCase.false_clues),
      ],
    );
    const createdCase = result.rows[0];

    if (!createdCase?.id) {
      throw new Error("O banco de dados não retornou o caso criado.");
    }

    const normalizedCreatedCase = {
      ...createdCase,
      true_clues: normalizeClueArray(createdCase.true_clues),
      false_clues: normalizeClueArray(createdCase.false_clues),
    };

    const activated = await setRoomActiveCase({
      code: roomCode,
      caseId: createdCase.id,
    });

    if (!activated) {
      throw new CaseSavedWithoutRoomActivationError(normalizedCreatedCase);
    }

    rememberCaseCreationDuration(caseCreationStartedAt);

    return normalizedCreatedCase;
  })();

  caseGenerationLocks.set(roomCode, generation);

  try {
    return await generation;
  } finally {
    caseGenerationLocks.delete(roomCode);
  }
}

export async function createStandaloneCase({
  clueCount,
  playerCount,
  trueCluePercentage,
}: {
  clueCount: number;
  playerCount: number;
  trueCluePercentage: number;
}) {
  const normalizedClueCount = Math.round(clueCount);
  const normalizedPlayerCount = Math.round(playerCount);
  const normalizedTrueCluePercentage = Math.round(trueCluePercentage);

  if (
    !Number.isFinite(normalizedPlayerCount) ||
    normalizedPlayerCount < 1 ||
    normalizedPlayerCount > 10
  ) {
    throw new Error("Escolha entre 1 e 10 usuários.");
  }

  if (
    !Number.isFinite(normalizedClueCount) ||
    normalizedClueCount < getMinimumCluesPerPlayer(normalizedPlayerCount) ||
    normalizedClueCount > 10
  ) {
    throw new Error(
      `Escolha ao menos ${getMinimumCluesPerPlayer(normalizedPlayerCount)} dicas por jogador para essa quantidade de usuários.`,
    );
  }

  if (
    !Number.isFinite(normalizedTrueCluePercentage) ||
    !getTrueCluePercentageStates(
      normalizedPlayerCount,
      normalizedClueCount,
    ).includes(normalizedTrueCluePercentage)
  ) {
    throw new Error("Escolha uma quantidade válida de dicas verdadeiras (mínimo de 3).");
  }

  await ensureCaseSchema();

  const startedAt = Date.now();
  const generatedCase = await generateCaseWithAi(
    normalizedPlayerCount,
    {
      ...DEFAULT_ROOM_CONFIG,
      cluesPerPlayer: normalizedClueCount,
      trueCluesPerPlayer: normalizedTrueCluePercentage,
    },
    `contrapista:admin:case-generation:${crypto.randomUUID()}`,
  );
  const result = await dbQuery<GameCase>(
    `
      INSERT INTO cases (
        title,
        case_text,
        final_answer,
        true_clues,
        false_clues
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      RETURNING
        id::text AS id,
        title,
        case_text,
        final_answer,
        true_clues,
        false_clues,
        created_at
    `,
    [
      generatedCase.title,
      generatedCase.case_text,
      generatedCase.final_answer,
      JSON.stringify(generatedCase.true_clues),
      JSON.stringify(generatedCase.false_clues),
    ],
  );
  const createdCase = result.rows[0];

  if (!createdCase?.id) {
    throw new Error("O banco de dados não retornou o caso criado.");
  }

  rememberCaseCreationDuration(startedAt);

  return {
    ...createdCase,
    true_clues: normalizeClueArray(createdCase.true_clues),
    false_clues: normalizeClueArray(createdCase.false_clues),
  };
}
