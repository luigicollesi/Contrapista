# Contrapista

Aplicação web em Next.js para criar salas temporárias e jogar Contrapista, um jogo online de investigação dedutiva. A experiência gira em torno de uma sala privada, um dossiê gerado por IA, pistas verdadeiras e falsas distribuídas entre jogadores, rodadas cronometradas e um palpite final avaliado contra a solução oficial.

## Visão Geral

O projeto permite:

- criar uma sala privada com código aleatório de 4 números;
- entrar em uma sala por código, sem login;
- escolher nickname e cor exclusiva por jogador;
- manter a sessão do jogador no `localStorage`;
- ajustar parâmetros da partida na ante-sala;
- marcar participantes como prontos antes da geração do caso;
- gerar um caso automaticamente com IA via OpenRouter;
- salvar o caso na tabela `cases`;
- vincular o caso ativo na sala por `game_rooms.activecase`;
- conduzir uma partida por fases sincronizadas em `game_rooms.gamestate`;
- distribuir pistas por jogador a partir dos arrays de pistas verdadeiras e falsas;
- sortear a ordem dos jogadores por roleta;
- compartilhar pistas por turno, com compartilhamento automático se o tempo expirar;
- pular fases coletivas por consenso;
- abrir um palpite final cronometrado, avaliado por IA;
- eliminar quem erra o palpite e liberar o arquivo completo para esse jogador;
- encerrar o caso quando houver resposta correta e retornar todos à ante-sala.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- PostgreSQL Neon via `pg`
- OpenRouter via chamadas compatíveis com Chat Completions

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

Servidor local padrão:

```text
http://localhost:3000
```

## Variáveis de Ambiente

Crie ou mantenha um arquivo `.env` com:

```env
DATABASE=postgresql://...

LLM_PROVIDER=openrouter
LLM_OPENROUTER_API_KEY=...
LLM_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_MODELS=openai/gpt-4o-mini,google/gemini-2.0-flash-001,meta-llama/llama-3.1-70b-instruct
LLM_DEBUG=false
```

Variáveis opcionais para roteamento no OpenRouter:

```env
LLM_OPENROUTER_APP_NAME=Contrapista
LLM_OPENROUTER_APP_URL=https://...
LLM_OPENROUTER_ALLOW_FALLBACKS=true
LLM_OPENROUTER_DATA_COLLECTION=deny
LLM_OPENROUTER_ZDR=true
LLM_OPENROUTER_REQUIRE_PARAMETERS=true
LLM_OPENROUTER_ONLY=openai,google
LLM_OPENROUTER_IGNORE=...
```

O projeto usa os modelos na ordem de `LLM_MODELS`, separados por vírgula. Cada chamada à IA usa somente o primeiro modelo disponível da lista; os demais ficam ignorados até serem necessários. Se esse modelo falhar por erro de API, ele entra em espera por 24 horas no processo atual. Se retornar uma resposta inválida pela validação local, entra em espera por 5 minutos. A próxima chamada passa para o próximo modelo disponível da lista.

Na geração de caso, o backend continua tentando os modelos fora de espera antes de retornar erro. Requisições com JSON estruturado usam `provider.require_parameters` para evitar provedores incompatíveis com os parâmetros enviados. Quando um modelo rejeita `response_format` com HTTP 400 ou 404 de incompatibilidade de parâmetros, a mesma chamada é repetida uma vez sem `response_format`, mantendo a validação local do JSON. Erros HTTP 400/404 de parâmetros e respostas inválidas entram em espera curta de 5 minutos. Se nenhum modelo conseguir gerar um caso válido, a sala é resetada para a ante-sala e a UI informa que os modelos de IA estão indisponíveis.

Técnicas de economia e consistência aplicadas:

- `session_id` estável por fluxo de IA para favorecer sticky routing e prompt caching no OpenRouter.
- Prompt de caso separado entre instruções fixas cacheáveis e configuração variável curta.
- Filtro por Models API do OpenRouter para ignorar modelos não generativos, como embed, rerank, safety, moderation e guard.
- Uso de `response_format` apenas quando o modelo anuncia suporte; caso contrário, o backend usa prompt JSON e validação local.
- Registro de `usage` e métricas de cache quando `LLM_DEBUG=true`.
- Mensagem específica quando o limite diário gratuito do OpenRouter é atingido.

## Jornada do Usuário

