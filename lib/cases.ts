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

const MIN_CASE_GENERATION_ATTEMPTS = 3;
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
  beforeRequest?: () => Promise<void>,
) {
  const jsonText = extractJson(text);
  const errorMessage =
    parseError instanceof Error ? parseError.message : "erro desconhecido";

  await beforeRequest?.();

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

async function parseCaseResponse(
  text: string,
  sessionId: string,
  beforeRequest?: () => Promise<void>,
) {
  try {
    return parseGeneratedJson(text);
  } catch (parseError) {
    return repairGeneratedJson(text, parseError, sessionId, beforeRequest);
  }
}

function roomCaseGenerationSessionId(roomCode: string) {
  return `contrapista:room:${roomCode}:case-generation:v2`;
}

const CASE_GENERATION_SYSTEM_PROMPT = `
Você cria casos originais em português para Contrapista, um jogo familiar de investigação e dedução.

Contrato:
- A resposta deve ser somente um objeto JSON: o primeiro caractere deve ser "{" e o último deve ser "}".
- Não use markdown, cerca de código ou qualquer texto fora do objeto JSON.
- Use exclusivamente aspas duplas válidas de JSON; não use aspas simples como delimitadores JSON.
- Retorne somente as chaves exigidas pelo esquema, sem chaves extras.
- title começa com "O CASO DO" ou "O CASO DA".
- case_text: 2 ou 3 parágrafos, incidente claro, 3 ou 4 suspeitos, álibis, horários, objetos e detalhes investigativos.
- Termine case_text com "Perguntas centrais do caso:" e 2 ou 3 perguntas numeradas.
- true_clues e false_clues são pistas curtas, concretas e independentes, com no máximo 160 caracteres.
- final_answer começa com "Resposta:", responde cada pergunta numerada na mesma ordem e termina com "Contexto:".
- Não rotule pistas como verdadeiras, falsas, corretas ou mentiras.

Dedução:
- Deve existir exatamente uma solução compatível com todas as true_clues.
- A solução deve ser dedutível apenas por case_text + true_clues, sem conhecimento externo.
- O Contexto não pode introduzir fatos novos.
- Nenhuma pista sozinha deve revelar toda a solução.
- Pelo menos uma conclusão deve exigir combinar duas ou mais true_clues.
- Algumas pistas devem eliminar hipóteses, não apenas apontar para o culpado.
- Pelo menos dois suspeitos devem parecer plausíveis antes da dedução completa.

Pistas:
- Misture pistas físicas, temporais, testemunhais, espaciais, comportamentais e documentais.
- Explore profissão, hábito, transporte, clima, procedência de objetos, quantidade, linguagem, som, cheiro, rota ou detalhe visual.
- Algumas pistas devem parecer secundárias isoladamente e ganhar importância quando combinadas.
- Evite pistas genéricas ou que simplesmente entreguem culpado, método ou motivo.

Enigmas e jogos de palavras:
- Use ocasionalmente pistas que o jogador precise decifrar em vez de receber a informação pronta.
- Varie o mecanismo; não use sempre o mesmo tipo de enigma.
- Possibilidades incluem:
  - rimas ou semelhanças sonoras;
  - palavras com duplo sentido;
  - descrição indireta de um objeto;
  - palavra dividida, incompleta ou escondida;
  - iniciais ou últimas letras formando uma palavra;
  - texto invertido;
  - leitura de letras alternadas;
  - relação entre duas palavras;
  - frase cujo significado literal esconde outra interpretação;
  - título, placa, anúncio ou frase do cenário funcionando como associação;
  - duas pistas incompletas que somente juntas revelam a informação.
- Uma pista pode fornecer o enigma e outra fornecer discretamente a regra para interpretá-lo.
- Exemplos de estrutura: uma pista sugere "partida, não inteira" enquanto outra ajuda a identificar qual objeto poderia estar quebrado; outra pode dizer que a resposta "rima com..." sem revelar a palavra.
- Jogos de palavras devem ser solucionáveis em português e não depender de cultura obscura.
- Não faça enigmas arbitrários com várias respostas igualmente plausíveis.
- A informação obtida ao resolver o enigma deve contribuir para a investigação.
- Não transforme todas as pistas em charadas: combine enigmas com evidências concretas.
- No Contexto, explique brevemente como os enigmas relevantes eram interpretados.

false_clues:
- São despistes plausíveis, não mentiras arbitrárias.
- Preferencialmente são fatos verdadeiros que levam a uma interpretação errada.
- Também podem ser depoimentos incorretos se sua inconsistência puder ser demonstrada.
- Podem conter enigmas cuja interpretação mais óbvia leve a uma hipótese errada, desde que outra evidência permita perceber o verdadeiro significado.
- Não faça todas apontarem para o mesmo suspeito.
- Nunca podem deixar duas soluções igualmente possíveis.

Variedade:
- Varie entre roubo, fraude, desaparecimento, sabotagem, chantagem, falsificação, troca de identidade, objeto disfarçado, encenação, álibi impossível, cúmplice ou rota incompatível.
- Varie cenário, motivo, mecanismo, objeto central e tipo de dedução.
- Evite repetir "objeto sumiu + suspeitos deram álibis + horário revela culpado".
- Evite soluções baseadas apenas em câmera, GPS, DNA, impressão digital, confissão ou mensagem explícita.
- Prefira pequenas viradas lógicas: algo apresentado com um significado revela outro quando as pistas são combinadas.

Construa silenciosamente:
solução -> acontecimentos -> vestígios -> pistas -> enigmas/despistes -> narrativa.

Antes da saída, confirme:
1. Há exatamente uma solução.
2. Todas as respostas podem ser provadas.
3. Pelo menos uma dedução combina várias pistas.
4. Nenhum fato necessário aparece somente no Contexto.
5. Os despistes são plausíveis e refutáveis.
6. Os enigmas têm interpretação justificável e útil.
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

  const falseClueRule =
    requiredFalseClues >= 2
      ? "Os despistes devem sustentar hipóteses diferentes; não faça todos apontarem para a mesma pessoa."
      : requiredFalseClues === 1
        ? "Crie um despiste convincente, mas logicamente refutável."
        : "Não crie despistes.";

  return `
- true_clues: exatamente ${requiredTrueClues}.
- false_clues: exatamente ${requiredFalseClues}.
- ${falseClueRule}
- Distribua as true_clues entre confirmação da solução e eliminação de hipóteses.
- Para cada pergunta central deve existir evidência suficiente em case_text + true_clues.
- Pelo menos uma resposta deve exigir combinar duas ou mais true_clues.
- Nenhuma true_clue isolada pode resolver todo o caso.
${previousError ? `- Corrija esta falha da tentativa anterior: ${previousError}` : ""}
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
              'Título começando com "O CASO DO" ou "O CASO DA".',
            minLength: 12,
            maxLength: 100,
          },
          case_text: {
            type: "string",
            description:
              'Caso em 2 ou 3 parágrafos, terminando com "Perguntas centrais do caso:" e 2 ou 3 perguntas numeradas.',
            minLength: 240,
            maxLength: 3000,
          },
          true_clues: {
            type: "array",
            minItems: requiredTrueClues,
            maxItems: requiredTrueClues,
            items: {
              type: "string",
              description: "Pista concreta com função dedutiva.",
              minLength: 12,
              maxLength: 160,
            },
          },
          false_clues: {
            type: "array",
            minItems: requiredFalseClues,
            maxItems: requiredFalseClues,
            items: {
              type: "string",
              description: "Despiste plausível e logicamente refutável.",
              minLength: 12,
              maxLength: 160,
            },
          },
          final_answer: {
            type: "string",
            description:
              'Começa com "Resposta:", responde as perguntas e termina com "Contexto:".',
            minLength: 180,
            maxLength: 2400,
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
  const maxAttempts = Math.max(
    MIN_CASE_GENERATION_ATTEMPTS,
    await getAvailableAiModelCount(),
  );
  const errors: string[] = [];
  let previousError: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await beforeRequest?.();

      const chat = await chatCompletion({
        temperature: attempt === 0 ? 0.35 : 0.1,
        maxTokens,
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
              trueCluePercentage: distribution.trueCluePercentage,
              cluesPerPlayer: distribution.cluesPerPlayer,
              previousError,
            }),
          },
        ],
      });

      return assertGeneratedCase(
        await parseCaseResponse(chat.text, sessionId, beforeRequest),
        requiredTrueClues,
        requiredFalseClues,
      );
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
