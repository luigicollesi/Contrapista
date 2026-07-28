# Scotland Yard

Aplicacao web em Next.js para criar salas temporarias e jogar uma investigacao cooperativa inspirada no Scotland Yard classico.

## Visao Geral

O projeto permite:

- criar sala com codigo aleatorio de 4 numeros;
- entrar em uma sala por codigo;
- escolher nickname e cor exclusiva por jogador;
- marcar jogadores como prontos no lobby;
- gerar um caso automaticamente com IA via OpenRouter;
- salvar o caso na tabela `cases`;
- vincular o caso ativo na sala por `game_rooms.activecase`;
- jogar com 14 locais de pistas, modais sincronizados e solucao final.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- PostgreSQL Neon via `pg`
- OpenRouter via SDK `openai`

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

Servidor local padrao:

```text
http://localhost:3000
```

## Variaveis de Ambiente

Crie ou mantenha um arquivo `.env` com:

```env
DATABASE=postgresql://...

LLM_PROVIDER=openrouter
LLM_OPENROUTER_API_KEY=...
LLM_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL1=...
LLM_MODEL2=...
LLM_MODEL3=...
LLM_MODEL4=...
LLM_MODEL5=...
LLM_DEBUG=false
```

O projeto tenta os modelos configurados em ordem. Quando um modelo falha, ele entra em standoff por 24 horas no processo atual.

## Banco de Dados

O projeto usa duas tabelas principais.

### `game_rooms`

Usada para salas e estado atual do jogo.

Campos relevantes:

- `id`
- `room_code`
- `users`
- `activecase`
- `activeevent`
- `empty_since`
- `created_at`
- `updated_at`

Regras:

- `room_code` e o codigo de 4 numeros da sala;
- `users` guarda jogadores em JSON;
- cada jogador tem `id`, `nickname`, `color`, `ready` e `joinedAt`;
- `color` deve ser unica por sala;
- `activecase` aponta para `cases.id`;
- `activeevent` sincroniza modais de pistas e solucao entre jogadores;
- sala vazia recebe `empty_since` e pode ser removida apos 1 hora.

### `cases`

Usada para os casos gerados pela IA.

Campos usados:

- `case_text`
- `museum_clue`
- `bar_clue`
- `pharmacy_clue`
- `pawn_shop_clue`
- `theater_clue`
- `bank_clue`
- `bookstore_clue`
- `locksmith_clue`
- `docks_clue`
- `hotel_clue`
- `tobacconist_clue`
- `carriage_station_clue`
- `scotland_yard_clue`
- `park_clue`
- `final_solution`

## Fluxo do Jogo

1. Um jogador cria uma sala na home.
2. Outros jogadores entram pelo codigo de 4 numeros.
3. Cada jogador escolhe nickname e uma cor ainda livre.
4. Todos clicam em `Pronto`.
5. A pagina de criacao de caso chama o backend.
6. O backend chama OpenRouter, gera um JSON de caso e salva em `cases`.
7. O `id` do caso e salvo em `game_rooms.activecase`.
8. Todos sao enviados para a tela de jogo.
9. Ao abrir uma pista, o jogador ve a dica por 30 segundos.
10. Os outros jogadores veem um modal informando quem abriu a pista.
11. A solucao final abre apenas para quem clicou.
12. Se esse jogador clicar em `Acertou`, todos veem o modal final.
13. Ao voltar ao lobby, o caso ativo e limpo e jogadores ficam como nao prontos.

## Cores dos Jogadores

As cores permitidas ficam em `lib/player-colors.ts`:

```ts
red
blue
green
yellow
purple
orange
```

O frontend desabilita cores ja usadas e o backend tambem bloqueia duplicidade.

## Estrutura Principal

```text
app/page.tsx                         Home
app/sala/[code]/page.tsx             Lobby
app/sala/[code]/criando-caso/page.tsx Tela de geracao
app/sala/[code]/jogo/page.tsx         Tela de jogo
app/api/rooms                         Rotas de sala
app/api/cases                         Rotas de caso
lib/rooms.ts                          Estado e regras de sala
lib/cases.ts                          Geracao e persistencia de casos
lib/ai                                Cliente OpenRouter
lib/db.ts                             Pool PostgreSQL
```

## Tema Visual

O site tem identidade visual escura por padrao e regras adicionais para modo claro em `app/globals.css`.

Quando o navegador esta em modo claro:

- fundos ficam claros;
- textos ficam escuros;
- inputs e paineis usam contraste claro.

## Observacoes

- Nao existe login.
- A sessao do jogador fica no `localStorage`.
- A sincronizacao entre jogadores usa polling e eventos salvos na sala.
- A aplicacao pressupoe um unico banco PostgreSQL configurado por `DATABASE`.
