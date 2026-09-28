# Publicação estática do bootstrap

O deploy atual entrega somente web em `/` e bootstrap do client em `/client/`.
Não há processo Java, gameplay, API, conexão PostgreSQL/Redis nem systemd novo.
O diretório público é `.deploy/current`, jamais a raiz do Git; fontes, registro,
segredos, node_modules e histórico não ficam acessíveis.

Após builds e checks completos, avisar a responsável antes de tornar alterações
visíveis e executar `./infrastructure/deployment/publish-static.sh`. O script
copia dist para uma nova release e troca um symlink atomicamente; preserva
releases anteriores e não reinicia nada. Não executa remoções automáticas.
Rollback: inspecionar o destino anterior em `.deploy/releases/`, criar um
symlink temporário e usar `mv -Tf` para trocar `.deploy/current`. Não apontar para
caminhos externos ou fontes.

Vhost específico: `infrastructure/nginx/tyvo.online.conf`. O arquivo HTTP de
bootstrap é apenas para primeira emissão ACME. Instalação é manual: salvar cópia
do vhost Tyvo antes de substituir, testar `nginx -t`, então recarregar. Não
alterar outros vhosts nem configuração global. Avisar antes de toda publicação.

Certificado: Certbot webroot `.deploy/acme`, domínio `tyvo.online`, timer do
sistema. Hook `renew-tyvo-certificate.sh` valida e recarrega Nginx somente após
renovação desta lineage. Não versionar certificados, chaves ou contas ACME.

O domínio com www depende do DNS/roteamento externo e de certificado que o
inclua; não presumir suporte a HTTPS www só por ter um bloco HTTP. A origem deve
ficar em modo TLS válido no proxy. Testar origem e endereço público, HTML,
assets e tentativa de acesso a arquivos privados. Não publicar o Vite dev server.