1. Na home, o jogador cria uma sala ou informa um código de 4 números.
2. Ao criar, a API grava uma sala vazia em `game_rooms`, cria a configuração padrão em `game_rooms_config` e redireciona para `/sala/[code]`.
3. Na ante-sala, cada participante entra com nickname e cor exclusiva.
4. O primeiro participante da sala atua como líder e pode alterar os parâmetros do dossiê antes de existir um caso ativo.
5. Alterar identificação ou configuração coloca jogadores como não prontos.
6. Quando todos ficam prontos, os clientes redirecionam para `/sala/[code]/criando-caso`.
7. A tela de criação chama `POST /api/rooms/[code]/case/start`.
8. O backend valida a sala, gera um caso com IA, salva em `cases` e grava o id em `game_rooms.activecase`.
9. Todos são enviados para `/sala/[code]/jogo`.
10. No jogo, todos confirmam prontidão novamente para iniciar a leitura.
11. A fase de leitura mostra o dossiê principal e os fragmentos privados de cada jogador.
12. A roleta define a ordem da rodada.
13. Em cada turno, o jogador da vez compartilha um fragmento. Se o tempo acaba, uma pista verdadeira desse jogador é compartilhada automaticamente.
14. Após cada pista, todos têm uma janela de análise coletiva.
15. Ao final da ordem, há uma pausa entre rodadas e o ciclo continua.
16. Em fases coletivas, todos podem votar para pular; a fase só avança quando todos votam.
17. Um jogador pode abrir a conclusão final, pausando o jogo para registrar um palpite cronometrado.
18. O backend compara o palpite com a solução oficial usando IA e publica o resultado.
19. Se o palpite estiver errado, o jogador é eliminado da disputa, o jogo segue e esse jogador passa a ver todas as pistas classificadas.
20. Se o palpite estiver certo, todos veem a solução oficial e podem voltar à ante-sala.
21. O caso ativo só é limpo quando todos retornam à ante-sala; os jogadores ficam como não prontos para uma nova sessão.

## Arquitetura

O projeto usa o App Router do Next.js. As telas de experiência são Client Components porque dependem de `localStorage`, timers, polling e navegação client-side. As regras de domínio ficam em `lib/rooms.ts` e `lib/cases.ts`, chamadas por Route Handlers em `app/api`.

### Telas

```text
app/page.tsx                         Home e manual de jogo
app/sala/[code]/page.tsx             Ante-sala, perfil, participantes e configuração
app/sala/[code]/criando-caso/page.tsx Tela de progresso da geração do caso
app/sala/[code]/jogo/page.tsx         Partida, fases, pistas e palpite final
app/not-found.tsx                     Página 404
```

### APIs

```text
POST  /api/rooms                         Cria sala
GET   /api/rooms/[code]                  Lê sala e avança fases expiradas
POST  /api/rooms/[code]/join             Entra na sala
POST  /api/rooms/[code]/leave            Sai da sala
PATCH /api/rooms/[code]/users/[userId]   Atualiza nickname e cor
POST  /api/rooms/[code]/ready            Marca pronto na ante-sala
PATCH /api/rooms/[code]/config           Atualiza configuração da sala
GET   /api/rooms/[code]/case/start       Lê estimativa da última geração
POST  /api/rooms/[code]/case/start       Gera ou reutiliza caso ativo
POST  /api/rooms/[code]/game/ready       Confirma prontidão dentro do jogo
POST  /api/rooms/[code]/game/skip        Vota para pular fase coletiva
POST  /api/rooms/[code]/clues            Compartilha pista do turno
POST  /api/rooms/[code]/events           Publica palpite final e resultado
POST  /api/rooms/[code]/case/return      Marca retorno à ante-sala
POST  /api/rooms/[code]/case/finish      Limpa caso ativo imediatamente
GET   /api/cases/[caseId]                Lê caso salvo
```

### Domínio

```text
lib/rooms.ts                 Estado e regras de sala, jogo, eventos e config
lib/cases.ts                 Prompt, validação, geração e persistência de casos
lib/db.ts                    Pool PostgreSQL
lib/player-colors.ts         Cores permitidas
lib/ai                       Configuração, fallback e cliente de IA
```

## Modelo de Dados

O projeto cria e ajusta o schema em runtime por meio de `ensureSchema` em `lib/rooms.ts` e `ensureCaseSchema` em `lib/cases.ts`. O script `scripts/migrate-game-rooms.sql` cobre uma migração legada de nomes de coluna, mas o runtime atual também garante as tabelas principais.

### `game_rooms`

Usada para salas e estado atual da partida.

Campos relevantes:

- `id`
- `room_code`
- `activecase`
- `activeevent`
- `gamestate`
- `users`
- `config_id`
- `empty_since`
- `created_at`
- `updated_at`

Regras:

