FROM python:3.9-slim

# Instala o fork oficial e ativamente mantido do simulador
RUN pip install --no-cache-dir snmpsim-lextudio

# Expõe a porta UDP padrão
EXPOSE 161/udp

# Executa o simulador com o binário correto do fork
CMD ["snmpsim-command-responder", "--data-dir=/data", "--agent-udpv4-endpoint=0.0.0.0:161", "--process-user=root", "--process-group=root"]
