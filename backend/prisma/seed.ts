// Seed idempotente do Diário Dev (§25). Reproduz os dados que o protótipo
// exibe (assets/data.js + configuracoes.dc.html) para manter o frontend
// visualmente preenchido. Reexecutável sem duplicar (upsert por chave estável).
//
// AVISO: senha de desenvolvimento única para todos os usuários. Troque em
// qualquer ambiente que não seja local. Não roda em produção.
import { PrismaClient, Priority, AccessLevel } from '@prisma/client';
import { hashPassword } from '../src/common/auth/password.js';
import { encryptSecret } from '../src/common/utils/crypto.js';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'DiarioDev@2026';

const PRIORITY: Record<string, Priority> = {
  baixa: Priority.BAIXA,
  'média': Priority.MEDIA,
  alta: Priority.ALTA,
};
const LEVEL: Record<string, AccessLevel> = {
  dev: AccessLevel.DEV,
  gestor: AccessLevel.GESTOR,
  ceo: AccessLevel.CEO,
};

type Person = {
  id: string;
  name: string;
  role: string;
  email: string;
  ini: string;
  color: string;
  active: boolean;
  level: string;
};

const PEOPLE: Person[] = [
  { id: 'marcelo', name: 'Marcelo Andrade', role: 'Diretor Executivo', email: 'marcelo@itscs.com.br', ini: 'MA', color: '#0f2f47', active: true, level: 'ceo' },
  { id: 'laerty', name: 'Laerty Souza', role: 'Tech Lead', email: 'laerty@itscs.com.br', ini: 'LS', color: 'var(--brand)', active: true, level: 'gestor' },
  { id: 'elaine', name: 'Elaine Ribeiro', role: 'Desenvolvedora Frontend', email: 'elaine@itscs.com.br', ini: 'ER', color: 'var(--accent)', active: true, level: 'dev' },
  { id: 'julio', name: 'Julio Marques', role: 'Desenvolvedor Backend', email: 'julio@itscs.com.br', ini: 'JM', color: '#0284c7', active: true, level: 'dev' },
  { id: 'camila', name: 'Camila Duarte', role: 'QA e Testes', email: 'camila@itscs.com.br', ini: 'CD', color: '#16a34a', active: true, level: 'dev' },
  { id: 'rafael', name: 'Rafael Pinto', role: 'DevOps', email: 'rafael@itscs.com.br', ini: 'RP', color: '#d97706', active: true, level: 'dev' },
  { id: 'bruna', name: 'Bruna Alves', role: 'Product Designer', email: 'bruna@itscs.com.br', ini: 'BA', color: '#64748b', active: false, level: 'dev' },
];

const CATS: { name: string; color: string; order: number }[] = [
  { name: 'Entrega', color: '#16a34a', order: 1 },
  { name: 'Correção', color: '#dc2626', order: 2 },
  { name: 'Estudo', color: 'var(--brand)', order: 3 },
  { name: 'Descoberta', color: 'var(--accent)', order: 4 },
  { name: 'Refatoração', color: '#64748b', order: 5 },
  { name: 'Reunião', color: '#0284c7', order: 6 },
  { name: 'Documentação', color: '#d97706', order: 7 },
];

const PROJECTS = ['Portal ITS', 'App Licitações', 'API Integrações', 'Data Warehouse', 'Site Institucional'];

