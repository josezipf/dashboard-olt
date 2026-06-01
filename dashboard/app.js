/* -------------------------------------------------------------
   NOC DASHBOARD OLT - LOGICA DO SISTEMA & API ZABBIX 7.0
   ------------------------------------------------------------- */

// =============================================================
// CONFIGURAÇÃO DO ZABBIX (Preencher após implantação)
// =============================================================
const ZABBIX_URL = "http://localhost:8081/api_jsonrpc.php";    // Ex: "http://192.168.10.10/zabbix/api_jsonrpc.php"
const ZABBIX_TOKEN = "96aadc90bd2ca6b08f6fd09efbb4294309560193a67cbd5b883a2b419b469f3e";  // Token gerado no Zabbix 7.0 (Administração -> Tokens de API)
let HOST_ID = "";         // Deixe vazio para buscar o host "OLT-Simulada-Lab" automaticamente
const HOST_NAME_TARGET = "OLT LAB";

// =============================================================
// ESTADO GLOBAL DO DASHBOARD
// =============================================================
let simulationMode = true; // Inicializa no modo simulado se a URL/Token não forem fornecidos
let updateIntervalId = null;
let trafficChart = null;
const CHART_HISTORY_LIMIT = 20;

// Histórico de Tráfego PON 1
const trafficHistory = {
    labels: [],
    inbound: [],
    outbound: []
};

// Dados Atuais das ONUs
let onusList = [];
let currentFilter = 'all';
let searchQuery = '';
let onusCurrentPage = 1;
const ONUS_ITEMS_PER_PAGE = 6;

// =============================================================
// INICIALIZAÇÃO DO DASHBOARD
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    // Inicializar relógio
    startClock();

    // Configurar modo de execução inicial
    if (ZABBIX_URL && ZABBIX_TOKEN) {
        simulationMode = false;
        console.log("Configurações do Zabbix detectadas. Tentando conexão...");
    } else {
        simulationMode = true;
        console.warn("ZABBIX_URL ou ZABBIX_TOKEN não configurados. Iniciando em MODO SIMULADO.");
    }

    // Inicializar o Gráfico de Tráfego (Chart.js)
    initChart();

    // Adicionar escutas de eventos nos elementos da interface
    setupEventListeners();

    // Primeira carga e início do loop
    refreshDashboard();
    updateIntervalId = setInterval(refreshDashboard, 10000); // Atualização a cada 10 segundos
});

// =============================================================
// RELÓGIO E AUXILIARES
// =============================================================
function startClock() {
    const clockElement = document.getElementById("live-clock");
    const updateClock = () => {
        const now = new Date();
        clockElement.textContent = now.toLocaleTimeString('pt-BR');
    };
    updateClock();
    setInterval(updateClock, 1000);
}

// Retorna string de hora atual para o gráfico (HH:MM:SS)
function getFormattedTime() {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
}

// =============================================================
// CONTROLE DE EVENTOS E INTERAÇÃO
// =============================================================
function setupEventListeners() {
    const btnToggleDemo = document.getElementById("btn-toggle-demo");
    const searchInput = document.getElementById("search-onu");
    const filterPills = document.querySelectorAll(".filter-pills .pill");
    const btnRetry = document.getElementById("btn-banner-retry");
    const btnBannerDemo = document.getElementById("btn-banner-demo");

    // Alternar Modo de Simulação manual
    btnToggleDemo.addEventListener("click", () => {
        setSimulationMode(!simulationMode);
    });

    // Barra de Pesquisa de ONUs
    searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase();
        onusCurrentPage = 1;
        renderOnuTable();
    });

    // Filtros de Status (All, Online, Offline, Warning)
    filterPills.forEach(pill => {
        pill.addEventListener("click", () => {
            filterPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            currentFilter = pill.getAttribute("data-filter");
            onusCurrentPage = 1;
            renderOnuTable();
        });
    });

    // Ações do Banner de Conexão com Falha
    btnRetry.addEventListener("click", () => {
        document.getElementById("api-disconnect-banner").style.display = "none";
        simulationMode = false;
        refreshDashboard();
    });

    btnBannerDemo.addEventListener("click", () => {
        document.getElementById("api-disconnect-banner").style.display = "none";
        setSimulationMode(true);
    });
}

