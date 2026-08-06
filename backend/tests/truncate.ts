// Limpa todas as tabelas do banco de teste (usa a DATABASE_URL do ambiente,
// já apontada para diariodev_test). Roda entre migrate e seed no reset.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(
  `TRUNCATE TABLE
     attachments, activities, tasks, group_members, access_groups,
     integration_runs, integrations, audit_logs, outbox_events,
     sessions, user_preferences, users,
     categories, projects, app_settings
   RESTART IDENTITY CASCADE`,
);
console.log('truncate ok');
await prisma.$disconnect();
