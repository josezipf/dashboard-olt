# Lab de Simulação SNMP de OLT & Dashboard NOC SPA

Este repositório contém um laboratório completo de simulação SNMP de uma OLT (Equipamento de Provedor de Internet/Fibra) integrado a um dashboard de monitoramento em tempo real (NOC Screen) voltado para TVs e centrais de operações de rede.

O projeto é ideal para fins didáticos, demonstrações operacionais e treinamento de equipes de infraestrutura de telecomunicações.

---

## 📂 Estrutura Recomendada do Repositório

Para subir este projeto de forma unificada no GitHub, sugerimos organizar os arquivos na seguinte estrutura:

```text
├── dashboard/               # Frontend SPA (Single Page Application)
│   ├── index.html           # Layout semântico com Glassmorphism
│   ├── style.css            # Estilização completa e responsividade
│   └── app.js               # Lógica em Vanilla JS, Gráficos e API Zabbix
│
├── simulation-lab/          # Simulador SNMP em Docker
│   ├── Dockerfile           # Imagem para o snmpsim-lextudio
│   ├── docker-compose.yml   # Orquestração do container do simulador
│   ├── LAB-CURSO-OLT-MIB.txt# Arquivo de MIB para consulta dos objetos SNMP
│   ├── gerador_noc.py       # Script de geração de telemetria dinâmica (caos)
│   └── snmp-data/           # Banco de dados SNMP (.snmprec)
│       └── lab-olt.snmprec  # Arquivo contendo as OIDs e valores simulados
│
├── .gitignore               # Arquivos a ignorar no Git
└── README.md                # Esta documentação
```

---

## ⚡ 1. O Laboratório de Simulação SNMP

O simulador roda um container Docker baseado no `snmpsim-lextudio`, que responde a requisições SNMP na comunidade `lab-olt` (porta UDP `161`).

Para simular dados vivos (oscilações de tráfego, sinais ópticos, temperatura e falhas aleatórias), o script Python `gerador_noc.py` roda em background, reescrevendo o arquivo `.snmprec` a cada 10 segundos.

### Como Executar o Simulador:
1. Navegue até a pasta `simulation-lab/`.
2. Inicie o container Docker:
   ```bash
   docker-compose up -d
   ```
3. Inicie o script gerador de telemetria em background:
   ```bash
   nohup python3 gerador_noc.py > /dev/null 2>&1 &
   ```

---

## 🔌 2. Integração com o Zabbix

O Dashboard coleta os dados dinamicamente conectando-se diretamente à API JSON-RPC do Zabbix (compatível com Zabbix 7.0 e anteriores).

### OIDs de Telemetria Geradas no Simulador:

| Métrica | OID SNMP | Tipo | Unidade | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| **Temperatura do Chassi** | `1.3.6.1.4.1.99999.1.1.0` | `Integer32` (2) | °C | Temperatura interna da OLT |
| **Uso de CPU** | `1.3.6.1.4.1.99999.1.2.0` | `Integer32` (2) | % | Porcentagem de uso da CPU |
| **Memória Total** | `1.3.6.1.4.1.99999.1.3.1.0` | `Integer32` (2) | KB | Capacidade total de RAM da OLT |
| **Memória Usada** | `1.3.6.1.4.1.99999.1.3.2.0` | `Integer32` (2) | KB | RAM consumida no momento |
| **Tráfego Entrada (Uplink)** | `1.3.6.1.2.1.31.1.1.1.6.1` | `Counter64` (70) | Octetos | Contador de tráfego de alta capacidade |
| **Tráfego Saída (Uplink)** | `1.3.6.1.2.1.31.1.1.1.10.1` | `Counter64` (70) | Octetos | Contador de tráfego de alta capacidade |
| **Status da ONU** | `1.3.6.1.4.1.99999.3.1.3.x` | `Integer32` (2) | Codificado | `1` = Online, `2` = Offline (LOS) |
| **Sinal Óptico RX da ONU**| `1.3.6.1.4.1.99999.3.1.4.x` | `Integer32` (2) | dBm | Multiplicado por `0.1` no coletor (ex: `-223` = `-22.3` dBm) |

### Recomendações de Configuração no Zabbix:
* **Item de Memória**: Configure no Zabbix um multiplicador personalizado de `1024` com unidade `B` (Bytes) no item correspondente. O Dashboard possui **auto-detecção de escala** inteligente e fará o cálculo correto de conversão para Megabytes (MB) no painel.
* **Sinal RX da ONU**: Aplique um fator multiplicador de `0.1` no Zabbix para obter a atenuação óptica em dBm de forma precisa (ex: `-220` vira `-22.0` dBm).
* **Interface de Rede**: Utilize a OID da `ifXTable` (`1.3.6.1.2.1.31.1.1.1.6.x` / `1.3.6.1.2.1.31.1.1.1.10.x`) para suportar contadores de `Counter64` de alta performance, prevenindo estouro de tráfego em portas Gigabit e 10Gbps.

---

## 📺 3. O Dashboard NOC OLT

Uma página única (SPA) esteticamente desenhada para monitores de NOC. Conta com o estilo moderno de *Glassmorphism* (cartões translúcidos e fundo escuro), tipografia otimizada e animações de alerta (pulsação em vermelho para falhas e perda de sinal).

### Funcionalidades:
* **Grid de KPIs**: Monitoramento instantâneo de CPU, Memória, Temperatura, Resumo de Clientes (Online/Offline) e Alertas de Sinal Ruim ($< -28\text{ dBm}$).
* **Gráficos em Tempo Real**: Histórico de tráfego de entrada e saída (Download/Upload) do Uplink com escala em duas casas decimais.
* **Tabela de ONUs**: Listagem detalhada de clientes com sinal RX real-time, status funcional e paginação de `6` itens por tela (alinhamento simétrico perfeito com o gráfico de rede).
* **Modo Demo (Simulação Local)**: Caso não queira ou não possa conectar a um servidor Zabbix de imediato, clique no botão **MODO DEMO** no cabeçalho. Ele iniciará um motor javascript local que simula flutuações e alertas de forma totalmente independente e realista!

### Como Rodar:
Basta abrir o arquivo `dashboard/index.html` diretamente em qualquer navegador de sua preferência!
