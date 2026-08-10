# Contrapista

Aplicação web em Next.js para criar salas temporárias e jogar Contrapista, um jogo online competitivo de investigação dedutiva. A experiência gira em torno de uma sala privada, um dossiê gerado por IA, pistas verdadeiras e falsas distribuídas entre jogadores, rodadas cronometradas e um palpite final avaliado contra a solução oficial. Vence quem acertar a solução do caso primeiro.

## Visão Geral

O projeto permite:

- criar uma sala privada com código aleatório de 4 números;
- entrar em uma sala por código, com conta pública opcional;
- criar conta e fazer login por email/senha, Google ou GitHub em modal público;
- escolher nickname e cor exclusiva por jogador;
- manter a sessão do jogador no `localStorage`;
- ajustar parâmetros da partida na ante-sala;
- escolher um caso existente em salas personalizadas;
- marcar participantes como prontos antes da geração do caso;
- gerar um caso automaticamente com IA via OpenRouter;
- salvar o caso na tabela `cases`;
- vincular o caso ativo na sala por `game_rooms.activecase`;
- parear jogadores em filas casual e rankeada para mesas clássicas de 4 jogadores;
- oferecer um problema diário sorteado do banco com tentativa individual por usuário;
- conduzir uma partida por fases sincronizadas em `game_rooms.gamestate`;
- distribuir pistas por jogador a partir dos arrays de pistas verdadeiras e falsas;
- sortear a ordem dos jogadores por roleta;
- compartilhar pistas por turno, com compartilhamento automático se o tempo expirar;
- pular fases coletivas por consenso;
- abrir um palpite final cronometrado, avaliado por IA;
- eliminar quem erra o palpite e liberar o arquivo completo para esse jogador;
- encerrar o caso quando houver resposta correta, declarar o primeiro jogador que acertou como vencedor e retornar todos à ante-sala.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Auth.js / NextAuth 5
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
AUTH_SECRET=uma-string-segura-com-32-bytes-ou-mais
BACKEND_TRUSTED_HOSTS=localhost:3000,seudominio.com
AUTH_URL=http://localhost:3000
AUTH_REDIRECT_PROXY_URL=http://localhost:3000/api/auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_GMAIL_SENDER_EMAIL=conta-remetente@gmail.com
GOOGLE_GMAIL_SENDER_NAME=Contrapista
GOOGLE_GMAIL_REDIRECT_URI=http://localhost:3000/api/auth/google-gmail/callback
GOOGLE_GMAIL_REFRESH_TOKEN=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
LLM_PROVIDER=openrouter
LLM_OPENROUTER_API_KEY=key_1,key_2,key_3
LLM_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_MODELS=openai/gpt-4o-mini,google/gemini-2.0-flash-001,meta-llama/llama-3.1-70b-instruct
LLM_DEBUG=false
```

Para produção, ajuste:

```env
GOOGLE_GMAIL_REDIRECT_URI=https://seudominio.com/api/auth/google-gmail/callback
NEXT_PUBLIC_APP_URL=https://seudominio.com
AUTH_URL=https://seudominio.com
AUTH_REDIRECT_PROXY_URL=https://seudominio.com/api/auth
```

`NEXT_PUBLIC_APP_URL` também define URLs canônicas, sitemap e metadados sociais. `AUTH_URL` define a origem pública usada pelo Auth.js. `AUTH_REDIRECT_PROXY_URL` força o OAuth a montar callbacks sempre a partir de `/api/auth`. Em produção, use sempre o domínio público final nesses valores.

Callbacks para cadastrar no Google Cloud:

```text
Auth.js Google login:        https://seudominio.com/api/auth/callback/google
Gmail remetente do sistema:  https://seudominio.com/api/auth/google-gmail/callback
```

O login com Google deve usar um OAuth Client do tipo **Web application** no Google Cloud. Clientes do tipo aplicativo/desktop/mobile usam outro modelo de callback e podem gerar `redirect_uri_mismatch` neste fluxo web. No GitHub, cadastre a callback da OAuth App como `https://seudominio.com/api/auth/callback/github`.

Para gerar `GOOGLE_GMAIL_REFRESH_TOKEN`, use o email remetente em `GOOGLE_GMAIL_SENDER_EMAIL`, configure a callback do Gmail no Google Cloud e rode:

```bash
node --env-file=.env scripts/generate-google-gmail-refresh-token.mjs
```

