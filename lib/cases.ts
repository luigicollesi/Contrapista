import { chatCompletion, getAvailableAiModelCount } from "@/lib/ai";
import { AiModelsUnavailableError } from "@/lib/ai/errors";
import { dbQuery } from "@/lib/db";
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

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]?.trim().startsWith("{")) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");

  if (firstBrace < 0) {
    throw new Error(
      `A IA respondeu texto em vez de JSON: ${text.slice(0, 80)}`,
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < text.length; index += 1) {
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
        return text.slice(firstBrace, index + 1);
      }
    }
  }

  throw new Error("A IA retornou um objeto JSON incompleto.");
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
  return Array.isArray(users) ? Math.max(1, users.length) : 1;
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

export function getClueDistribution(config = DEFAULT_ROOM_CONFIG) {
  const normalizedConfig = normalizeCaseConfig(config);
  const cluesPerPlayer = Math.min(
    10,
    Math.max(2, Math.round(normalizedConfig.cluesPerPlayer)),
  );
  const trueCluesPerPlayer = Math.min(
    cluesPerPlayer,
    Math.max(0, Math.round(normalizedConfig.trueCluesPerPlayer)),
  );
  const falseCluesPerPlayer = cluesPerPlayer - trueCluesPerPlayer;

  return {
    cluesPerPlayer,
    trueCluesPerPlayer,
    falseCluesPerPlayer,
  };
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

  if (!/(?:^|\n)\s*(?:1[).]|a[).])/i.test(finalAnswer)) {
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

async function repairGeneratedJson(text: string, parseError: unknown) {
  const jsonText = extractJson(text);
  const errorMessage =
    parseError instanceof Error ? parseError.message : "erro desconhecido";

  const repair = await chatCompletion({
    temperature: 0,
    maxTokens: 4200,
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

async function parseCaseResponse(text: string) {
  try {
    return parseGeneratedJson(text);
  } catch (parseError) {
    return repairGeneratedJson(text, parseError);
  }
}

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
  const retryRules = previousError
    ? `
A tentativa anterior foi rejeitada por este motivo:
${previousError}

Corrija o formato nesta tentativa. Se a mensagem anterior começou com raciocínio em inglês, não continue esse raciocínio. Gere novamente apenas o objeto JSON final.
`
    : "";
  const clueCountRules = Array.from(
    { length: Math.max(requiredTrueClues, requiredFalseClues) },
    (_, index) => index + 1,
  ).join(", ");
  const trueClueNarrativeRules =
    requiredTrueClues >= 2
      ? "- Pelo menos duas pistas verdadeiras devem inocentar suspeitos."
      : requiredTrueClues === 1
        ? "- A pista verdadeira deve sustentar uma dedução objetiva importante."
        : "- Não crie pistas verdadeiras; a solução deve ser deduzida pelo contraste entre o caso e as pistas falsas.";
  const falseClueNarrativeRules =
    requiredFalseClues >= 2
      ? "- Pelo menos duas pistas falsas devem parecer incriminar alguém errado, mas a resposta final deve explicar por que eram enganosas, incompletas ou plantadas."
      : requiredFalseClues === 1
        ? "- A pista falsa deve parecer útil, mas a resposta final deve explicar por que ela desvia a interpretação."
        : "- Não crie pistas falsas; todos os indícios distribuídos devem sustentar a solução.";

  return `
CONTRATO DE SAÍDA OBRIGATÓRIO:
- A resposta inteira deve ser um único objeto JSON válido para JSON.parse.
- O primeiro caractere da resposta deve ser "{" e o último caractere deve ser "}".
- Não escreva markdown, comentários, explicações, análise, raciocínio, introdução ou texto depois do JSON.
- Não use blocos \`\`\`.
- Não use trailing commas.
- Não use aspas simples.
- Não use quebras de linha literais dentro de strings; quando precisar separar parágrafos, use "\\n\\n".
- Não use caracteres de controle dentro das strings.
- Não use reticências como valor. Sequências de três pontos são proibidas em qualquer campo.
- Não use placeholders, marcadores ou instruções como valor. São proibidas frases genéricas como "pista verdadeira", "pista falsa", "título curto", "string original" e "perguntas numeradas".
- Use exatamente estas chaves, nesta ordem: ${CASE_JSON_KEYS.join(", ")}.
- Não adicione chaves extras.
- title, case_text e final_answer devem ser strings.
- true_clues deve ser um array JSON com exatamente ${requiredTrueClues} strings. Posições de referência: ${clueCountRules || "nenhuma"}.
- false_clues deve ser um array JSON com exatamente ${requiredFalseClues} strings. Posições de referência: ${clueCountRules || "nenhuma"}.
- Cada item dos arrays deve ser string simples, sem objetos internos.
- Todo conteúdo narrativo deve estar dentro dos valores JSON.

Crie um caso original em português, com atmosfera de Londres vitoriana e investigação dedutiva familiar.

Referência de estrutura, inspirada nos casos de exemplo sem copiar personagens, objetos ou soluções:
- O caso deve narrar os fatos como um relato investigativo recebido por Holmes, Watson, Lestrade ou outro agente da investigação.
- A narrativa deve apresentar pistas encontradas na cena, suspeitos aparentes e uma hipótese inicial plausível, mas incompleta.
- O último trecho deve anunciar claramente o que precisa ser descoberto: quem fez, por qual motivo, com que método, que objeto estava em jogo ou qual contradição desmonta o disfarce.
- A solução deve primeiro funcionar como gabarito direto e só depois explicar a cadeia dedutiva.

Padrão obrigatório do caso:
- Deve haver um incidente central claro: morte, roubo, desaparecimento, fraude ou sabotagem.
- Apresente 3 ou 4 suspeitos com motivos aparentes diferentes.
- Inclua álibis, horários, objetos físicos e pelo menos uma tentativa de despistar os investigadores.
- A solução deve depender de cruzar várias pistas, não de uma única pista óbvia.
- Evite finais vagos como "descobrir o que aconteceu". Os jogadores precisam saber exatamente quais perguntas devem responder.
${trueClueNarrativeRules}
${falseClueNarrativeRules}
- Use algumas pistas criativas por linguagem: jogos de palavra, sons parecidos, rimas, duplos sentidos, metáforas de objetos ou fragmentos que apontem para sílabas, formatos, materiais ou partes de uma palavra.
- As pistas criativas não podem resolver tudo sozinhas. Elas devem sugerir uma peça da solução e precisar de confirmação por outra pista física, testemunhal ou temporal.
- Não use exemplos literais de armas, rimas, frases ou fragmentos já citados pelo usuário. Crie jogos de palavra originais para o caso gerado.
- Evite pistas genéricas como "parece suspeito" ou "alguém viu algo estranho".

Distribuição obrigatória:
- O jogo terá ${playerCount} jogador(es).
- Cada jogador receberá ${cluesPerPlayer} pistas no total.
- Cada jogador deve receber ${trueCluesPerPlayer} pista(s) verdadeira(s) e ${falseCluesPerPlayer} pista(s) falsa(s).
- Crie exatamente ${requiredTrueClues} pistas verdadeiras em true_clues.
- Crie exatamente ${requiredFalseClues} pistas falsas em false_clues.
- Cada pista deve ser independente, concreta e curta, com no máximo 120 caracteres.
- Não escreva "verdadeira", "falsa", "mentira" ou "correta" dentro do texto das pistas.
- As pistas falsas devem ser plausíveis e úteis para discussão, mas devem levar a interpretações erradas quando vistas sem o conjunto completo.
- As pistas verdadeiras e falsas devem ter estilos misturados: objetos, horários, depoimentos, contradições, rimas, registros, marcas, recibos, rotas, fragmentos pela metade e falsas associações.

Campos obrigatórios:
- title: título curto em estilo de manchete investigativa, começando com "O CASO DO" ou "O CASO DA" e terminando com um elemento concreto da história.
- case_text: 2 ou 3 parágrafos curtos. No último parágrafo, crie uma seção chamada exatamente "Perguntas centrais do caso:".
- Depois desse título, escreva 2, 3 ou 4 perguntas numeradas com "1.", "2.", "3." e, se necessário, "4.".
- Cada pergunta deve ser independente, clara e objetiva. Use formulações diretas como "Quem...", "Qual...", "Onde...", "Como..." ou "Por que...".
- As perguntas devem pedir respostas verificáveis: culpado, método, arma, motivo, local, cúmplice, objeto escondido, rota usada, contradição decisiva ou identidade real.
- Não faça perguntas subjetivas, abertas ou vagas como "o que realmente aconteceu?" sem especificar o item a responder.
- final_answer: deve começar exatamente com "Resposta:". Logo abaixo, responda cada pergunta na mesma ordem usando "1.", "2.", "3." e, se necessário, "4.".
- Cada item da resposta deve começar com a resposta curta e clara antes de qualquer explicação. Exemplo de formato, sem copiar conteúdo: "1. Nome do culpado — matou a vítima."
- Depois do gabarito, escreva um segundo bloco começando exatamente com "Contexto:" e explique como as pistas verdadeiras revelam a solução e por que as falsas desviam o grupo.
${retryRules}
Retorne somente um objeto JSON final com estes campos preenchidos:
- title: string com título original.
- case_text: string com narrativa completa e perguntas numeradas.
- true_clues: array com exatamente ${requiredTrueClues} strings de pistas verdadeiras.
- false_clues: array com exatamente ${requiredFalseClues} strings de pistas falsas.
- final_answer: string começando com "Resposta:", seguida de respostas numeradas e claras para as perguntas do caso, e contendo depois "Contexto:".
Antes de responder, verifique internamente: nenhum valor pode ser vazio, genérico, placeholder ou reticências.
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
          title: { type: "string", minLength: 12 },
          case_text: { type: "string", minLength: 240 },
          true_clues: {
            type: "array",
            minItems: requiredTrueClues,
            maxItems: requiredTrueClues,
            items: { type: "string", minLength: 12, maxLength: 160 },
          },
          false_clues: {
            type: "array",
            minItems: requiredFalseClues,
            maxItems: requiredFalseClues,
            items: { type: "string", minLength: 12, maxLength: 160 },
          },
          final_answer: { type: "string", minLength: 180 },
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

async function generateCaseWithAi(playerCount: number, config: RoomConfig) {
  const distribution = getClueDistribution(config);
  const requiredTrueClues = playerCount * distribution.trueCluesPerPlayer;
  const requiredFalseClues = playerCount * distribution.falseCluesPerPlayer;
  const maxAttempts = Math.max(
    MIN_CASE_GENERATION_ATTEMPTS,
    getAvailableAiModelCount(),
  );
  const errors: string[] = [];
  let previousError: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const chat = await chatCompletion({
        temperature: attempt === 0 ? 0.8 : 0.2,
        maxTokens: 3800,
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
            content:
              'Você é uma API de geração de JSON. Saída obrigatória: apenas o objeto JSON final que satisfaça o schema solicitado. Não escreva raciocínio, planejamento, análise, notas, markdown, desculpas ou frases em inglês. Se precisar revisar internamente, faça isso em silêncio e responda somente JSON. Escape aspas internas, barras invertidas e quebras de linha como \\n.',
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
        await parseCaseResponse(chat.text),
        requiredTrueClues,
        requiredFalseClues,
      );
    } catch (error) {
      previousError = error instanceof Error ? error.message : String(error);
      errors.push(previousError);

      if (
        error instanceof AiModelsUnavailableError &&
        (error.failures.length === 0 ||
          error.failures.some((failure) => failure.status === 401 || failure.status === 403))
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
    const activeCaseId = room?.activecase;

    if (activeCaseId) {
      const existingCase = await getCase(activeCaseId);

      if (existingCase) {
        return existingCase;
      }
    }

    const playerCount = countRoomUsers(room?.users);
    const roomConfig = normalizeCaseConfig(room);
    const caseCreationStartedAt = Date.now();
    const generatedCase = await generateCaseWithAi(playerCount, roomConfig);
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

    await setRoomActiveCase({ code: roomCode, caseId: createdCase.id });
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
