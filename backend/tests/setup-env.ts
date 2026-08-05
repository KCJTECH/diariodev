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

// Desliga o envio de e-mail no ambiente de teste. Sem isto, o .env carregado acima
// entrega um SMTP real aos testes, e as suítes que exercitam redefinição de senha
// disparam mensagens de verdade para os endereços do seed, que são de pessoas reais.
// Vazio vale como ausente na validação de ambiente, então o mailer fica desabilitado.
process.env.SMTP_HOST = '';

// Conta usada pelos testes como "e-mail cadastrado que ninguém lê", para exercitar o
// desvio do link de redefinição para os gestores. Precisa ser um endereço do seed que
// nenhum outro teste use como titular.
process.env.PASSWORD_RESET_VIA_GESTOR = 'camila@itscs.com.br';