// [who, proj, cat, title, desc, dayOffset, time, dur, pri, tags]
const ACTS: [string, string, string, string, string, number, string, string, string, string[]][] = [
  ['elaine', 'Portal ITS', 'Entrega', 'Filtro de período do relatório de processos publicado', 'Range picker com presets (hoje, 7 dias, mês). Query nova reduziu a chamada de 1,8s para 340ms.', 0, '16:40', '3h', 'média', ['relatorios', 'frontend']],
  ['julio', 'API Integrações', 'Correção', 'Corrigido timeout na integração de notas fiscais', 'Retry exponencial + fila morta. O provedor derruba conexões acima de 30s.', 0, '15:05', '2h 10m', 'alta', ['bug', 'fila']],
  ['camila', 'App Licitações', 'Entrega', 'Suite de testes E2E do fluxo de proposta finalizada', '28 cenários no Playwright rodando no pipeline.', 0, '14:20', '4h', 'média', ['qa', 'e2e']],
  ['rafael', 'Data Warehouse', 'Descoberta', 'Job de carga noturna estava rodando duas vezes', 'Dois agendamentos herdados do servidor antigo. Removido o duplicado.', 0, '11:15', '45m', 'alta', ['infra']],
  ['laerty', 'Portal ITS', 'Reunião', 'Alinhamento de escopo do módulo de contratos com o jurídico', 'Definido que a assinatura digital fica para a fase 2.', 0, '09:30', '1h', 'média', ['produto']],
  ['elaine', 'Portal ITS', 'Refatoração', 'Componentes de tabela unificados em um só padrão', 'Sete variações viraram uma. Menos 900 linhas.', 1, '17:20', '5h', 'baixa', ['frontend', 'dx']],
  ['julio', 'API Integrações', 'Documentação', 'Documentado o contrato do endpoint de empenhos', 'Exemplos de request/response e códigos de erro no repositório.', 1, '15:50', '1h 30m', 'baixa', ['docs']],
  ['camila', 'Portal ITS', 'Correção', 'Máscara de CNPJ aceitava caracteres inválidos', '', 1, '13:10', '40m', 'média', ['bug']],
  ['rafael', 'Data Warehouse', 'Entrega', 'Pipeline de backup incremental em produção', 'Retenção de 30 dias, restauração testada em ambiente isolado.', 1, '10:05', '3h 20m', 'alta', ['infra', 'backup']],
  ['laerty', 'App Licitações', 'Estudo', 'Comparativo entre Postgres full-text e Meilisearch', 'Meilisearch ganha em relevância e latência para busca de editais.', 2, '16:00', '2h', 'média', ['pesquisa']],
  ['elaine', 'Site Institucional', 'Entrega', 'Nova página de soluções no ar', '', 2, '14:45', '4h 30m', 'média', ['marketing']],
  ['julio', 'Portal ITS', 'Entrega', 'Exportação de processos em XLSX', 'Geração em worker para não travar a requisição.', 2, '11:30', '3h', 'média', ['export']],
  ['camila', 'App Licitações', 'Descoberta', 'Upload falha em arquivos com acento no nome', 'Encoding do multipart. Reportado para o backend.', 3, '15:20', '1h', 'alta', ['bug', 'upload']],
  ['rafael', 'API Integrações', 'Refatoração', 'Migração dos containers para imagens slim', 'Imagem caiu de 1,2GB para 280MB. Deploy 40% mais rápido.', 3, '10:40', '4h', 'baixa', ['docker']],
  ['laerty', 'Portal ITS', 'Reunião', 'Retrospectiva da sprint 24', 'Principal ponto: falta de registro do que foi feito. Origem deste sistema.', 4, '17:00', '1h 15m', 'média', ['time']],
  ['elaine', 'App Licitações', 'Correção', 'Layout quebrado no drawer de detalhes em 1366px', '', 4, '14:10', '50m', 'baixa', ['css']],
  ['julio', 'Data Warehouse', 'Estudo', 'Particionamento de tabelas por competência', 'Consultas mensais ficam 6x mais rápidas com partição por range.', 5, '16:30', '2h 30m', 'média', ['banco']],
  ['camila', 'Portal ITS', 'Entrega', 'Plano de testes do módulo de contratos', '', 5, '11:00', '3h', 'média', ['qa']],
  ['rafael', 'Site Institucional', 'Entrega', 'CDN e cache de imagens configurados', 'LCP caiu de 3,1s para 1,2s.', 8, '15:40', '2h', 'média', ['performance']],
  ['laerty', 'API Integrações', 'Documentação', 'Diagrama de arquitetura das integrações atualizado', '', 9, '10:20', '1h 40m', 'baixa', ['docs', 'arquitetura']],
  ['elaine', 'Portal ITS', 'Entrega', 'Dashboard de processos com gráfico por status', '', 10, '16:10', '5h', 'alta', ['dashboard']],
  ['julio', 'App Licitações', 'Correção', 'Duplicidade de propostas ao clicar duas vezes em enviar', 'Idempotência por chave de requisição.', 11, '13:35', '2h', 'alta', ['bug']],
  ['bruna', 'Portal ITS', 'Estudo', 'Auditoria de acessibilidade das telas principais', '14 problemas de contraste e foco mapeados.', 12, '14:00', '4h', 'média', ['a11y']],
  ['camila', 'Data Warehouse', 'Entrega', 'Validação dos indicadores do fechamento de junho', '', 13, '09:50', '3h 30m', 'média', ['qa']],
];