function setSimulationMode(active) {
    simulationMode = active;
    const btnDemo = document.getElementById("btn-toggle-demo");

    if (simulationMode) {
        btnDemo.classList.add("active");
        btnDemo.querySelector("span").textContent = "SIMULADOR ATIVO";
        console.log("Modo Simulação ATIVADO.");
        // Resetar histórico do gráfico para a simulação fluir limpa
        trafficHistory.labels = [];
        trafficHistory.inbound = [];
        trafficHistory.outbound = [];
        trafficChart.data.labels = [];
        trafficChart.data.datasets[0].data = [];
        trafficChart.data.datasets[1].data = [];
        trafficChart.update();
    } else {
        btnDemo.classList.remove("active");
        btnDemo.querySelector("span").textContent = "MODO DEMO";
        console.log("Modo Simulação DESATIVADO. Conectando com Zabbix...");
    }

    refreshDashboard();
}

// =============================================================
// REQUISITOR ZABBIX JSON-RPC API
// =============================================================
/**
 * Realiza chamadas genéricas para a API JSON-RPC do Zabbix
 * @param {string} method Método RPC (Ex: 'host.get', 'item.get')
 * @param {object} params Parâmetros exigidos pelo método
 * @returns {Promise<any>} Dados resultantes da consulta
 */
