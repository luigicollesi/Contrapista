import { chatCompletion } from "@/lib/ai";
import { CASE_LOCATIONS, type CaseLocationKey } from "@/lib/case-locations";
import { pool } from "@/lib/db";
import { setRoomActiveCase } from "@/lib/rooms";

export type GameCase = {
  id: string;
  case_text: string;
  final_solution: string;
  created_at?: string;
} & Record<CaseLocationKey, string>;

type GeneratedCase = Omit<GameCase, "id" | "created_at">;

const caseGenerationLocks = new Map<string, Promise<GameCase>>();

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

  const chat = await chatCompletion({
    temperature: 0.85,
    maxTokens: 2400,
    messages: [
      {
        role: "system",
        content:
          "Voce cria casos investigativos para um jogo de tabuleiro inspirado no Scotland Yard classico. Responda somente JSON valido, sem markdown.",
      },
      {
        role: "user",
        content: `
Crie um caso original em portugues, com atmosfera de Londres vitoriana e investigacao dedutiva familiar.

O caso deve ter:
- case_text: texto inicial do caso, com 2 a 4 paragrafos curtos.
- 14 dicas, uma para cada local abaixo. Cada dica deve parecer uma pista encontrada naquele local, ter 1 a 3 frases e ajudar a resolver o caso.
- final_solution: solucao final explicando culpado, motivo, oportunidade e como as pistas se conectam.

Locais e chaves obrigatorias:
${locationList}

Formato obrigatorio:
{
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
          $9, $10, $11, $12, $13, $14, $15, $16
        )
        RETURNING *
      `,
      [
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
