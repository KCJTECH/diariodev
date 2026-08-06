// Regras relacionais de autorização: quem pode agir sobre quem, e quem pode
// conceder qual nível. Ficam aqui, e não no módulo de usuários, porque grupos
// precisam da mesma regra e não devem depender de outro módulo.
//
// O invariante, em uma frase: nenhuma operação concede nível acima do nível do
// ator, nem altera nível efetivo, cadastro ou credencial de alguém de nível
// maior ou igual ao do ator. A própria conta é exceção no cadastro, nunca na
// credencial.
//
// Duas regras existem, e a diferença entre elas é deliberada:
//
//   Concessão de nível usa "até o próprio nível". Um gestor cria outro gestor,
//   um CEO cria outro CEO. Se fosse estritamente menor, ninguém nunca criaria
//   um CEO, e perder a conta administrativa viraria incidente manual em
//   produção. Movimento lateral não é escalonamento: criar um par não retira
//   acesso de ninguém, e fica registrado em audit_log.
//
//   Credencial usa "estritamente menor" e proíbe a própria conta. Trocar a
//   própria senha é POST /auth/password, que exige a senha atual: sem isso uma
//   sessão sequestrada trocaria a senha sem conhecer a antiga e trancaria o
//   dono do lado de fora. E permitir agir sobre um par deixaria dois gestores
//   se personificarem entre si.
import type { AccessLevel } from '@prisma/client';
import { Errors } from '../errors/app-error.js';
import { LEVEL_TO_API, rankOf, type ApiLevel, type AuthUser } from './types.js';

// Alvo mínimo de qualquer regra relacional: identidade e nível persistido.
export type LevelTarget = { id: string; effectiveLevel: AccessLevel };

export function apiLevelOf(target: LevelTarget): ApiLevel {
  return LEVEL_TO_API[target.effectiveLevel];
}

function withinCeiling(actor: AuthUser, level: ApiLevel): boolean {
  return rankOf(level) <= rankOf(actor.level);
}

// Teto de concessão: usado no nível do usuário e no nível do grupo.
export function assertCanGrantLevel(actor: AuthUser, requested: ApiLevel): void {
  if (!withinCeiling(actor, requested)) {
    throw Errors.forbidden('Seu nível de acesso não permite conceder esse nível.');
  }
}

// Teto de administração de objeto que carrega nível: não se administra um grupo
// cujo nível é acima do próprio, nem para renomear.
export function assertCanAdministerLevel(actor: AuthUser, objectLevel: ApiLevel): void {
  if (!withinCeiling(actor, objectLevel)) {
    throw Errors.forbidden('Seu nível de acesso não permite administrar esse grupo.');
  }
}

// Alvo pessoa em cadastro, ativação e exclusão. Teto, não "estritamente menor",
// e a própria conta é sempre permitida.
//
// O teto aqui é obrigatório pelo mesmo motivo do teto de concessão: com a regra
// estrita, uma conta CEO não poderia ser desativada por ninguém, nem por outro
// CEO, e removê-la viraria operação manual no banco. Administrar um par é
// movimento lateral, fica em audit_log e é reversível.
//
// O que continua fechado: gestor não toca em CEO, porque rank 3 não cabe no teto
// de rank 2. E administrar um par não é o mesmo que assumir a identidade dele:
// para isso existe a regra de credencial abaixo, que é estrita.
export function assertCanManageUser(actor: AuthUser, target: LevelTarget): void {
  if (target.id === actor.id) return;
  if (!withinCeiling(actor, apiLevelOf(target))) {
    throw Errors.forbidden('Seu nível de acesso não permite administrar esse colaborador.');
  }
}

// Alvo pessoa em credencial. Nunca a própria conta.
export function assertCanManageCredentials(actor: AuthUser, target: LevelTarget): void {
  if (target.id === actor.id) {
    throw Errors.forbidden('Para trocar a própria senha use a opção da sua conta, que pede a senha atual.');
  }
  if (rankOf(actor.level) <= rankOf(apiLevelOf(target))) {
    throw Errors.forbidden('Seu nível de acesso não permite mexer na senha desse colaborador.');
  }
}

// Guarda coletivo do recálculo por grupo: todo mundo que entra ou sai precisa
// ser administrável pelo ator. Vale a mesma regra de teto, e por um motivo
// próprio: o nível de um membro pode vir do próprio grupo que está sendo
// editado. Com a regra estrita, incluir alguém em grupo de nível ceo seria
// permitido, porque no momento da inclusão a pessoa ainda é dev, e remover
// seria proibido, porque ela já virou par do ator.
//
// O escalonamento continua fechado pelo teto do grupo: quem não pode administrar
// grupo de nível superior não eleva ninguém por esse caminho.
export function assertCanAffectLevels(actor: AuthUser, targets: LevelTarget[]): void {
  for (const target of targets) assertCanManageUser(actor, target);
}
