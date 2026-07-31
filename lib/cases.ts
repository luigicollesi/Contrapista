import { chatCompletion, getAvailableAiModelCount } from "@/lib/ai";
import { AiModelsUnavailableError } from "@/lib/ai/errors";
import { dbQuery } from "@/lib/db";
import { getClueDistribution } from "@/lib/room-config";
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

const MIN_CASE_GENERATION_ATTEMPTS = 3;
const caseGenerationLocks = new Map<string, Promise<GameCase>>();
const CASE_JSON_KEYS = [
  "title",
  "case_text",
  "true_clues",
  "false_clues",
  "final_answer",
] as const;

let lastCaseCreationDurationSeconds: number | null = null;

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

function normalizeCaseConfig(config: Partial<RoomConfig> | null | undefined) {
  function numberOrDefault(key: keyof RoomConfig) {
    const value = config?.[key];
    const numericValue = typeof value === "number" ? value : Number(value);

    return Number.isFinite(numericValue) ? numericValue : DEFAULT_ROOM_CONFIG[key];
  }

  return {
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
  const data = value as Partial<Record<keyof GeneratedCase, unknown>>;
  const trueClues = normalizeClueArray(data.true_clues);
  const falseClues = normalizeClueArray(data.false_clues);

  for (const key of ["title", "case_text", "final_answer"] as const) {
    if (typeof data[key] !== "string" || !data[key]?.trim()) {
      throw new Error(`Resposta da IA sem campo válido: ${key}`);
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

  const questionCount = (caseText.match(/\?/g) ?? []).length;

  if (questionCount < 2) {
    throw new Error("O caso precisa trazer pelo menos duas perguntas claras para responder.");
  }

  if (!/perguntas?\s+(?:centrais|que precisam ser respondidas|do caso)/i.test(caseText)) {
    throw new Error('O caso precisa ter uma seção explícita de perguntas.');
  }

  if (!/^Resposta:/i.test(finalAnswer.trim()) || !/\bContexto:/i.test(finalAnswer)) {
    throw new Error('A resposta final precisa começar com "Resposta:" e conter "Contexto:".');
  }

  if (!/(?:^|\n)\s*(?:(?:1|a)\s*[).:-]|(?:culpado|método|metodo|motivo|local|objeto|cúmplice|cumplice|rota|contradição|contradicao)\s*:)/i.test(finalAnswer)) {
    throw new Error("A resposta final precisa trazer um gabarito numerado ou letrado.");
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

async function repairGeneratedJson(
  text: string,
  parseError: unknown,
  sessionId: string,
) {
  const jsonText = extractJson(text);
  const errorMessage =
    parseError instanceof Error ? parseError.message : "erro desconhecido";

  const repair = await chatCompletion({
    temperature: 0,
    maxTokens: 4200,
    sessionId,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Você corrige respostas para JSON válido. Não invente conteúdo novo. Preserve todos os campos, textos e valores recebidos. Responda somente um objeto JSON válido. O primeiro caractere deve ser "{". Não escreva análise, markdown ou explicações.',
      },
      {
        role: "user",
        content: `
O JSON abaixo falhou com este erro: ${errorMessage}

Repare apenas a sintaxe JSON: aspas internas, quebras de linha, vírgulas, barras invertidas e caracteres que precisem de escape. Não mude a história, as pistas ou a solução.

JSON com problema:
${jsonText}
`.trim(),
      },
    ],
  });

  return parseGeneratedJson(repair.text);
}

async function parseCaseResponse(text: string, sessionId: string) {
  try {
    return parseGeneratedJson(text);
  } catch (parseError) {
    return repairGeneratedJson(text, parseError, sessionId);
  }
}

function roomCaseGenerationSessionId(roomCode: string) {
  return `contrapista:room:${roomCode}:case-generation:v2`;
}

const CASE_GENERATION_SYSTEM_PROMPT = `
Você gera casos originais em português para Contrapista, um jogo dedutivo familiar.
Saída obrigatória: um único objeto JSON válido. O primeiro caractere deve ser "{" e o último deve ser "}". Não use markdown, cerca de código, análise, comentários nem texto antes/depois do JSON.

Contrato:
- Chaves exatas e nesta ordem: title, case_text, true_clues, false_clues, final_answer.
- title: começa com "O CASO DO" ou "O CASO DA" e termina com elemento concreto.
- case_text: 2 ou 3 parágrafos em Londres vitoriana; incidente claro; 3 ou 4 suspeitos; álibis, horários, objetos físicos e despiste.
- O último parágrafo de case_text termina com a seção exata "Perguntas centrais do caso:" e 2 a 4 perguntas numeradas "1.", "2.", "3.", "4.".
- final_answer deve ter este formato exato: começa com "Resposta:", depois linhas numeradas "1. ...", "2. ..." respondendo as perguntas na mesma ordem, depois uma linha "Contexto:" explicando dedução e pistas falsas.
- true_clues e false_clues são arrays de strings curtas, concretas e independentes, no máximo 120 caracteres.
- Use aspas duplas JSON. Escape quebras de linha dentro das strings como "\\n"; não escreva quebras literais dentro de strings.
- Não use placeholders, reticências, blocos de código, aspas simples JSON, chaves extras nem comentários.
- Não escreva "verdadeira", "falsa", "mentira" ou "correta" dentro das pistas.

Modelo de final_answer:
"Resposta:\\n1. Culpado/resposta da pergunta 1.\\n2. Método/resposta da pergunta 2.\\nContexto: Explique em poucas frases como as pistas sustentam o gabarito e por que os desvios eram plausíveis."

Qualidade:
- A solução depende de cruzar várias pistas, não de uma pista óbvia.
- Inclua pistas físicas, testemunhais, temporais e alguns jogos de linguagem simples.
- Pistas falsas devem ser plausíveis e úteis para discussão, mas desviam sem o conjunto completo.
- Evite pistas genéricas como "parece suspeito" ou "alguém viu algo estranho".
`.trim();

function casePrompt({
  playerCount,
  requiredTrueClues,
  requiredFalseClues,
  trueCluesPerPlayer,
  falseCluesPerPlayer,
  cluesPerPlayer,
  previousError,
}: {
  playerCount: number;
  requiredTrueClues: number;
  requiredFalseClues: number;
  trueCluesPerPlayer: number;
  falseCluesPerPlayer: number;
  cluesPerPlayer: number;
  previousError?: string;
}) {
  const trueClueNarrativeRules =
    requiredTrueClues >= 2
      ? "Inclua pelo menos duas pistas confiáveis que inocentem suspeitos."
      : requiredTrueClues === 1
        ? "A pista confiável deve sustentar uma dedução objetiva importante."
        : "Não crie pistas confiáveis; a solução deve ser deduzida pelo contraste entre caso e pistas falsas.";
  const falseClueNarrativeRules =
    requiredFalseClues >= 2
      ? "Inclua pelo menos duas pistas falsas que incriminem alguém errado; explique no Contexto por que desviavam."
      : requiredFalseClues === 1
        ? "A pista falsa deve parecer útil; explique no Contexto por que desviava."
        : "Não crie pistas falsas; todos os indícios distribuídos sustentam a solução.";

  return `
Configuração da partida:
- jogadores: ${playerCount}
- pistas por jogador: ${cluesPerPlayer}
- pistas confiáveis por jogador: ${trueCluesPerPlayer}
- pistas falsas por jogador: ${falseCluesPerPlayer}
- total true_clues: ${requiredTrueClues}
- total false_clues: ${requiredFalseClues}

Regras específicas:
- true_clues deve ter exatamente ${requiredTrueClues} string(s).
- false_clues deve ter exatamente ${requiredFalseClues} string(s).
- ${trueClueNarrativeRules}
- ${falseClueNarrativeRules}
- As perguntas centrais devem pedir culpado, método, motivo, local, objeto, cúmplice, rota ou contradição decisiva.
- Antes de responder, verifique internamente: JSON parseável, arrays com tamanho exato, final_answer com "Resposta:", linhas "1.", "2." e "Contexto:".
${previousError ? `\nCorrija a falha anterior nesta nova saída JSON: ${previousError}` : ""}
`.trim();
}

function caseResponseFormat({
  requiredTrueClues,
  requiredFalseClues,
}: {
  requiredTrueClues: number;
  requiredFalseClues: number;
}) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "contrapista_case",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: CASE_JSON_KEYS,
        properties: {
          title: {
            type: "string",
            description:
              'Título curto em português, começando com "O CASO DO" ou "O CASO DA".',
            minLength: 12,
          },
          case_text: {
            type: "string",
            description:
              'Narrativa do caso em 2 ou 3 parágrafos; termina com "Perguntas centrais do caso:" e perguntas numeradas.',
            minLength: 240,
          },
          true_clues: {
            type: "array",
            description:
              "Lista com exatamente a quantidade pedida de pistas confiáveis, sem rotular como verdadeiras.",
            minItems: requiredTrueClues,
            maxItems: requiredTrueClues,
            items: {
              type: "string",
              description: "Pista curta, concreta e independente.",
              minLength: 12,
              maxLength: 160,
            },
          },
          false_clues: {
            type: "array",
            description:
              "Lista com exatamente a quantidade pedida de pistas plausíveis de desvio, sem rotular como falsas.",
            minItems: requiredFalseClues,
            maxItems: requiredFalseClues,
            items: {
              type: "string",
              description: "Pista curta, concreta, plausível e independente.",
              minLength: 12,
              maxLength: 160,
            },
          },
          final_answer: {
            type: "string",
            description:
              'Gabarito em português. Começa com "Resposta:", contém linhas numeradas "1.", "2." e depois "Contexto:".',
            minLength: 180,
          },
        },
      },
    },
  };
}

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
) {
  const distribution = getClueDistribution(config);
  const requiredTrueClues = playerCount * distribution.trueCluesPerPlayer;
  const requiredFalseClues = playerCount * distribution.falseCluesPerPlayer;
  const maxAttempts = Math.max(
    MIN_CASE_GENERATION_ATTEMPTS,
    await getAvailableAiModelCount(),
  );
  const errors: string[] = [];
  let previousError: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const chat = await chatCompletion({
        temperature: attempt === 0 ? 0.35 : 0.1,
        maxTokens: 4600,
        sessionId,
        responseFormat: caseResponseFormat({
          requiredTrueClues,
          requiredFalseClues,
        }),
        validateText: (text) => {
          assertGeneratedCase(
            parseGeneratedJson(text),
            requiredTrueClues,
            requiredFalseClues,
          );
        },
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
              trueCluesPerPlayer: distribution.trueCluesPerPlayer,
              falseCluesPerPlayer: distribution.falseCluesPerPlayer,
              cluesPerPlayer: distribution.cluesPerPlayer,
              previousError,
            }),
          },
        ],
      });

      return assertGeneratedCase(
        await parseCaseResponse(chat.text, sessionId),
        requiredTrueClues,
        requiredFalseClues,
      );
    } catch (error) {
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

  throw new Error(
    `Não foi possível gerar um caso em JSON válido após ${errors.length} tentativa(s): ${errors.join(" | ")}`,
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

export async function listCaseSummaries(limit = 50): Promise<CaseSummary[]> {
  await ensureCaseSchema();

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
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit],
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
          cfg.clues_per_player AS "cluesPerPlayer"
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
    const generatedCase = await generateCaseWithAi(
      playerCount,
      roomConfig,
      roomCaseGenerationSessionId(roomCode),
    );
    await assertRoomStillReadyForCaseCreation(roomCode);
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

    const activated = await setRoomActiveCase({
      code: roomCode,
      caseId: createdCase.id,
    });

    if (!activated) {
      throw new Error(
        "A sala mudou de estado antes de receber o caso criado. Voltem para a ante-sala e tentem novamente.",
      );
    }

    rememberCaseCreationDuration(caseCreationStartedAt);

    return {
      ...createdCase,
      true_clues: normalizeClueArray(createdCase.true_clues),
      false_clues: normalizeClueArray(createdCase.false_clues),
    };
  })();

  caseGenerationLocks.set(roomCode, generation);

  try {
    return await generation;
  } finally {
    caseGenerationLocks.delete(roomCode);
  }
}
