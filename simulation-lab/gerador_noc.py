import os
import time
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARQUIVO_SNMP = os.path.join(BASE_DIR, "snmp-data", "lab-olt.snmprec")

# Contadores de Tráfego (Iniciam num valor base e só vão subir)
in_uplink = 158945620
in_pon1 = 8542100
out_uplink = 189456200
out_pon1 = 12542100

print("🔥 Iniciando Gerador de Caos do NOC (Versão 15 ONUs)... (Ctrl+C para parar)")

while True:
    # 1. Flutuação de Desempenho
    cpu = random.randint(20, 85) # Varia até 85% para disparar a Trigger
    temp = random.randint(38, 48)
    mem_used = random.randint(2000 * 1024, 7000 * 1024) # De 2000MB a 7000MB convertidos para KB
    
    # 2. Incremento Contínuo de Tráfego (Simulando download/upload constante)
    in_uplink += random.randint(5000000, 20000000)
    out_uplink += random.randint(5000000, 20000000)
    in_pon1 += random.randint(1000000, 5000000)
    out_pon1 += random.randint(1000000, 5000000)
    
    # 3. Flutuação Dinâmica do Sinal Óptico (As 15 ONUs)
    # Sinais normais (Verdes no Dashboard) oscilando levemente:
    sinal_1 = random.randint(-230, -220)
    sinal_2 = random.randint(-195, -185)
    sinal_3 = random.randint(-190, -180)
    sinal_5 = random.randint(-245, -235)
    sinal_6 = random.randint(-220, -210)
    sinal_8 = random.randint(-255, -245)
    sinal_9 = random.randint(-185, -175)
    sinal_10 = random.randint(-240, -230)
    sinal_12 = random.randint(-265, -255)
    sinal_13 = random.randint(-215, -205)
    sinal_15 = random.randint(-225, -215)
    
    # Sinais Críticos (Amarelo/Laranja no Dashboard) oscilando no limite:
    sinal_7 = random.randint(-300, -290)   # Supermercado Preco Bom (Warning)
    sinal_14 = random.randint(-315, -310)  # Farmacia Central (Crítico)
    
    # Sinais Rompidos / LOS (Vermelho vivo no Dashboard):
    sinal_4 = -400   # Pedro Costa
    sinal_11 = -400  # Restaurante Sabor
    
    # 4. Falha Aleatória removida. PON 2 fixada como ativa (UP) para consistência didática.
    status_pon2 = 1

    # Status fixos/independentes das ONUs
    # PON 1 ONUs:
    status_1 = status_2 = status_3 = status_5 = status_6 = status_7 = status_8 = 1
    status_4 = 2 # Pedro Costa: Offline
    
    # PON 2 ONUs:
    status_9 = status_10 = status_12 = status_13 = status_14 = status_15 = 1
    status_11 = 2 # Restaurante Sabor: Offline

    # Sinais das ONUs da PON 2 (independentes)
    sinal_9_val = sinal_9
    sinal_10_val = sinal_10
    sinal_11_val = -400
    sinal_12_val = sinal_12
    sinal_13_val = sinal_13
    sinal_14_val = sinal_14
    sinal_15_val = sinal_15

    # Quantidade de ONUs ativas nas PONs
    active_pon1 = 7 # 8 total, 1 offline
    active_pon2 = 6 # 7 total, 1 offline

    # --- MONTAGEM DO ARQUIVO ---
    conteudo = f"""# --- DADOS GERAIS DO EQUIPAMENTO ---
1.3.6.1.2.1.1.1.0|4|OLT Simulada - Lab Curso
1.3.6.1.2.1.1.3.0|67|123456789
1.3.6.1.2.1.1.5.0|4|olt-core-isp

# --- INTERFACES PADRAO (Counter32) ---
1.3.6.1.2.1.2.2.1.2.1|4|Uplink-10G
1.3.6.1.2.1.2.2.1.2.2|4|PON-Port-01
1.3.6.1.2.1.2.2.1.2.3|4|PON-Port-02

1.3.6.1.2.1.2.2.1.8.1|2|1
1.3.6.1.2.1.2.2.1.8.2|2|1
1.3.6.1.2.1.2.2.1.8.3|2|{status_pon2}

1.3.6.1.2.1.2.2.1.10.1|65|{in_uplink}
1.3.6.1.2.1.2.2.1.10.2|65|{in_pon1}
1.3.6.1.2.1.2.2.1.10.3|65|0

1.3.6.1.2.1.2.2.1.16.1|65|{out_uplink}
1.3.6.1.2.1.2.2.1.16.2|65|{out_pon1}
1.3.6.1.2.1.2.2.1.16.3|65|0

# --- INTERFACES DE ALTA CAPACIDADE (Counter64) ---
1.3.6.1.2.1.31.1.1.1.6.1|70|{in_uplink}
1.3.6.1.2.1.31.1.1.1.6.2|70|{in_pon1}
1.3.6.1.2.1.31.1.1.1.6.3|70|0

1.3.6.1.2.1.31.1.1.1.10.1|70|{out_uplink}
1.3.6.1.2.1.31.1.1.1.10.2|70|{out_pon1}
1.3.6.1.2.1.31.1.1.1.10.3|70|0

# --- METRICAS DE HARDWARE ---
1.3.6.1.4.1.99999.1.1.0|2|{temp}
1.3.6.1.4.1.99999.1.2.0|2|{cpu}
1.3.6.1.4.1.99999.1.3.1.0|2|8388608
1.3.6.1.4.1.99999.1.3.2.0|2|{mem_used}

# --- METRICAS GERAIS DE PON ---
1.3.6.1.4.1.99999.2.1.1.0|66|{active_pon1}
1.3.6.1.4.1.99999.2.1.2.0|66|{active_pon2}

# --- TABELA DE ONUs (LLD) ---
1.3.6.1.4.1.99999.3.1.1.1|2|1
1.3.6.1.4.1.99999.3.1.1.2|2|2
1.3.6.1.4.1.99999.3.1.1.3|2|3
1.3.6.1.4.1.99999.3.1.1.4|2|4
1.3.6.1.4.1.99999.3.1.1.5|2|5
1.3.6.1.4.1.99999.3.1.1.6|2|6
1.3.6.1.4.1.99999.3.1.1.7|2|7
1.3.6.1.4.1.99999.3.1.1.8|2|8
1.3.6.1.4.1.99999.3.1.1.9|2|9
1.3.6.1.4.1.99999.3.1.1.10|2|10
1.3.6.1.4.1.99999.3.1.1.11|2|11
1.3.6.1.4.1.99999.3.1.1.12|2|12
1.3.6.1.4.1.99999.3.1.1.13|2|13
1.3.6.1.4.1.99999.3.1.1.14|2|14
1.3.6.1.4.1.99999.3.1.1.15|2|15

1.3.6.1.4.1.99999.3.1.2.1|4|Joao Silva - Plano 500M
1.3.6.1.4.1.99999.3.1.2.2|4|Maria Souza - Plano 1G
1.3.6.1.4.1.99999.3.1.2.3|4|Empresa XYZ - Link Dedicado
1.3.6.1.4.1.99999.3.1.2.4|4|Pedro Costa - Plano 300M
1.3.6.1.4.1.99999.3.1.2.5|4|Ana Paula - Plano 500M
1.3.6.1.4.1.99999.3.1.2.6|4|Lucas Almeida - Plano 1G
1.3.6.1.4.1.99999.3.1.2.7|4|Supermercado Preco Bom - IP Fixo
1.3.6.1.4.1.99999.3.1.2.8|4|Carlos Eduardo - Plano 300M
1.3.6.1.4.1.99999.3.1.2.9|4|Clinica Sorriso - Link Dedicado
1.3.6.1.4.1.99999.3.1.2.10|4|Fernanda Lima - Plano 500M
1.3.6.1.4.1.99999.3.1.2.11|4|Restaurante Sabor - Plano 1G
1.3.6.1.4.1.99999.3.1.2.12|4|Roberto Alves - Plano 300M
1.3.6.1.4.1.99999.3.1.2.13|4|Juliana Santos - Plano 500M
1.3.6.1.4.1.99999.3.1.2.14|4|Farmacia Central - Link Dedicado
1.3.6.1.4.1.99999.3.1.2.15|4|Marcos Vinicius - Plano 300M

1.3.6.1.4.1.99999.3.1.3.1|2|{status_1}
1.3.6.1.4.1.99999.3.1.3.2|2|{status_2}
1.3.6.1.4.1.99999.3.1.3.3|2|{status_3}
1.3.6.1.4.1.99999.3.1.3.4|2|{status_4}
1.3.6.1.4.1.99999.3.1.3.5|2|{status_5}
1.3.6.1.4.1.99999.3.1.3.6|2|{status_6}
1.3.6.1.4.1.99999.3.1.3.7|2|{status_7}
1.3.6.1.4.1.99999.3.1.3.8|2|{status_8}
1.3.6.1.4.1.99999.3.1.3.9|2|{status_9}
1.3.6.1.4.1.99999.3.1.3.10|2|{status_10}
1.3.6.1.4.1.99999.3.1.3.11|2|{status_11}
1.3.6.1.4.1.99999.3.1.3.12|2|{status_12}
1.3.6.1.4.1.99999.3.1.3.13|2|{status_13}
1.3.6.1.4.1.99999.3.1.3.14|2|{status_14}
1.3.6.1.4.1.99999.3.1.3.15|2|{status_15}

1.3.6.1.4.1.99999.3.1.4.1|2|{sinal_1}
1.3.6.1.4.1.99999.3.1.4.2|2|{sinal_2}
1.3.6.1.4.1.99999.3.1.4.3|2|{sinal_3}
1.3.6.1.4.1.99999.3.1.4.4|2|{sinal_4}
1.3.6.1.4.1.99999.3.1.4.5|2|{sinal_5}
1.3.6.1.4.1.99999.3.1.4.6|2|{sinal_6}
1.3.6.1.4.1.99999.3.1.4.7|2|{sinal_7}
1.3.6.1.4.1.99999.3.1.4.8|2|{sinal_8}
1.3.6.1.4.1.99999.3.1.4.9|2|{sinal_9_val}
1.3.6.1.4.1.99999.3.1.4.10|2|{sinal_10_val}
1.3.6.1.4.1.99999.3.1.4.11|2|{sinal_11_val}
1.3.6.1.4.1.99999.3.1.4.12|2|{sinal_12_val}
1.3.6.1.4.1.99999.3.1.4.13|2|{sinal_13_val}
1.3.6.1.4.1.99999.3.1.4.14|2|{sinal_14_val}
1.3.6.1.4.1.99999.3.1.4.15|2|{sinal_15_val}
"""

    # Sobrescreve o arquivo
    with open(ARQUIVO_SNMP, "w") as f:
        f.write(conteudo)
    
    print(f"Atualizado! CPU: {cpu}% | Trafego In: {in_uplink} | Sinal Farmácia: {sinal_14}")
    time.sleep(10) # Atualiza a cada 10 segundos