Abra a URL exibida, aceite o escopo `gmail.send`, copie o `code` retornado pela callback e rode:

```bash
node --env-file=.env scripts/generate-google-gmail-refresh-token.mjs --code=COLE_O_CODE_AQUI
```

O backend renova o access token do Gmail no início do processo e periodicamente enquanto o servidor estiver ativo. Se o `refresh_token` for revogado, removido pelo Google ou perder consentimento, é necessário gerar um novo token com o fluxo acima.

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

`LLM_OPENROUTER_API_KEY` também aceita uma lista separada por vírgula. A fila percorre primeiro todos os modelos elegíveis com a primeira chave; quando todos os modelos dessa chave estiverem em espera, passa para a segunda chave e recomeça a ordem de modelos. Falhas específicas de modelo entram em espera por combinação `chave + modelo`. Falhas de escopo da chave, como `401`, `403` ou `429` de cota/rate limit do OpenRouter, colocam todos os modelos daquela chave em espera e avançam diretamente para a próxima chave. Os valores reais das chaves não são registrados nem expostos nos logs.

Cada resposta bem-sucedida do OpenRouter é registrada em `public.openrouter_request_usage`, com o slot da chave (1–7), modelo e tokens de uso. A tabela não guarda a API key e alimenta o painel administrativo no projeto separado `adm-contrapista`. Para criar a tabela manualmente antes do primeiro uso, rode `psql "$DATABASE" -v ON_ERROR_STOP=1 -f scripts/migrate-openrouter-usage.sql`.

Na geração de caso, o backend continua tentando os modelos fora de espera antes de retornar erro. Requisições com JSON estruturado usam `provider.require_parameters` para evitar provedores incompatíveis com os parâmetros enviados. Quando um modelo rejeita `response_format` com HTTP 400 ou 404 de incompatibilidade de parâmetros, a mesma chamada é repetida uma vez sem `response_format`, mantendo a validação local do JSON. Erros HTTP 400/404 de parâmetros e respostas inválidas entram em espera curta de 5 minutos. Se nenhum modelo conseguir gerar um caso válido, a sala é resetada para a ante-sala e a UI informa que os modelos de IA estão indisponíveis.

Técnicas de economia e consistência aplicadas:

- `session_id` estável por fluxo de IA para favorecer sticky routing e prompt caching no OpenRouter.
- Fila em memória por `session_id`: requisições da mesma sala/fluxo executam uma de cada vez, evitando rajadas simultâneas para a mesma sala.
- Prompt de caso separado entre instruções fixas cacheáveis e configuração variável curta.
- Filtro por Models API do OpenRouter para ignorar modelos não generativos, como embed, rerank, safety, moderation e guard.
- Uso de `response_format` apenas quando o modelo anuncia suporte; caso contrário, o backend usa prompt JSON e validação local.
- Logs de lifecycle de IA para acompanhar seleção, envio, retry, sucesso, falha e ação de standoff por `requestId`, `apiKeySlot`, `modelSlot` e modelo, sem expor valores de chaves.
- Registro de prompt, resposta bruta, `usage` e métricas de cache quando `LLM_DEBUG=true`.
- Mensagem específica quando o limite diário gratuito do OpenRouter é atingido.

## Jornada do Usuário