async function zabbixApiCall(method, params) {
    if (!ZABBIX_URL) {
        throw new Error("A URL da API do Zabbix está vazia.");
    }

    const payload = {
        jsonrpc: "2.0",
        method: method,
        params: params,
        id: Date.now()
    };

    // Zabbix 7.0 suporta autenticação via token no corpo "auth" para legados,
    // mas a boa prática atual é passar via Header Authorization. Enviamos ambos para compatibilidade total.
    if (ZABBIX_TOKEN) {
        payload.auth = ZABBIX_TOKEN;
    }

    const headers = {
        "Content-Type": "application/json-rpc"
    };

    if (ZABBIX_TOKEN) {
        headers["Authorization"] = `Bearer ${ZABBIX_TOKEN}`;
    }

    const response = await fetch(ZABBIX_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Erro HTTP no Servidor! Status: ${response.status}`);
    }

    const jsonResult = await response.json();
    if (jsonResult.error) {
        throw new Error(`Erro Zabbix API: ${jsonResult.error.message} - ${jsonResult.error.data || ''}`);
    }

    return jsonResult.result;
}

// =============================================================
// PROCESSO DE CARGA E ATUALIZAÇÃO
// =============================================================
async function refreshDashboard() {
    const apiPill = document.getElementById("api-status-pill");
    const apiText = document.getElementById("api-status-text");
    const banner = document.getElementById("api-disconnect-banner");

    if (simulationMode) {
        // Atualiza usando o motor de simulação
        apiPill.className = "status-pill simulating glass-effect";
        apiText.textContent = "SIMULADOR NOC";
        banner.style.display = "none";

        runLocalSimulation();
        updateLastRefreshTime();
        return;
    }

    try {
        // Inicializar Host caso o ID ainda não tenha sido recuperado
        if (!HOST_ID) {
            apiText.textContent = "BUSCANDO HOST...";
            const hosts = await zabbixApiCall("host.get", {
                filter: { host: [HOST_NAME_TARGET] },
                output: ["hostid", "name", "status"]
            });

            if (hosts && hosts.length > 0) {
                HOST_ID = hosts[0].hostid;
                console.log(`Host ${HOST_NAME_TARGET} localizado com ID: ${HOST_ID}`);
            } else {
                throw new Error(`Host '${HOST_NAME_TARGET}' não localizado no Zabbix.`);
            }
        }

        // Buscar todos os itens associados ao host
        apiText.textContent = "CARREGANDO DADOS...";
        const items = await zabbixApiCall("item.get", {
            hostids: HOST_ID,
            output: ["itemid", "name", "key_", "lastvalue", "units", "status"],
            filter: { status: "0" } // Apenas itens ativos
        });

        // Processar os dados recebidos da API do Zabbix
        processZabbixData(items);

        // Atualizar visual da conexão
        apiPill.className = "status-pill connected glass-effect";
        apiText.textContent = "ZABBIX ONLINE";
        banner.style.display = "none";
        updateLastRefreshTime();

    } catch (error) {
        console.error("Falha ao comunicar com API do Zabbix:", error);

        // Exibir banner de erro
        apiPill.className = "status-pill disconnected glass-effect";
        apiText.textContent = "API DESCONECTADA";
        banner.style.display = "flex";

        // OLT status para desconectado
        document.getElementById("olt-host-name").textContent = HOST_NAME_TARGET;
        document.getElementById("olt-status-badge").className = "status-indicator offline";
    }
}

function updateLastRefreshTime() {
    const timeSpan = document.getElementById("last-update-time");
    const now = new Date();
    timeSpan.textContent = `Último refresh: ${now.toLocaleTimeString('pt-BR')}`;
}

// =============================================================
// PROCESSAMENTO DOS DADOS DO ZABBIX
// =============================================================
function processZabbixData(items) {
    // 1. Identificar as informações gerais da OLT
    document.getElementById("olt-host-name").textContent = HOST_NAME_TARGET;
    document.getElementById("olt-status-badge").className = "status-indicator online";

    const cpuItem = items.find(i => i.key_ === 'olt.hw.cpu');
    const tempItem = items.find(i => i.key_ === 'olt.hw.temperature');
    
    // Filtros de memória robustos (suportando mem.total, memory.total, ram.total, OIDs, etc.)
    const memTotalItem = items.find(i => 
        i.key_ === 'olt.hw.mem.total' || 
        i.key_ === 'olt.hw.memory.total' || 
        i.key_.includes('mem.total') || 
        i.key_.includes('memory.total') || 
        i.key_.includes('ram.total') || 
        i.key_.includes('oltMemoryTotal') ||
        i.key_.includes('1.3.6.1.4.1.99999.1.3.1')
    );
    const memUsedItem = items.find(i => 
        i.key_ === 'olt.hw.mem.used' || 
        i.key_ === 'olt.hw.memory.used' || 
        i.key_.includes('mem.used') || 
        i.key_.includes('memory.used') || 
        i.key_.includes('ram.used') || 
        i.key_.includes('oltMemoryUsed') ||
        i.key_.includes('1.3.6.1.4.1.99999.1.3.2')
    );

    const inTrafficItem = items.find(i => i.key_ === 'net.if.in[2]');
    const outTrafficItem = items.find(i => i.key_ === 'net.if.out[2]');

    // Atualizar KPI de CPU
    if (cpuItem) {
        const cpuVal = Math.round(parseFloat(cpuItem.lastvalue));
        updateCpuGauge(cpuVal);
    }

    // Atualizar KPI de Temperatura
    if (tempItem) {
        const tempVal = parseFloat(tempItem.lastvalue);
        updateTemperature(tempVal);
    }

    // Atualizar KPI de Memória
    if (memTotalItem && memUsedItem) {
        let totalVal = parseFloat(memTotalItem.lastvalue);
        let usedVal = parseFloat(memUsedItem.lastvalue);

        // Detecção automática de escala (Bytes, KB ou MB)
        if (totalVal > 100000000) {
            // Valor em Bytes (ex: 8.5 GB = 8,589,934,592 B)
            totalVal = totalVal / (1024 * 1024);
            usedVal = usedVal / (1024 * 1024);
        } else if (totalVal > 10000) {
            // Valor em Kilobytes (ex: 8 GB = 8,388,608 KB)
            totalVal = totalVal / 1024;
            usedVal = usedVal / 1024;
        }
        // Caso contrário, já está em Megabytes (MB)

        updateMemory(usedVal, totalVal);
    } else {
        updateMemory(0, 0);
    }

    // Atualizar Gráfico de Tráfego (CONVERTENDO BPS PARA MBPS)
    const currentInMbps = inTrafficItem ? (parseFloat(inTrafficItem.lastvalue) / 1000000) : 0;
    const currentOutMbps = outTrafficItem ? (parseFloat(outTrafficItem.lastvalue) / 1000000) : 0;
    updateTrafficChart(currentInMbps, currentOutMbps);

    // 2. Extrair e alinhar as ONUs usando o Index
    const onusMap = {};
    const regexStatus = /^onu\.status\[(.*)\]$/;
    const regexRx = /^onu\.rx\[(.*)\]$/;

    items.forEach(item => {
        let matchStatus = item.key_.match(regexStatus);
        if (matchStatus) {
            const index = matchStatus[1];
            if (!onusMap[index]) {
                onusMap[index] = { index: index, name: '', status: null, rx: null };
            }
            onusMap[index].status = parseInt(item.lastvalue);
            // Limpa o nome do item para gerar um nome de cliente amigável
            const clientName = item.name.replace(/Status da ONU:?|Status do Cliente:?|Status/gi, '').trim();
            onusMap[index].name = clientName || `ONU #${index}`;
        }

        let matchRx = item.key_.match(regexRx);
        if (matchRx) {
            const index = matchRx[1];
            if (!onusMap[index]) {
                onusMap[index] = { index: index, name: '', status: null, rx: null };
            }
            onusMap[index].rx = parseFloat(item.lastvalue);
            if (!onusMap[index].name) {
                const clientName = item.name.replace(/Sinal RX da ONU:?|Sinal RX do Cliente:?|Sinal RX/gi, '').trim();
                onusMap[index].name = clientName || `ONU #${index}`;
            }
        }
    });

    onusList = Object.values(onusMap);

    // Atualizar KPIs de resumo das ONUs
    updateOnusKPIs();

    // Renderizar tabela de clientes
    renderOnuTable();
}

