import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chatCompletion } from "@/lib/ai";
import { CASE_LOCATIONS, type CaseLocationKey } from "@/lib/case-locations";
import { pool } from "@/lib/db";
import { setRoomActiveCase } from "@/lib/rooms";

export type GameCase = {
  id: string;
  title: string;
  case_text: string;
  final_solution: string;
  created_at?: string;
} & Record<CaseLocationKey, string>;

type GeneratedCase = Omit<GameCase, "id" | "created_at">;

const caseGenerationLocks = new Map<string, Promise<GameCase>>();

function getReferenceCases() {
  try {
    return readFileSync(join(process.cwd(), "casos_referencia.txt"), "utf8");
  } catch {
    return "";
  }
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function assertGeneratedCase(value: unknown): GeneratedCase {
  const data = value as Partial<Record<keyof GeneratedCase, unknown>>;
  const requiredKeys = [
    "title",
    "case_text",
    ...CASE_LOCATIONS.map((location) => location.key),
    "final_solution",
  ] as const;

  for (const key of requiredKeys) {
    if (typeof data[key] !== "string" || !data[key]?.trim()) {
      throw new Error(`Resposta da IA sem campo valido: ${key}`);
    }
  }

  return data as GeneratedCase;
}

async function generateCaseWithAi() {
  const locationList = CASE_LOCATIONS.map(
    (location, index) => `${index + 1}. ${location.name}: ${location.key}`,
  ).join("\n");
  const referenceCases = getReferenceCases();

  const chat = await chatCompletion({
    temperature: 0.85,
    maxTokens: 3000,
    messages: [
      {
        role: "system",
        content:
          "Voce cria casos investigativos para um jogo de tabuleiro inspirado no Scotland Yard classico. Responda somente JSON valido, sem markdown. Use deducao clara, pistas curtas e criativas, algumas pistas em duas metades e algumas pistas que parecam levar a uma conclusao errada sem contradizer a solucao.",
      },
      {
        role: "user",
        content: `
Crie um caso original em portugues, com atmosfera de Londres vitoriana e investigacao dedutiva familiar.

O caso deve ter:
- title: titulo curto em estilo "O CASO DE ...".
- case_text: texto inicial com 2 a 4 paragrafos curtos e perguntas claras no final. As perguntas devem ser objetivas, por exemplo: "Quem matou X?", "Qual arma foi usada?", "Qual foi o motivo?", "Onde o objeto foi escondido?". Use mais de uma pergunta quando necessario.
- 14 dicas, uma para cada local abaixo. As dicas devem ser mais curtas e criativas. Algumas podem ter duas metades encontradas no mesmo local em pontos diferentes. Algumas podem parecer levar para um caminho errado, desde que a solucao final explique por que eram falsas pistas ou interpretações incompletas.
- final_solution: comece com uma resposta simples e clara para as perguntas do caso. Depois, em outro paragrafo, contextualize a solucao explicando como as pistas se conectam.

Use estes casos prontos como referencia de estrutura, tom e nivel de deducao, sem copiar personagens, objetos ou solucoes:
${referenceCases}

Locais e chaves obrigatorias:
${locationList}

Formato obrigatorio:
{
  "title": "...",
  "case_text": "...",
  "museum_clue": "...",
  "bar_clue": "...",
  "pharmacy_clue": "...",
  "pawn_shop_clue": "...",
  "theater_clue": "...",
  "bank_clue": "...",
  "bookstore_clue": "...",
  "locksmith_clue": "...",
  "docks_clue": "...",
  "hotel_clue": "...",
  "tobacconist_clue": "...",
  "carriage_station_clue": "...",
  "scotland_yard_clue": "...",
  "park_clue": "...",
  "final_solution": "..."
}
`.trim(),
      },
    ],
  });

  return assertGeneratedCase(JSON.parse(extractJson(chat.text)));
}

export async function getCase(caseId: string) {
  const result = await pool.query<GameCase>(
    `
      SELECT *
      FROM cases
      WHERE id = $1
    `,
    [caseId],
  );

  return result.rows[0] ?? null;
}

export async function createCaseForRoom(roomCode: string) {
  const existing = caseGenerationLocks.get(roomCode);

  if (existing) {
    return existing;
  }

  const generation = (async () => {
    const activeRoom = await pool.query<{ activecase: string | null }>(
      `
        SELECT activecase::text AS activecase
        FROM game_rooms
        WHERE room_code = $1
      `,
      [roomCode],
    );
    const activeCaseId = activeRoom.rows[0]?.activecase;

    if (activeCaseId) {
      const existingCase = await getCase(activeCaseId);

      if (existingCase) {
        return existingCase;
      }
    }

    const generatedCase = await generateCaseWithAi();
    const result = await pool.query<GameCase>(
      `
        INSERT INTO cases (
          title,
          case_text,
          museum_clue,
          bar_clue,
          pharmacy_clue,
          pawn_shop_clue,
          theater_clue,
          bank_clue,
          bookstore_clue,
          locksmith_clue,
          docks_clue,
          hotel_clue,
          tobacconist_clue,
          carriage_station_clue,
          scotland_yard_clue,
          park_clue,
          final_solution
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        RETURNING *
      `,
      [
        generatedCase.title,
        generatedCase.case_text,
        generatedCase.museum_clue,
        generatedCase.bar_clue,
        generatedCase.pharmacy_clue,
        generatedCase.pawn_shop_clue,
        generatedCase.theater_clue,
        generatedCase.bank_clue,
        generatedCase.bookstore_clue,
        generatedCase.locksmith_clue,
        generatedCase.docks_clue,
        generatedCase.hotel_clue,
        generatedCase.tobacconist_clue,
        generatedCase.carriage_station_clue,
        generatedCase.scotland_yard_clue,
        generatedCase.park_clue,
        generatedCase.final_solution,
      ],
    );
    const createdCase = result.rows[0];

    await setRoomActiveCase({ code: roomCode, caseId: createdCase.id });

    return createdCase;
  })();

  caseGenerationLocks.set(roomCode, generation);

  try {
    return await generation;
  } finally {
    caseGenerationLocks.delete(roomCode);
  }
}
