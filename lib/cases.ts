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
      throw new Error(`Resposta da IA sem campo válido: ${key}`);
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
    maxTokens: 3000,
    messages: [
      {
        role: "system",
        content:
          "Você cria casos investigativos para um jogo de tabuleiro inspirado no Scotland Yard clássico. Responda somente JSON válido, sem markdown. Construa mistérios dedutivos com perguntas objetivas, pistas curtas, falsas pistas plausíveis e uma solução que responda claramente cada pergunta.",
      },
      {
        role: "user",
        content: `
Crie um caso original em português, com atmosfera de Londres vitoriana e investigação dedutiva familiar.

Padrão obrigatório do caso:
- Deve haver um incidente central claro: morte, roubo, desaparecimento, fraude ou sabotagem.
- Apresente 3 ou 4 suspeitos com motivos aparentes diferentes.
- Inclua álibis, horários, objetos físicos e pelo menos uma tentativa de despistar os investigadores.
- A solução deve depender de cruzar várias pistas, não de uma única pista óbvia.
- Pelo menos duas pistas devem inocentar suspeitos.
- Pelo menos duas pistas devem parecer incriminar alguém errado, mas a solução deve explicar por que elas eram enganosas, incompletas ou plantadas.
- Pelo menos três dicas devem vir em fragmentos complementares: metades no mesmo local, partes numeradas espalhadas por locais diferentes ou pistas que só façam sentido quando cruzadas com outra dica.
- As dicas devem ser curtas, concretas e criativas: registros, objetos, testemunhos, marcas, horários, fibras, recibos, chaves, rotas, contradições, charadas, rimas ou trocadilhos.
- Use algumas dicas cifradas por linguagem: jogos de palavra, sons parecidos, rimas, duplos sentidos, descrições metafóricas de objetos ou pistas incompletas que apontem para sílabas, formatos, materiais ou partes de uma palavra.
- As dicas criativas não podem resolver tudo sozinhas. Elas devem sugerir uma peça da solução e precisar de confirmação por outra pista física, testemunhal ou temporal.
- Não use exemplos literais de armas, rimas, frases ou fragmentos já citados pelo usuário. Crie jogos de palavra originais para o caso gerado.
- Evite pistas genéricas como "parece suspeito" ou "alguém viu algo estranho".
- Não copie personagens, objetos ou soluções de exemplos anteriores.

Campos obrigatórios:
- title: título curto em estilo "O CASO DO ..." ou "O CASO DA ...".
- case_text: 2 a 4 parágrafos curtos. No último parágrafo, faça perguntas explícitas e objetivas que os jogadores devem responder.
- As perguntas do case_text devem ser numeradas. Elas precisam apontar para conclusões dedutivas, não para opiniões.
- Faça 2, 3 ou 4 perguntas adequadas ao caso. Cada pergunta deve pedir uma resposta objetiva: culpado, método, arma, motivo, local, cúmplice, objeto escondido, rota usada, contradição decisiva ou identidade real.
- Evite perguntas vagas como "o que aconteceu?", "qual é o mistério?" ou "quem parece suspeito?". Prefira formatos como: "Quem cometeu o crime?", "Qual arma foi usada?", "Qual foi o motivo?", "Onde o objeto foi escondido?", "Que álibi era falso?"
- Todas as perguntas devem ter resposta direta no primeiro parágrafo de final_solution, na mesma ordem em que aparecerem no case_text.
- final_solution: o primeiro parágrafo deve começar com "Resposta:" e responder cada pergunta de forma simples, direta e numerada quando houver mais de uma pergunta. O segundo parágrafo deve começar com "Contexto:" e explicar como as pistas se conectam.

Locais e chaves obrigatórias:
${locationList}

Formato obrigatório:
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
