// Texto do e-mail de redefinição de senha. Fica em app_settings.mail.resetBody,
// editável pela tela, para que quem administra ajuste a mensagem sem depender de
// alteração no código. Quando não há texto salvo, vale o padrão abaixo.
//
// Marcadores substituídos no envio: {USUARIO}, {LINK} e {MINUTOS}.
// {LINK} é obrigatório: sem ele a pessoa recebe uma mensagem sem o endereço para
// redefinir, e o pedido morre sem ninguém perceber. A validação está no serviço
// de settings, não aqui, para recusar já na hora de salvar.

export const RESET_BODY_PLACEHOLDERS = ['{USUARIO}', '{LINK}', '{MINUTOS}'] as const;

export const RESET_BODY_DEFAULT = [
  'Olá, {USUARIO}.',
  '',
  'Recebemos um pedido para redefinir a senha da sua conta no Diário Dev.',
  'Abra o endereço abaixo para cadastrar uma nova senha. O link vale {MINUTOS} minutos e só pode ser usado uma vez.',
  '',
  '{LINK}',
  '',
  'Se não foi você que pediu, ignore esta mensagem. Sua senha atual continua válida.',
  '',
  'Diário Dev ITS',
].join('\n');

export function renderResetBody(
  template: string | null | undefined,
  vars: { usuario: string; link: string; minutos: number },
): string {
  const base = template && template.trim() ? template : RESET_BODY_DEFAULT;
  return base
    .split('{USUARIO}')
    .join(vars.usuario)
    .split('{MINUTOS}')
    .join(String(vars.minutos))
    .split('{LINK}')
    .join(vars.link);
}
