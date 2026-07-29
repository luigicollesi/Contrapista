import { chatCompletion } from "@/lib/ai";
import { pool } from "@/lib/db";
import { setRoomActiveCase } from "@/lib/rooms";

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

const CLUES_PER_PLAYER_BY_KIND = 3;
const CASE_GENERATION_ATTEMPTS = 5;
const caseGenerationLocks = new Map<string, Promise<GameCase>>();
const CASE_JSON_KEYS = [
  "title",
  "case_text",
  "true_clues",
  "false_clues",
  "final_answer",
] as const;

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

function assertGeneratedCase(
  value: unknown,
  requiredCluesByKind: number,
): GeneratedCase {
  const data = value as Partial<Record<keyof GeneratedCase, unknown>>;
  const trueClues = normalizeClueArray(data.true_clues);
  const falseClues = normalizeClueArray(data.false_clues);

  for (const key of ["title", "case_text", "final_answer"] as const) {
    if (typeof data[key] !== "string" || !data[key]?.trim()) {
      throw new Error(`Resposta da IA sem campo válido: ${key}`);
    }
  }

  if (trueClues.length !== requiredCluesByKind) {
    throw new Error(
      `Resposta da IA deveria ter exatamente ${requiredCluesByKind} pistas verdadeiras, mas retornou ${trueClues.length}.`,
    );
  }

  if (falseClues.length !== requiredCluesByKind) {
    throw new Error(
      `Resposta da IA deveria ter exatamente ${requiredCluesByKind} pistas falsas, mas retornou ${falseClues.length}.`,
    );
  }

  const title = data.title as string;
  const caseText = data.case_text as string;
  const finalAnswer = data.final_answer as string;

  return {
    title: title.trim(),
    case_text: caseText.trim(),
    final_answer: finalAnswer.trim(),
    true_clues: trueClues.slice(0, requiredCluesByKind),
    false_clues: falseClues.slice(0, requiredCluesByKind),
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
  requiredCluesByKind,
  previousError,
}: {
  playerCount: number;
  requiredCluesByKind: number;
  previousError?: string;
}) {
  const retryRules = previousError
    ? `
A tentativa anterior foi rejeitada por este motivo:
${previousError}

Corrija o formato nesta tentativa. Se a mensagem anterior começou com raciocínio em inglês, não continue esse raciocínio. Gere novamente apenas o objeto JSON final.
`
    : "";
  const trueClueTemplate = Array.from(
    { length: requiredCluesByKind },
    (_, index) => `"<pista verdadeira ${index + 1}>"`,
  ).join(", ");
  const falseClueTemplate = Array.from(
    { length: requiredCluesByKind },
    (_, index) => `"<pista falsa ${index + 1}>"`,
  ).join(", ");

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
- Use exatamente estas chaves, nesta ordem: ${CASE_JSON_KEYS.join(", ")}.
- Não adicione chaves extras.
- title, case_text e final_answer devem ser strings.
- true_clues deve ser um array JSON com exatamente ${requiredCluesByKind} strings.
- false_clues deve ser um array JSON com exatamente ${requiredCluesByKind} strings.
- Cada item dos arrays deve ser string simples, sem objetos internos.
- Todo conteúdo narrativo deve estar dentro dos valores JSON.

Crie um caso original em português, com atmosfera de Londres vitoriana e investigação dedutiva familiar.

Padrão obrigatório do caso:
- Deve haver um incidente central claro: morte, roubo, desaparecimento, fraude ou sabotagem.
- Apresente 3 ou 4 suspeitos com motivos aparentes diferentes.
- Inclua álibis, horários, objetos físicos e pelo menos uma tentativa de despistar os investigadores.
- A solução deve depender de cruzar várias pistas, não de uma única pista óbvia.
- Pelo menos duas pistas verdadeiras devem inocentar suspeitos.
- Pelo menos duas pistas falsas devem parecer incriminar alguém errado, mas a resposta final deve explicar por que eram enganosas, incompletas ou plantadas.
- Use algumas pistas criativas por linguagem: jogos de palavra, sons parecidos, rimas, duplos sentidos, metáforas de objetos ou fragmentos que apontem para sílabas, formatos, materiais ou partes de uma palavra.
- As pistas criativas não podem resolver tudo sozinhas. Elas devem sugerir uma peça da solução e precisar de confirmação por outra pista física, testemunhal ou temporal.
- Não use exemplos literais de armas, rimas, frases ou fragmentos já citados pelo usuário. Crie jogos de palavra originais para o caso gerado.
- Evite pistas genéricas como "parece suspeito" ou "alguém viu algo estranho".

Distribuição obrigatória:
- O jogo terá ${playerCount} jogador(es).
- Crie exatamente ${requiredCluesByKind} pistas verdadeiras em true_clues.
- Crie exatamente ${requiredCluesByKind} pistas falsas em false_clues.
- Cada pista deve ser independente e curta, pois cada jogador receberá apenas 3 verdadeiras e 3 falsas.
- Não escreva "verdadeira", "falsa", "mentira" ou "correta" dentro do texto das pistas.
- As pistas falsas devem ser plausíveis e úteis para discussão, mas devem levar a interpretações erradas quando vistas sem o conjunto completo.
- As pistas verdadeiras e falsas devem ter estilos misturados: objetos, horários, depoimentos, contradições, rimas, registros, marcas, recibos, rotas, fragmentos pela metade e falsas associações.

Campos obrigatórios:
- title: título curto em estilo "O CASO DO ..." ou "O CASO DA ...".
- case_text: 2 a 4 parágrafos curtos. No último parágrafo, faça 2, 3 ou 4 perguntas explícitas e numeradas que os jogadores devem responder.
- As perguntas devem pedir respostas objetivas: culpado, método, arma, motivo, local, cúmplice, objeto escondido, rota usada, contradição decisiva ou identidade real.
- final_answer: o primeiro parágrafo deve começar com "Resposta:" e responder cada pergunta em ordem. O segundo parágrafo deve começar com "Contexto:" e explicar como as pistas verdadeiras revelam a solução e por que as falsas desviam o grupo.
${retryRules}
Preencha exatamente este template JSON. Substitua apenas os valores entre <...>. Não mantenha os sinais < ou >:
{
  "title": "<título curto>",
  "case_text": "<2 a 4 parágrafos curtos com perguntas numeradas no final>",
  "true_clues": [${trueClueTemplate}],
  "false_clues": [${falseClueTemplate}],
  "final_answer": "<Resposta: ...\\n\\nContexto: ...>"
}
`.trim();
}

async function ensureCaseSchema() {
  await pool.query(`
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
  `);
}

async function generateCaseWithAi(playerCount: number) {
  const requiredCluesByKind = playerCount * CLUES_PER_PLAYER_BY_KIND;
  const errors: string[] = [];
  let previousError: string | undefined;

  for (let attempt = 0; attempt < CASE_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const chat = await chatCompletion({
        temperature: attempt === 0 ? 0.8 : 0.2,
        maxTokens: 5200,
        responseFormat: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Você é um gerador de dados JSON para uma API. Responda somente com um objeto JSON válido para JSON.parse, sem markdown e sem texto fora do JSON. O primeiro caractere deve ser "{" e o último deve ser "}". Não explique raciocínio, não escreva planejamento e não peça desculpas. Se não conseguir cumprir alguma regra, ainda assim devolva o melhor objeto JSON possível no schema pedido. Escape aspas internas, barras invertidas e quebras de linha como \\n.',
          },
          {
            role: "user",
            content: casePrompt({
              playerCount,
              requiredCluesByKind,
              previousError,
            }),
          },
        ],
      });

      return assertGeneratedCase(
        await parseCaseResponse(chat.text),
        requiredCluesByKind,
      );
    } catch (error) {
      previousError = error instanceof Error ? error.message : String(error);
      errors.push(previousError);
    }
  }

  throw new Error(
    `Não foi possível gerar um caso em JSON válido após ${CASE_GENERATION_ATTEMPTS} tentativas: ${errors.join(" | ")}`,
  );
}

export async function getCase(caseId: string) {
  await ensureCaseSchema();

  const result = await pool.query<GameCase>(
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
    const activeRoom = await pool.query<{
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
    const room = activeRoom.rows[0];
    const activeCaseId = room?.activecase;

    if (activeCaseId) {
      const existingCase = await getCase(activeCaseId);

      if (existingCase) {
        return existingCase;
      }
    }

    const playerCount = countRoomUsers(room?.users);
    const generatedCase = await generateCaseWithAi(playerCount);
    const result = await pool.query<GameCase>(
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
