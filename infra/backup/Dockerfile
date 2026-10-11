# Job de backup diário: pg_dump do Neon para o bucket privado. Imagem separada da aplicação (precisa do cliente do PostgreSQL).
# O cliente tem de ser da MESMA versão principal do servidor ou maior (Neon de homologação: 18.6).
FROM postgres:18-alpine
RUN apk add --no-cache curl jq coreutils ca-certificates openssl
# A URL do Neon pede verificação do certificado (sslmode=verify-full): usa as raízes de confiança do sistema.
ENV PGSSLROOTCERT=system
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