// [id, title, desc, proj, assignee, creator, due, pri, cat, done]
const TASKS: [string, string, string, string, string, string, string, string, string, boolean][] = [
  ['t1', 'Publicar filtro de período no relatório gerencial', 'Inclui exportação em CSV com o mesmo recorte.', 'Portal ITS', 'elaine', 'laerty', '2026-08-04', 'alta', 'Entrega', false],
  ['t2', 'Migrar autenticação da API para tokens rotativos', '', 'API Integrações', 'julio', 'laerty', '2026-08-12', 'alta', 'Refatoração', false],
  ['t3', 'Revisar responsividade do checkout de licitações', 'Foco em tablets e telas de 1366px.', 'App Licitações', 'camila', 'laerty', '2026-07-31', 'média', 'Correção', false],
  ['t4', 'Documentar o pipeline de carga noturna', '', 'Data Warehouse', 'rafael', 'marcelo', '2026-07-28', 'média', 'Documentação', false],
  ['t5', 'Trocar imagens da home institucional', '', 'Site Institucional', 'camila', 'laerty', '2026-08-20', 'baixa', 'Entrega', false],
  ['t6', 'Subir monitoramento de fila para produção', '', 'API Integrações', 'elaine', 'laerty', '2026-07-27', 'alta', 'Entrega', true],
];

const GROUPS: { id: string; name: string; desc: string; level: string; perms: string[]; members: string[] }[] = [
  { id: 'g1', name: 'Desenvolvimento', desc: 'Time que registra o dia a dia do produto.', level: 'dev', perms: ['registrar.atividade', 'ver.proprios'], members: ['elaine', 'julio', 'camila', 'rafael'] },
  { id: 'g2', name: 'Liderança técnica', desc: 'Acompanha a equipe e prepara a retrospectiva.', level: 'gestor', perms: ['registrar.atividade', 'ver.equipe', 'relatorio.equipe', 'exportar.dados'], members: ['laerty'] },
  { id: 'g3', name: 'Diretoria', desc: 'Visão executiva de volume, entregas e carteira.', level: 'ceo', perms: ['ver.equipe', 'relatorio.equipe', 'relatorio.executivo', 'exportar.dados'], members: ['marcelo'] },
  { id: 'g4', name: 'Administração', desc: 'Mantém usuários, categorias e integrações.', level: 'gestor', perms: ['ver.equipe', 'gerenciar.usuarios', 'gerenciar.integracoes'], members: ['laerty'] },
];

const INTEGRATIONS: { id: string; name: string; abbr: string; type: string; enabled: boolean; endpoint: string; secret: string; events: string[]; notes: string }[] = [
  { id: 'i1', name: 'WhatsApp do time', abbr: 'WA', type: 'whatsapp', enabled: true, endpoint: '+55 62 99999-0000', secret: '', events: ['mensagem.recebida', 'resumo.diario'], notes: 'Registra atividade mandando "Projeto | Categoria | Título | Duração" para o bot; responde confirmando.' },
  { id: 'i2', name: 'n8n — automações', abbr: 'n8n', type: 'webhook', enabled: true, endpoint: 'https://n8n.itscs.com.br/webhook/diario-dev', secret: 'X-DiarioDev-Secret', events: ['atividade.criada', 'atividade.editada', 'resumo.diario'], notes: 'Dispara o fluxo que cruza registros com o board e alimenta o Power BI.' },
  { id: 'i3', name: 'Slack #dev-diario', abbr: 'SL', type: 'chat', enabled: false, endpoint: 'https://hooks.slack.com/services/T000/B000/xxx', secret: '', events: ['resumo.diario'], notes: 'Publica o resumo do dia às 18h no canal do time.' },
  { id: 'i4', name: 'Digest para gestão', abbr: '@', type: 'email', enabled: true, endpoint: 'gestao@itscs.com.br; diretoria@itscs.com.br', secret: '', events: ['resumo.semanal'], notes: 'E-mail semanal com entregas por projeto, gerado do relatório.' },
];

