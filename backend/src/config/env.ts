// Carga e validação das variáveis de ambiente.
// Falha rápido no boot se algo essencial estiver ausente ou inválido.
import { z } from 'zod';

// Node 20.6+/24: carrega o .env sem dependência externa. Ignorado se ausente
// (em produção as variáveis vêm do ambiente do container).
try {
  process.loadEnvFile();
} catch {
  // sem arquivo .env — segue com o ambiente do processo
}

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  APP_ORIGIN: z.string().url(),

  // Marca os cookies de sessão como Secure. Por padrão segue NODE_ENV=production.
  // Em rede interna sem HTTPS, defina COOKIE_SECURE=false, senão o navegador
  // descarta o cookie e o login não persiste.
  COOKIE_SECURE: bool.optional(),
  // Cookie de sessão sem Secure em produção precisa ser declarado. Serve para
  // que rodar sem HTTPS seja escolha registrada, e não padrão silencioso.
  ALLOW_INSECURE_COOKIES: bool.default('false'),

  // Proxies confiáveis para derivar o IP do cliente. Vazio = não confia em
  // X-Forwarded-For. Confiar sem restrição deixa o próprio cliente escolher o
  // IP que o servidor registra, o que fura o rate limit por IP e envenena o
  // ipHash de auditoria e sessões. Aceita lista de IP ou CIDR separada por vírgula.
  TRUST_PROXY: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((p) => p.trim()).filter(Boolean)),

  // Bloqueio de força bruta no login, contado por conta e não só por IP.
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  COOKIE_SECRET: z.string().min(16),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(1),

  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(1_209_600),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_PATH: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: bool.default('true'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // TLS na conexão. Use true para porta 465; em 587 o padrão é STARTTLS (false).
  SMTP_SECURE: bool.default('false'),
  // Remetente dos e-mails do sistema. Se ausente, cai para SMTP_USER.
  MAIL_FROM: z.string().optional(),
  // Validade do link de redefinição de senha, em minutos.
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  // Contas cujo e-mail cadastrado não é uma caixa que alguém lê (conta de sistema,
  // por exemplo). Para elas o link de redefinição vai para os gestores, que repassam
  // ao responsável. Lista de e-mails separada por vírgula; vazio = nenhuma.
  // Precisa ser declarado: o servidor SMTP aceita a mensagem mesmo para caixa que
  // não atende, então não há como o sistema descobrir isso sozinho no envio.
  PASSWORD_RESET_VIA_GESTOR: z
    .string()
    .default('')
    .transform((s) => new Set(s.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))),

  // Senha inicial de usuários criados pela tela de administração (que não tem
  // campo de senha). Se vazio, o sistema gera uma senha aleatória, que só é
  // devolvida na resposta da API. Defina para que o admin saiba a senha inicial
  // e oriente a troca no primeiro acesso.
  INITIAL_USER_PASSWORD: z.string().min(8).optional(),
  ORGANIZATION_TIMEZONE: z.string().default('America/Sao_Paulo'),
  // Diretório do frontend estático a servir. Se ausente, usa a pasta acima do cwd
  // (em dev, backend/.. = raiz do projeto). Em container, aponte para o caminho copiado.
  FRONTEND_DIR: z.string().optional(),
  ALLOW_DEV_LOGIN: bool.default('false'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
  MAX_ATTACHMENTS_PER_ACTIVITY: z.coerce.number().int().positive().default(10),
  DAILY_SUMMARY_TIME: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default('18:30'),

  // Hosts internos liberados para webhook apesar de resolverem para IP privado
  // (allowlist SSRF, §21.3). Lista separada por vírgula. Vazio = nenhum.
  WEBHOOK_ALLOWED_HOSTS: z
    .string()
    .default('')
    .transform((s) => new Set(s.split(',').map((h) => h.trim()).filter(Boolean))),
});

// Variável presente mas vazia (`CHAVE=` no .env) vale como ausente. Sem isso o
// `.default()` e o `.optional()` não se aplicam, a string vazia chega à validação
// e o boot falha, ou passa adiante como '' e quebra o fallback de quem a lê.
const provided = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
);

const parsed = schema.safeParse(provided);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Não imprime valores, apenas os nomes das variáveis com problema.
  throw new Error(`Configuração de ambiente inválida:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';

// Falha no boot em vez de servir cookie de sessão sem Secure em produção por
// descuido. Quem precisa rodar em HTTP puro declara ALLOW_INSECURE_COOKIES=true.
if (isProduction && env.COOKIE_SECURE === false && !env.ALLOW_INSECURE_COOKIES) {
  throw new Error(
    'COOKIE_SECURE=false em produção exige ALLOW_INSECURE_COOKIES=true. ' +
      'Sem HTTPS o cookie de sessão trafega em claro: declare a exceção ou use HTTPS.',
  );
}
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';
