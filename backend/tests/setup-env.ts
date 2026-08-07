// Aponta os testes para o banco de teste dedicado (diariodev_test) antes de
// qualquer módulo ser importado. Deriva a URL da conexão real sem imprimir a senha.
process.loadEnvFile();
const base = process.env.DATABASE_URL;
if (base) {
  const u = new URL(base);
  u.pathname = '/diariodev_test';
  u.searchParams.set('schema', 'public');
  process.env.DATABASE_URL = u.toString();
}
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

// Desliga o envio de e-mail nos testes. O servidor de e-mail agora é configurado
// no banco (app_settings.mail), então apagar variável de SMTP não desliga mais
// nada: sem isto, uma configuração válida no banco de teste faria as suítes de
// redefinição de senha disparar mensagem real para os endereços do seed, que são
// de pessoas do time. Suítes que precisam observar o envio mockam o mailer.
process.env.MAIL_ENABLED = 'false';