// =============================================================
// GERAÇÃO DE DADOS DE SIMULAÇÃO (DEMO MODE)
// =============================================================
// Lista base fixa para manter persistência dos dados simulados entre refreshes
const simulatedOnus = [
    { index: "1", name: "ONU-01 [Roberto Carlos]", status: 1, rx: -22.3 },
    { index: "2", name: "ONU-02 [Juliana Paes]", status: 1, rx: -19.5 },
    { index: "3", name: "ONU-03 [Luiz Inácio]", status: 1, rx: -28.1 }, // Warning
    { index: "4", name: "ONU-04 [Marisa Monte]", status: 2, rx: -33.4 }, // Offline / LOS
    { index: "5", name: "ONU-05 [Cláudia Leitte]", status: 1, rx: -24.8 },
    { index: "6", name: "ONU-06 [Anitta Show]", status: 1, rx: -29.2 }, // Warning
    { index: "7", name: "ONU-07 [Thiaguinho OLT]", status: 1, rx: -21.0 },
    { index: "8", name: "ONU-08 [Empresa Link-Forte]", status: 2, rx: -99.9 }, // Offline / LOS
    { index: "9", name: "ONU-09 [Fernanda Montenegro]", status: 1, rx: -23.4 },
    { index: "10", name: "ONU-10 [Selton Mello]", status: 1, rx: -25.2 }
];

let simulatedBaseCpu = 35;
let simulatedBaseTemp = 48.6;
let simulatedBaseMemUsed = 4200;
let simulatedTrafficIn = 520.4;
let simulatedTrafficOut = 75.2;