- `room_code` é o código de 4 números da sala;
- `users` guarda jogadores em JSON;
- cada jogador tem `id`, `nickname`, `color`, `ready` e `joinedAt`;
- `color` deve ser única por sala;
- `activecase` aponta para `cases.id`;
- `activeevent` sincroniza eventos de palpite e resultado;
- `gamestate` sincroniza fases, roleta, turno atual, pistas compartilhadas, votos para pular, eliminados e retorno à ante-sala;
- sala vazia recebe `empty_since` e pode ser removida após 1 hora.

### `game_rooms_config`

Usada para parâmetros da partida.

Campos relevantes:

- `room_id`
- `reading_time_seconds`
- `clue_selection_time_seconds`
- `revealed_clue_analysis_time_seconds`
- `round_analysis_time_seconds`
- `final_guess_time_seconds`
- `true_clues_per_player`
- `clues_per_player`

Valores padrão:

```text
readingTimeSeconds=120
clueSelectionTimeSeconds=10
revealedClueAnalysisTimeSeconds=30
roundAnalysisTimeSeconds=60
finalGuessTimeSeconds=30
trueCluesPerPlayer=3
cluesPerPlayer=6
```

### `cases`

Usada para os casos gerados pela IA.

Campos usados:

- `id`
- `title`
- `case_text`
- `final_answer`
- `true_clues`
- `false_clues`
- `created_at`

O caso é gerado como JSON estruturado. `true_clues` e `false_clues` são arrays JSONB com quantidade calculada por número de jogadores e configuração da sala.

## Fluxo de Estado do Jogo

O estado da partida fica em `game_rooms.gamestate`:

```text
ready -> reading -> roulette -> turn -> shared_clue -> turn/pause -> ...
```

Fases principais:

- `ready`: todos confirmam presença dentro do jogo.
- `reading`: leitura inicial do dossiê e dos fragmentos privados.
- `roulette`: sorteio animado da ordem de jogadores da rodada.
- `turn`: jogador atual escolhe uma pista para compartilhar.
- `shared_clue`: pista revelada fica visível para todos durante a análise.
- `pause`: intervalo coletivo entre rodadas.

A função `GET /api/rooms/[code]` também avança fases expiradas quando a sala é consultada. Isso mantém a sincronização com polling sem servidor em tempo real.

## Distribuição de Pistas

Cada jogador recebe `cluesPerPlayer` fragmentos. A quantidade de pistas verdadeiras vem de `trueCluesPerPlayer`; o restante vem de `false_clues`.

A tela de jogo monta os fragmentos de forma determinística:

- usa a posição do jogador na lista da sala;
- pega uma faixa de `true_clues` e uma faixa de `false_clues`;
- embaralha com seed baseada em `case.id` e `userId`;
- registra em `gamestate.sharedClueIds` quais fragmentos já foram revelados.

O backend valida a vez do jogador antes de aceitar uma pista compartilhada.

## IA

A camada de IA fica em `lib/ai`.

Uso atual:

- geração do caso e suas pistas em `lib/cases.ts`;
- reparo de JSON inválido quando possível;
- avaliação do palpite final contra a resposta oficial em `lib/rooms.ts`.

A geração exige:

- JSON válido;
- campos `title`, `case_text`, `true_clues`, `false_clues`, `final_answer`;
- quantidade exata de pistas conforme a configuração;
- perguntas centrais explícitas no texto do caso;
- resposta final começando com `Resposta:` e contendo `Contexto:`.

## Sessão e Sincronização

- Não existe login.
- A sessão do jogador fica em `localStorage` com a chave `contrapista-session`.
- Há marcadores locais por sala para evitar que um jogador que já voltou à ante-sala seja puxado de volta para o caso ativo.
- A sincronização entre jogadores usa polling a cada 2 segundos e estado persistido em PostgreSQL.
- Eventos efêmeros de palpite ficam em `activeevent`; fases e progresso ficam em `gamestate`.

## Cores dos Jogadores

As cores permitidas ficam em `lib/player-colors.ts`:

```text
red
blue
green
yellow
purple
orange
```

O frontend desabilita cores já usadas e o backend também bloqueia duplicidade.

## Tema Visual

O site tem identidade visual escura por padrão e regras adicionais para modo claro em `app/globals.css`.

Quando o navegador está em modo claro:

- fundos ficam claros;
- textos ficam escuros;
- inputs e painéis usam contraste claro.

## Observações

- A aplicação pressupõe um único banco PostgreSQL configurado por `DATABASE`.
- O estado não usa WebSocket ou SSE; a coordenação acontece por polling.
- A geração de caso tem trava em memória por sala para evitar criações simultâneas no mesmo processo.
- Como parte do estado depende de memória do processo, como espera temporária de modelos e tempo estimado da última geração, esses dados não são compartilhados entre múltiplas instâncias.