// [id, integrationName, event, dayOffset, time, ok]
const RUNS: [string, string, string, number, string, boolean][] = [
  ['r1', 'n8n — automações', 'atividade.criada', 0, '16:41', true],
  ['r2', 'WhatsApp do time', 'mensagem.recebida', 0, '15:07', true],
  ['r3', 'n8n — automações', 'resumo.diario', 1, '18:00', true],
  ['r4', 'Digest para gestão', 'resumo.semanal', 3, '08:00', false],
];

const uuid = (block: number, n: number): string =>
  `${block}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseDuration(dur: string): number | null {
  if (!dur || dur === '—') return null;
  let minutes = 0;
  const h = dur.match(/(\d+)\s*h/);
  const m = dur.match(/(\d+)\s*m/);
  if (h?.[1]) minutes += Number(h[1]) * 60;
  if (m?.[1]) minutes += Number(m[1]);
  return minutes || null;
}

// Data civil (hoje menos `days`) no fuso America/Sao_Paulo, formato YYYY-MM-DD.
function civilDateMinus(days: number): string {
  const todaySp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = todaySp.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

// occurredAt como timestamptz: data civil no fuso da org + hora local (SP = UTC-3).
function occurredAt(dayOffset: number, time: string): Date {
  return new Date(`${civilDateMinus(dayOffset)}T${time}:00-03:00`);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed não deve ser executado em produção (§25.1).');
  }

  const passwordHash = await hashPassword(DEV_PASSWORD);

  // Configuração global
  await prisma.appSetting.upsert({
    where: { id: uuid(5, 1) },
    update: {},
    create: {
      id: uuid(5, 1),
      brand: {
        mark: 'ITS',
        markImg: '',
        name: 'Diário Dev',
        sub: 'Registro de atividades',
        brand: '#183c5a',
        accent: '#E85928',
        radius: 10,
        density: 'confortável',
        sidebarStyle: 'sólida',
      },
      appearance: {},
      defaultTheme: 'light',
      defaultDensity: 'confortável',
      organizationTimezone: 'America/Sao_Paulo',
    },
  });

  // Categorias
  const catId = new Map<string, string>();
  for (const c of CATS) {
    const slug = slugify(c.name);
    const row = await prisma.category.upsert({
      where: { slug },
      update: { name: c.name, color: c.color, sortOrder: c.order, active: true },
      create: { name: c.name, slug, color: c.color, sortOrder: c.order, active: true },
    });
    catId.set(c.name, row.id);
  }

  // Usuários + preferências
  const userId = new Map<string, string>();
  for (const p of PEOPLE) {
    const row = await prisma.user.upsert({
      where: { publicKey: p.id },
      update: {
        name: p.name,
        roleTitle: p.role,
        email: p.email.toLowerCase(),
        initials: p.ini,
        color: p.color,
        active: p.active,
        effectiveLevel: LEVEL[p.level] ?? AccessLevel.DEV,
      },
      create: {
        publicKey: p.id,
        name: p.name,
        roleTitle: p.role,
        email: p.email.toLowerCase(),
        passwordHash,
        initials: p.ini,
        color: p.color,
        active: p.active,
        effectiveLevel: LEVEL[p.level] ?? AccessLevel.DEV,
        passwordChangedAt: new Date(),
      },
    });
    userId.set(p.id, row.id);
    await prisma.userPreference.upsert({
      where: { userId: row.id },
      update: {},
      create: { userId: row.id, collapsed: false, density: 'confortável', themePreference: 'light' },
    });
  }

  // Projetos
  const projId = new Map<string, string>();
  for (const name of PROJECTS) {
    const slug = slugify(name);
    const row = await prisma.project.upsert({
      where: { slug },
      update: { name, active: true },
      create: { name, slug, active: true, createdBy: userId.get('laerty') ?? null },
    });
    projId.set(name, row.id);
  }

  // Atividades (idempotente por userId + clientMutationId)
  for (let i = 0; i < ACTS.length; i++) {
    const a = ACTS[i]!;
    const [who, proj, cat, title, desc, day, time, dur, pri, tags] = a;
    const uid = userId.get(who);
    const pid = projId.get(proj);
    if (!uid || !pid) continue;
    const clientMutationId = `seed:a${i}`;
    await prisma.activity.upsert({
      where: { uniq_activity_client_mutation: { userId: uid, clientMutationId } },
      update: {},
      create: {
        userId: uid,
        projectId: pid,
        categoryId: catId.get(cat) ?? null,
        categoryNameSnapshot: cat,
        title,
        description: desc || null,
        occurredAt: occurredAt(day, time),
        durationMinutes: parseDuration(dur),
        priority: PRIORITY[pri] ?? Priority.MEDIA,
        tags,
        clientMutationId,
      },
    });
  }

  // Tarefas
  for (let i = 0; i < TASKS.length; i++) {
    const t = TASKS[i]!;
    const [key, title, desc, proj, assignee, creator, due, pri, cat, done] = t;
    const pid = projId.get(proj);
    const creatorId = userId.get(creator);
    if (!pid || !creatorId) continue;
    const id = uuid(1, i + 1);
    void key;
    await prisma.task.upsert({
      where: { id },
      update: {},
      create: {
        id,
        title,
        description: desc || null,
        projectId: pid,
        assigneeId: userId.get(assignee) ?? null,
        createdBy: creatorId,
        dueDate: new Date(`${due}T12:00:00-03:00`),
        priority: PRIORITY[pri] ?? Priority.MEDIA,
        categoryId: catId.get(cat) ?? null,
        categoryNameSnapshot: cat,
        done,
        completedAt: done ? new Date() : null,
        completedBy: done ? (userId.get(assignee) ?? null) : null,
      },
    });
  }

  // Grupos + membros
  for (let i = 0; i < GROUPS.length; i++) {
    const g = GROUPS[i]!;
    const id = uuid(2, i + 1);
    await prisma.accessGroup.upsert({
      where: { id },
      update: { name: g.name, description: g.desc, level: LEVEL[g.level] ?? AccessLevel.DEV, permissions: g.perms },
      create: { id, name: g.name, description: g.desc, level: LEVEL[g.level] ?? AccessLevel.DEV, permissions: g.perms, active: true },
    });
    for (const member of g.members) {
      const mid = userId.get(member);
      if (!mid) continue;
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: id, userId: mid } },
        update: {},
        create: { groupId: id, userId: mid },
      });
    }
  }

  // Integrações
  const integId = new Map<string, string>();
  for (let i = 0; i < INTEGRATIONS.length; i++) {
    const it = INTEGRATIONS[i]!;
    const id = uuid(3, i + 1);
    await prisma.integration.upsert({
      where: { id },
      update: {
        name: it.name,
        abbreviation: it.abbr,
        type: it.type,
        enabled: it.enabled,
        endpoint: it.endpoint,
        events: it.events,
        notes: it.notes,
      },
      create: {
        id,
        name: it.name,
        abbreviation: it.abbr,
        type: it.type,
        enabled: it.enabled,
        endpoint: it.endpoint,
        encryptedSecret: it.secret ? encryptSecret(it.secret) : null,
        events: it.events,
        notes: it.notes,
        createdBy: userId.get('laerty') ?? null,
      },
    });
    integId.set(it.name, id);
  }

  // Histórico de execuções de integração
  for (let i = 0; i < RUNS.length; i++) {
    const r = RUNS[i]!;
    const [, source, event, day, time, ok] = r;
    const iid = integId.get(source);
    if (!iid) continue;
    const id = uuid(4, i + 1);
    const when = occurredAt(day, time);
    await prisma.integrationRun.upsert({
      where: { id },
      update: {},
      create: {
        id,
        integrationId: iid,
        eventName: event,
        payload: { event },
        attempt: 1,
        status: ok ? 'SUCCESS' : 'FAILED',
        httpStatus: ok ? 200 : 500,
        startedAt: when,
        finishedAt: when,
        durationMs: 120,
        createdAt: when,
      },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    projects: await prisma.project.count(),
    activities: await prisma.activity.count(),
    tasks: await prisma.task.count(),
    groups: await prisma.accessGroup.count(),
    integrations: await prisma.integration.count(),
    integrationRuns: await prisma.integrationRun.count(),
  };
  console.log('Seed concluído:', counts);
  console.log(`Senha de desenvolvimento (todos os usuários): ${DEV_PASSWORD} — TROQUE fora do ambiente local.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Falha no seed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