function runLocalSimulation() {
    document.getElementById("olt-host-name").textContent = "OLT-Simulada-Lab (Simulador)";
    document.getElementById("olt-status-badge").className = "status-indicator online";

    // Simular CPU
    simulatedBaseCpu += (Math.random() - 0.5) * 6;
    if (simulatedBaseCpu < 15) simulatedBaseCpu = 18;
    if (simulatedBaseCpu > 95) simulatedBaseCpu = 85;
    const cpuVal = Math.round(simulatedBaseCpu);
    updateCpuGauge(cpuVal);

    // Simular Temperatura
    simulatedBaseTemp += (Math.random() - 0.5) * 0.8;
    if (simulatedBaseTemp < 38) simulatedBaseTemp = 41;
    if (simulatedBaseTemp > 75) simulatedBaseTemp = 68;
    updateTemperature(parseFloat(simulatedBaseTemp.toFixed(1)));

    // Simular Memória
    simulatedBaseMemUsed += (Math.random() - 0.5) * 100;
    if (simulatedBaseMemUsed < 2000) simulatedBaseMemUsed = 2200;
    if (simulatedBaseMemUsed > 8000) simulatedBaseMemUsed = 7500;
    updateMemory(simulatedBaseMemUsed, 8192);

    // Simular Tráfego PON 1
    simulatedTrafficIn += (Math.random() - 0.5) * 45;
    if (simulatedTrafficIn < 150) simulatedTrafficIn = 280;
    if (simulatedTrafficIn > 900) simulatedTrafficIn = 750;

    simulatedTrafficOut += (Math.random() - 0.5) * 8;
    if (simulatedTrafficOut < 20) simulatedTrafficOut = 45;
    if (simulatedTrafficOut > 180) simulatedTrafficOut = 110;

    updateTrafficChart(simulatedTrafficIn, simulatedTrafficOut);

    // Simular Flutuações de Sinal das ONUs
    simulatedOnus.forEach(onu => {
        if (onu.status === 1) {
            // Pequenas flutuações no sinal óptico
            onu.rx += (Math.random() - 0.5) * 0.4;
            onu.rx = parseFloat(onu.rx.toFixed(1));

            // Chance minúscula de cair para offline temporariamente
            if (Math.random() > 0.985) {
                onu.status = 2;
                onu.rx = -99.9;
            }
        } else {
            // Chance de voltar a ficar online
            if (Math.random() > 0.94) {
                onu.status = 1;
                onu.rx = parseFloat((-20 - Math.random() * 11).toFixed(1));
            }
        }
    });

    onusList = [...simulatedOnus];

    // Atualizar KPIs
    updateOnusKPIs();

    // Renderizar tabela
    renderOnuTable();
}

// =============================================================
// COMPONENTES DE INTERFACE - ATUALIZAÇÕES
// =============================================================

// Atualiza o medidor semicircular de CPU (Gauge SVG)
function updateCpuGauge(percentage) {
    const valText = document.getElementById("olt-cpu-val");
    const gaugeBar = document.getElementById("cpu-gauge-bar");

    valText.textContent = `${percentage}%`;

    // A circunferência do semicírculo de raio 40 é 125.6
    const strokeLength = 125.6;
    const offset = strokeLength - (percentage / 100) * strokeLength;
    gaugeBar.style.strokeDashoffset = offset;

    // Alerta se CPU > 80%
    if (percentage > 80) {
        gaugeBar.classList.add("alert");
        valText.className = "value font-mono text-red blink-fast";
    } else {
        gaugeBar.classList.remove("alert");
        valText.className = "value font-mono";
    }
}

// Atualiza a exibição da temperatura do chassi
function updateTemperature(tempVal) {
    const tempText = document.getElementById("olt-temp-val");
    const tempStatus = document.getElementById("olt-temp-status");

    tempText.textContent = `${Math.round(tempVal)} °C`;

    if (tempVal > 68) {
        tempText.className = "digital-glow text-temp font-mono hot";
        tempStatus.textContent = "SOBREAQUECIMENTO CRÍTICO";
        tempStatus.style.color = "var(--color-red)";
    } else if (tempVal > 55) {
        tempText.className = "digital-glow text-temp font-mono";
        tempText.style.color = "var(--color-yellow)";
        tempStatus.textContent = "Alerta: Temperatura elevada";
        tempStatus.style.color = "var(--color-yellow)";
    } else {
        tempText.className = "digital-glow text-temp font-mono";
        tempText.style.color = "var(--color-temp)";
        tempStatus.textContent = "Status térmico nominal";
        tempStatus.style.color = "#64748b";
    }
}

