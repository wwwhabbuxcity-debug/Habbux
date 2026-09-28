# Observabilidade

Nenhuma plataforma adicional roda neste bootstrap. Logs estruturados Java e
smoke de lifecycle são os sinais implementados. Vhost usa arquivos próprios
`tyvo.online.access.log`/`tyvo.online.error.log`; configuração padrão de rotação
do Nginx deve abranger esses nomes.

Sinais e cardinalidade planejados em `docs/architecture/OBSERVABILITY.md`.
Futuros healthchecks distinguirão processo vivo de pronto para receber carga;
readiness não consultará PostgreSQL em cada requisição. Monitorar atraso de
loop/fila, rejeições de sobrecarga, memória/GC, pool DB e tempo de eventos. Nada
de IDs de usuário/sessão como labels de métricas. Profiling JFR apenas com janela,
limite de disco e impacto medido. Dados sensíveis não entram em traces.