1. Na home, o jogador cria uma sala ou informa um código de 4 números.
2. Ao criar uma sala, o navegador gera/reutiliza um `browserId` em UUID e envia para a API. A API grava `game_rooms`, cria a configuração padrão em `game_rooms_config`, adiciona o primeiro usuário como participante pendente sem nickname/cor e redireciona para `/sala/[code]`.
3. Ao informar um código, o mesmo `browserId` é enviado para `/join`. Se esse navegador já estiver na sala, o backend reutiliza o participante existente; caso contrário, só adiciona um novo participante pendente se a sala ainda estiver na ante-sala. Salas criando caso ou com jogo ativo recusam novos participantes.
4. Na ante-sala, o participante pendente escolhe nickname e cor exclusiva. O botão de pronto só aparece depois dessa identificação, e o backend recusa prontidão sem nome/cor.
5. O primeiro participante da sala atua como líder e pode alterar os parâmetros do dossiê antes de existir um caso ativo.
6. Alterar identificação ou configuração coloca jogadores como não prontos.
7. Clientes na ante-sala, na criação de caso e no jogo enviam heartbeat; se um participante fica 2 minutos sem contato, ele é considerado desconectado.
8. Na ante-sala, desconectados saem da sala. No jogo, desconectados são eliminados como se tivessem errado um palpite final: saem da ordem, não votam e suas pistas ficam expostas aos demais.
9. Leituras de sala usam snapshot sem efeitos colaterais; avanço automático de fase e limpeza de desconectados rodam em chamadas mutáveis autenticadas.
10. Quando todos ficam prontos, os clientes redirecionam para `/sala/[code]/criando-caso`.
11. A tela de criação chama `POST /api/rooms/[code]/case/start`.
12. O backend valida a sala, gera um caso com IA, salva em `cases` e grava o id em `game_rooms.activecase`.
13. Todos são enviados para `/sala/[code]/jogo`.
14. No jogo, todos confirmam prontidão novamente para iniciar a leitura.
15. A fase de leitura mostra o dossiê principal e os fragmentos privados de cada jogador.
16. A roleta define a ordem da rodada.
17. Em cada turno, o jogador da vez compartilha um fragmento. Se o tempo acaba, uma pista aleatória desse jogador é compartilhada automaticamente.
18. Após cada pista, todos têm uma janela de análise coletiva.
19. Ao final da ordem, há uma pausa entre rodadas e o ciclo continua.
20. Em fases coletivas, todos podem votar para pular; a fase só avança quando todos votam.
21. Um jogador pode abrir a conclusão final, pausando o jogo para registrar um palpite cronometrado.
22. O backend compara o palpite com a solução oficial usando IA e publica o resultado.
23. Se o palpite estiver errado, o jogador é eliminado da disputa, o jogo segue, esse jogador passa a ver todas as pistas classificadas e recebe uma linha provisória no histórico com o próprio palpite.
24. Se o palpite estiver certo, o histórico da partida é gravado para todos os participantes com conta, todos veem a solução oficial e podem voltar à ante-sala.
25. Se todos os jogadores ativos forem eliminados ou desconectados antes de alguém acertar, a partida termina sem vencedor e também gera histórico.
26. O caso ativo só é limpo quando todos retornam à ante-sala; os jogadores ficam como não prontos para uma nova sessão.
27. Se todos os participantes saírem ou forem removidos por desconexão na ante-sala, a sala é excluída de `game_rooms`.

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
POST  /api/rooms/[code]/heartbeat        Atualiza presença do participante
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
GET   /api/cases/[caseId]                Lê caso salvo
```

### Domínio

```text
lib/rooms.ts                 Estado e regras de sala, jogo, eventos e config
lib/cases.ts                 Prompt, validação, geração e persistência de casos
lib/match-history.ts         Schema, gravação e leitura do histórico de partidas
lib/db.ts                    Pool PostgreSQL
lib/auth-users.ts            Schema, cadastro e autenticação de usuários
lib/player-colors.ts         Cores permitidas
lib/ai                       Configuração, fallback e cliente de IA
auth.ts                      Configuração Auth.js com credentials, Google e GitHub
```

## Modelo de Dados

O projeto cria e ajusta o schema em runtime por meio de `ensureSchema` em `lib/rooms.ts` e `ensureCaseSchema` em `lib/cases.ts`. O script `scripts/migrate-game-rooms.sql` cobre uma migração legada de nomes de coluna, mas o runtime atual também garante as tabelas principais.

### `game_rooms`

Usada para salas e estado atual da partida.

Campos relevantes:

- `id`
- `room_code`
- `activecase`
- `selectedcase`
- `activeevent`
- `gamestate`
- `users`
- `mode`
- `config_id`
- `created_at`
- `updated_at`

Regras:

- `room_code` é o código de 4 números da sala;
- `users` guarda jogadores em JSON;
- `mode` indica `custom`, `casual` ou `ranked`;
- cada jogador tem `id`, `nickname`, `color`, `ready` e `joinedAt`;
- `color` deve ser única por sala;
- `activecase` aponta para `cases.id`;
- `selectedcase` aponta para um caso escolhido na ante-sala personalizada antes do início;
- `activeevent` sincroniza eventos de palpite e resultado;
- `gamestate` sincroniza fases, roleta, turno atual, pistas compartilhadas, votos para pular, eliminados e retorno à ante-sala;
- sala vazia é removida imediatamente.
- salas `casual` e `ranked` são pareadas automaticamente, usam configuração clássica fixa e não possuem líder/configuração editável.
- salas e modos de jogo exigem usuário logado com `username` definido;
- na ante-sala, o nickname vem da conta e o jogador escolhe apenas uma cor antes de marcar pronto.
- em salas personalizadas, o primeiro participante pode escolher um caso existente;
- ao escolher um caso, todos voltam para aguardando;
- quando todos ficam prontos com um caso escolhido, o backend valida se há pistas suficientes e inicia o jogo direto;
- se a validação falhar, todos voltam para aguardando e a seleção é removida.

### `matchmaking_queue`

Usada para parear jogadores em filas públicas.

Campos relevantes:

- `id`
- `browser_id`
- `user_id`
- `mode`
- `rating`
- `matched_room_code`
- `room_user_id`
- `created_at`
- `updated_at`

Regras:

- `casual` pareia os primeiros 4 jogadores disponíveis;
- `ranked` exige usuário logado e pareia 4 jogadores com rating próximo;
- a fila é vinculada ao usuário logado e ao navegador usado na busca;
- entradas em fila usam heartbeat; jogadores sem comunicação recente deixam de ser candidatos ao pareamento;
- a tela de busca mostra quantos jogadores compatíveis já estão na fila até fechar 4;
- quando a mesa fecha, uma sala `game_rooms` é criada com `mode` correspondente, nomes vindos das contas e cores ainda vazias;
- sair da tela de busca cancela a entrada ainda não pareada;
- a ante-sala pareada não mostra painel de configuração nem líder da sala.

### `daily_problems`

Usada para guardar o caso diário escolhido.

Campos relevantes:

- `problem_date`
- `case_id`
- `created_at`

Regras:

- há no máximo um problema por dia;
- o caso é sorteado aleatoriamente da tabela `cases` na primeira abertura do dia ou pelo scheduler iniciado junto com o servidor;
- o scheduler reexecuta a verificação na virada UTC e usa `ON CONFLICT` para evitar duplicatas;
- dias anteriores permanecem registrados e podem ser abertos pelo calendário;
- o calendário exibe o mês completo, mas só habilita datas presentes em `daily_problems`.

### `daily_problem_attempts`

Usada para controlar o último palpite individual do problema diário.

Campos relevantes:

- `user_id`
- `problem_date`
- `submitted_answer`
- `is_correct`
- `cooldown_until`
- `answered_at`
- `created_at`
- `updated_at`

Regras:

- chave primária composta por `user_id` e `problem_date`;
- há no máximo um palpite salvo por usuário em cada problema diário;
- ao enviar um novo palpite, o palpite anterior expirado é removido e substituído;
- quem acerta passa a ver sua própria resposta e a resposta oficial;
- quem erra mantém apenas o último palpite enviado e entra em cooldown de 1 hora;
- acertos incrementam `user_achievements.daily_problems_solved`;
- as pistas são exibidas juntas e embaralhadas de forma estável, sem indicar quais são verdadeiras ou falsas.

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

### `users`

Usada para contas públicas do site.

Campos relevantes:

- `id`
- `name`
- `username`
- `email`
- `email_normalized`
- `provider`
- `password_hash`
- `email_verified`
- `email_verified_at`
- `privacy_acknowledged`
- `privacy_acknowledged_at`
- `privacy_version`
- `terms_accepted`
- `terms_accepted_at`
- `terms_version`
- `created_at`
- `updated_at`

Regras:

- `email_normalized` é único;
- `username` é único quando definido e é o nome público exibido no site;
- OAuth não usa automaticamente o nome vindo de Google/GitHub; o usuário escolhe `username` depois do primeiro login;
- `provider` indica `credentials`, `google` ou `github`;
- o mesmo email só pode autenticar pelo provider usado no primeiro cadastro;
- o aceite dos termos é obrigatório ao efetivar o cadastro, seja no cadastro por email/senha ou na escolha do `username` após OAuth;
- contas por email/senha só são criadas em `users` depois da confirmação do email;
- `terms_accepted`, `privacy_acknowledged` e `email_verified` bloqueiam login/ações quando falsos;
- `terms_accepted_at` e `privacy_acknowledged_at` registram quando o aceite/ciência foi feito;
- `terms_version` e `privacy_version` guardam as versões aceitas;
- a tela de perfil permite excluir a conta com confirmação em modal por código hexadecimal gerado pelo backend; a UI avisa 30 segundos e o servidor guarda o código por 40 segundos;
- senhas são armazenadas como hash `scrypt` com salt individual;
- Auth.js usa sessão JWT;
- login/cadastro aparecem em modal no cabeçalho público, não em páginas próprias.
- `/termos` e `/privacidade` são páginas públicas e não exibem o modal obrigatório de escolha de nome, permitindo leitura antes do aceite.

### `email_verification_tokens`

Usada para confirmar contas cadastradas com email e senha.

Campos relevantes:

- `id`
- `user_id`
- `token_hash`
- `email`
- `username`
- `password_hash`
- `expires_at`
- `used_at`
- `created_at`

Regras:

- o token salvo é hash SHA-256, não o token bruto enviado por email;
- antes da confirmação, `email`, `username` e `password_hash` ficam apenas nessa tabela temporária;
- cada novo envio invalida tokens pendentes do mesmo email ou nome de usuário;
- o link expira em 1 hora;
- confirmação cria a linha em `users` já com `email_verified = true`;
- `user_id` só é usado para compatibilidade com tokens antigos gerados quando a conta ainda era criada antes da confirmação.

### `user_achievements`

Usada para métricas de perfil conectadas ao usuário.

Campos relevantes:

- `user_id`
- `total_matches_played`
- `ranked_matches_played`
- `total_matches_won`
- `ranked_matches_won`
- `ranked_rating`
- `daily_problems_solved`
- `created_at`
- `updated_at`

Regras:

- `user_id` referencia `users.id` com remoção em cascata;
- uma linha é criada automaticamente quando o usuário é cadastrado ou consolidado via OAuth;
- valores começam em `0`, exceto `ranked_rating`, que começa em `1000`;
- partidas encerradas atualizam totais jogados e vitórias junto da gravação de `match_history`.

### `match_history`

Usada para listar partidas encerradas no perfil.

Campos relevantes:

- `id`
- `match_id`
- `case_id`
- `user_id`
- `username`
- `winner_user_id`
- `winner_username`
- `official_final_answer`
- `winning_final_guess`
- `user_final_guess`
- `user_won`
- `finalized_at`
- `stats_recorded`
- `created_at`

Regras:

- um palpite errado cria ou atualiza uma linha provisória para o jogador eliminado, com `winner_user_id`, `winner_username` e `winning_final_guess` ainda nulos;
- quando a partida termina, o histórico é fechado para todos os participantes com conta ainda registrados na sala;
- linhas provisórias recebem `winner_user_id`, `winner_username` e `winning_final_guess` se outro jogador vencer depois;
- `winner_user_id`, `winner_username` e `winning_final_guess` ficam nulos quando a partida termina sem vencedor;
- `user_final_guess` guarda o palpite enviado pelo próprio usuário naquela partida, quando existir;
- `case_id` referencia `cases.id` e permite abrir o caso completo no perfil;
- `stats_recorded` evita somar partidas e vitórias mais de uma vez em `user_achievements`.

Valores padrão:

```text
readingTimeSeconds=120
clueSelectionTimeSeconds=10
revealedClueAnalysisTimeSeconds=30
roundAnalysisTimeSeconds=60
finalGuessTimeSeconds=60
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

Cada jogador recebe uma quantidade igual de fragmentos do caso ativo.

A tela de jogo monta os fragmentos de forma determinística:

- usa a posição do jogador na lista da sala;
- redistribui `true_clues` e `false_clues` sem reutilizar pistas;
- descarta sobras que não fecham divisão igual, priorizando descartar pistas falsas;
- embaralha com seed baseada em `case.id` e `userId`;
- registra em `gamestate.sharedClueIds` quais fragmentos já foram revelados.

O backend valida a vez do jogador antes de aceitar uma pista compartilhada.

O estado também guarda `finalGuessesByUserId`, com o último palpite final enviado por cada jogador da sala, e `matchHistoryRecordedAt`, usado para evitar gravação duplicada do histórico quando a partida já foi encerrada.

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

- Existe login público opcional por Auth.js, com email/senha, Google e GitHub.
- A sessão de conta é independente da sessão de jogador da sala.
- A página `/jogar` é pública, mas suas ações derivadas exigem conta logada com nome público definido.
- Rotas protegidas por navegação: `/jogar/busca`, `/jogar/diario` e `/sala/*`.
- APIs protegidas: `/api/rooms/*`, `/api/matchmaking`, `/api/daily-problem`, `/api/cases/*` e `/api/users/*`.
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