// Atualiza a exibição do consumo de memória da OLT
function updateMemory(usedMB, totalMB) {
    const memPercentSpan = document.getElementById("olt-mem-percent");
    const memBytesSpan = document.getElementById("olt-mem-bytes");
    const memBar = document.getElementById("olt-mem-bar");

    if (!memPercentSpan || !memBytesSpan || !memBar) return;

    if (totalMB <= 0) {
        memPercentSpan.textContent = "0%";
        memBytesSpan.textContent = "0 / 0 MB";
        memBar.style.width = "0%";
        return;
    }

    const percentage = Math.round((usedMB / totalMB) * 100);
    memPercentSpan.textContent = `${percentage}%`;
    memBytesSpan.textContent = `${Math.round(usedMB)} / ${Math.round(totalMB)} MB`;
    memBar.style.width = `${percentage}%`;

    // Alerta se uso de memória > 85%
    if (percentage > 85) {
        memBar.style.background = "linear-gradient(90deg, #ef4444, #dc2626)";
        memBar.style.boxShadow = "0 0 10px rgba(239, 68, 68, 0.5)";
        memPercentSpan.className = "digital-glow text-red font-mono blink-fast";
    } else if (percentage > 70) {
        memBar.style.background = "linear-gradient(90deg, #f97316, #ea580c)";
        memBar.style.boxShadow = "0 0 10px rgba(249, 115, 22, 0.5)";
        memPercentSpan.className = "digital-glow text-orange font-mono";
    } else {
        memBar.style.background = "linear-gradient(90deg, #a855f7, #c084fc)";
        memBar.style.boxShadow = "0 0 10px rgba(168, 85, 247, 0.5)";
        memPercentSpan.className = "digital-glow text-purple font-mono";
    }
}

// Atualiza os cartões de resumo (KPIs) das ONUs
function updateOnusKPIs() {
    const total = onusList.length;
    const online = onusList.filter(o => o.status === 1).length;
    const offline = onusList.filter(o => o.status === 2).length;
    // Warning: Online mas sinal abaixo de -28dBm
    const lowSignal = onusList.filter(o => o.status === 1 && o.rx < -28.0).length;

    // Atualiza textos
    document.getElementById("onu-total-count").textContent = total;
    document.getElementById("onu-online-count").textContent = online;
    document.getElementById("onu-offline-count").textContent = offline;

    const lowSignalElement = document.getElementById("onu-low-signal-count");
    lowSignalElement.textContent = lowSignal;

    if (lowSignal > 0) {
        lowSignalElement.className = "metric-highlight font-mono text-yellow critical";
        document.getElementById("rx-alerts-status").textContent = `${lowSignal} ONU(s) com atenuação óptica severa`;
        document.getElementById("rx-alerts-status").style.color = "var(--color-yellow)";
    } else {
        lowSignalElement.className = "metric-highlight font-mono text-yellow";
        document.getElementById("rx-alerts-status").textContent = "Sem atenuações críticas registradas";
        document.getElementById("rx-alerts-status").style.color = "#64748b";
    }

    const pctOnline = total > 0 ? Math.round((online / total) * 100) : 0;
    document.getElementById("onu-percent-online").textContent = `${pctOnline}% da infraestrutura online`;
}

