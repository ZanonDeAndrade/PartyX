-- Reverte 0004_limites_globais. A tabela só guarda contadores de limite (sem dado pessoal); apagá-la zera os limites e nada mais.
DROP TABLE "global_limit_counters";