// =============================================================
// DESENHO E ATUALIZAÇÃO DO GRÁFICO (CHART.JS)
// =============================================================
function initChart() {
    const ctx = document.getElementById('trafficChart').getContext('2d');

    // Gradientes de cor para o preenchimento
    const gradientIn = ctx.createLinearGradient(0, 0, 0, 400);
    gradientIn.addColorStop(0, 'rgba(0, 255, 153, 0.25)');
    gradientIn.addColorStop(1, 'rgba(0, 255, 153, 0.0)');

    const gradientOut = ctx.createLinearGradient(0, 0, 0, 400);
    gradientOut.addColorStop(0, 'rgba(0, 229, 255, 0.15)');
    gradientOut.addColorStop(1, 'rgba(0, 229, 255, 0.0)');

    trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trafficHistory.labels,
            datasets: [
                {
                    label: 'Traffic In (Download)',
                    data: trafficHistory.inbound,
                    borderColor: '#00ff99',
                    backgroundColor: gradientIn,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#00ff99',
                    pointBorderColor: '#ffffff',
                    shadowColor: 'rgba(0, 255, 153, 0.5)',
                    shadowBlur: 10
                },
                {
                    label: 'Traffic Out (Upload)',
                    data: trafficHistory.outbound,
                    borderColor: '#00e5ff',
                    backgroundColor: gradientOut,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#00e5ff',
                    pointBorderColor: '#ffffff'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Ocultado pois temos a legenda customizada no HTML
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(10, 15, 30, 0.85)',
                    titleColor: '#38bdf8',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 10,
                    bodyFont: {
                        family: 'Inter'
                    },
                    titleFont: {
                        family: 'Chakra Petch',
                        weight: 'bold'
                    },
                    callbacks: {
                        label: function (context) {
                            return ` ${context.dataset.label}: ${context.raw.toFixed(2)} Mbps`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            family: 'Chakra Petch',
                            size: 10
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            family: 'Chakra Petch',
                            size: 10
                        },
                        callback: function (value) {
                            return Number(value).toFixed(2) + ' Mbps';
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function updateTrafficChart(inboundMbps, outboundMbps) {
    const timeLabel = getFormattedTime();

    // Adiciona novos dados
    trafficHistory.labels.push(timeLabel);
    trafficHistory.inbound.push(inboundMbps);
    trafficHistory.outbound.push(outboundMbps);

    // Mantém o tamanho da janela do gráfico
    if (trafficHistory.labels.length > CHART_HISTORY_LIMIT) {
        trafficHistory.labels.shift();
        trafficHistory.inbound.shift();
        trafficHistory.outbound.shift();
    }

    // Atualiza exibição de textos no HTML
    document.getElementById("traffic-in-current").textContent = `${inboundMbps.toFixed(2)} Mbps`;
    document.getElementById("traffic-out-current").textContent = `${outboundMbps.toFixed(2)} Mbps`;

    // Atualiza o Chart
    if (trafficChart) {
        trafficChart.update();
    }
}

// =============================================================
// RENDERIZAÇÃO DA TABELA DINÂMICA DE ONUs
// =============================================================
function renderOnuTable() {
    const tbody = document.getElementById("onu-table-body");
    const paginationContainer = document.getElementById("onu-pagination");
    tbody.innerHTML = "";
    paginationContainer.innerHTML = "";

    // Filtrar a lista com base na query de busca e pílulas de filtro
    const filteredOnus = onusList.filter(onu => {
        // Busca textual (pesquisa no ID da key ou no Nome do Cliente)
        const matchSearch = onu.index.toLowerCase().includes(searchQuery) ||
            onu.name.toLowerCase().includes(searchQuery);

        if (!matchSearch) return false;

        // Filtro por pílula
        if (currentFilter === 'online') {
            return onu.status === 1;
        } else if (currentFilter === 'offline') {
            return onu.status === 2;
        } else if (currentFilter === 'warning') {
            // Sinal Ruim: Online mas sinal pior (menor) que -28dBm
            return onu.status === 1 && onu.rx < -28.0;
        }

        return true; // default: 'all'
    });

    if (filteredOnus.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: #64748b; padding: 30px;">
                    Nenhum cliente atende aos filtros atuais.
                </td>
            </tr>
        `;
        return;
    }

    // Paginação: Fatiar a lista filtrada
    const totalItems = filteredOnus.length;
    const totalPages = Math.ceil(totalItems / ONUS_ITEMS_PER_PAGE);

    // Ajustar a página atual se estiver fora dos limites
    if (onusCurrentPage > totalPages) {
        onusCurrentPage = totalPages;
    }
    if (onusCurrentPage < 1) {
        onusCurrentPage = 1;
    }

    const startIndex = (onusCurrentPage - 1) * ONUS_ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ONUS_ITEMS_PER_PAGE, totalItems);
    const paginatedOnus = filteredOnus.slice(startIndex, endIndex);

    // Renderizar linhas da tabela (apenas da página ativa)
    paginatedOnus.forEach(onu => {
        const tr = document.createElement("tr");

        // Coluna 1: ID / Index
        const tdId = document.createElement("td");
        tdId.className = "font-mono";
        tdId.style.fontWeight = "600";
        tdId.style.color = "var(--color-cyan)";
        tdId.textContent = `#${onu.index}`;

        // Coluna 2: Identificação do cliente
        const tdName = document.createElement("td");
        tdName.textContent = onu.name;

        // Coluna 3: Sinal RX (dBm) com classes CSS dinâmicas baseadas nos níveis do sinal
        const tdRx = document.createElement("td");
        tdRx.className = "font-mono";
        if (onu.status === 2) {
            tdRx.textContent = "---";
            tdRx.style.color = "#64748b";
        } else {
            tdRx.textContent = `${onu.rx.toFixed(1)} dBm`;
            if (onu.rx < -30.0) {
                tdRx.className += " rx-critical";
            } else if (onu.rx < -28.0) {
                tdRx.className += " rx-warning";
            } else {
                tdRx.className += " rx-normal";
            }
        }

        // Coluna 4: Status do cliente (Online/Offline) com tags animadas
        const tdStatus = document.createElement("td");
        const statusBadge = document.createElement("span");
        if (onu.status === 1) {
            statusBadge.className = "table-badge online";
            statusBadge.innerHTML = `<span class="dot"></span>ONLINE`;
        } else {
            statusBadge.className = "table-badge offline";
            statusBadge.innerHTML = `<span class="dot"></span>LOS / FALHA`;
        }
        tdStatus.appendChild(statusBadge);

        // Anexar colunas
        tr.appendChild(tdId);
        tr.appendChild(tdName);
        tr.appendChild(tdRx);
        tr.appendChild(tdStatus);

        tbody.appendChild(tr);
    });

    // Renderizar Controles de Paginação
    if (totalItems > 0) {
        // Texto Informativo
        const infoDiv = document.createElement("div");
        infoDiv.className = "pagination-info";
        infoDiv.textContent = `Exibindo ${startIndex + 1}-${endIndex} de ${totalItems} ONUs`;
        paginationContainer.appendChild(infoDiv);

        // Apenas criar botões se houver mais de uma página
        if (totalPages > 1) {
            const buttonsDiv = document.createElement("div");
            buttonsDiv.className = "pagination-buttons";

            // Botão Anterior
            const prevBtn = document.createElement("button");
            prevBtn.className = "pagination-btn";
            prevBtn.innerHTML = "&laquo; Ant";
            prevBtn.disabled = onusCurrentPage === 1;
            prevBtn.addEventListener("click", () => {
                onusCurrentPage--;
                renderOnuTable();
            });
            buttonsDiv.appendChild(prevBtn);

            // Botões de Páginas Individuais
            for (let i = 1; i <= totalPages; i++) {
                const pageBtn = document.createElement("button");
                pageBtn.className = `pagination-btn ${onusCurrentPage === i ? 'active' : ''}`;
                pageBtn.textContent = i;
                pageBtn.addEventListener("click", () => {
                    onusCurrentPage = i;
                    renderOnuTable();
                });
                buttonsDiv.appendChild(pageBtn);
            }

            // Botão Próximo
            const nextBtn = document.createElement("button");
            nextBtn.className = "pagination-btn";
            nextBtn.innerHTML = "Próx &raquo;";
            nextBtn.disabled = onusCurrentPage === totalPages;
            nextBtn.addEventListener("click", () => {
                onusCurrentPage++;
                renderOnuTable();
            });
            buttonsDiv.appendChild(nextBtn);

            paginationContainer.appendChild(buttonsDiv);
        }
    }
}
