// Ініціалізація графіка
const ctx = document.getElementById('tempChart').getContext('2d');
let tempData = Array(20).fill(180);
const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: Array(20).fill(''),
        datasets: [{
            label: 'Температура °C',
            data: tempData,
            borderColor: '#00ff41',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            backgroundColor: 'rgba(0, 255, 65, 0.1)',
            tension: 0.4
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { min: 0, max: 260, grid: { color: '#113311' } },
            x: { display: false }
        },
        plugins: { legend: { display: false } }
    }
});
// Ініціалізація графіка
const ctx2 = document.getElementById('powerChart').getContext('2d');
let pwrData = Array(20).fill(20);
const pwrChart = new Chart(ctx2, {
    type: 'line',
    data: {
        labels: Array(20).fill(''),
        datasets: [{
            label: 'Споживання А',
            data: pwrData,
            borderColor: '#00ff41',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            backgroundColor: 'rgba(0, 255, 65, 0.1)',
            tension: 0.4
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { min: 0, max: 40, grid: { color: '#113311' } },
            x: { display: false }
        },
        plugins: { legend: { display: false } }
    }
});

// Елементи DOM
const statusText = document.getElementById('status-text');
const terminal = document.getElementById('terminal');
const outputSlider = document.getElementById('smoke-output');
const outputVal = document.getElementById('output-val');
const timerSlider = document.getElementById('smoke-timer');
const timerVal = document.getElementById('timer-val');

// Додавання записів у термінал
function addLog(message) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `> [${new Date().toLocaleTimeString()}] ${message}`;
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

function updateSliderFill(slider) {
    const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.setProperty('--value', pct + '%');
}

// Оновлення повзунків
outputSlider.oninput = function() {
    outputVal.textContent = this.value;
    updateSliderFill(this);
};
outputSlider.onchange = function() {
    addLog(`Температура встановлена на ${this.value}%`);
};

timerSlider.oninput = function() {
    timerVal.textContent = this.value;
    updateSliderFill(this);
};
timerSlider.onchange = function() {
    addLog(`Паливо встановлено на ${this.value}%`);
};

// Init slider fill
[outputSlider, timerSlider].forEach(updateSliderFill);

/* ─── Tab switching ─── */
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('tab-active'));
        tabContents.forEach(c => c.classList.remove('tab-active'));
        btn.classList.add('tab-active');
        document.getElementById(targetTab).classList.add('tab-active');
    });
});

/* ─── WebSocket Relay (ESP32 → Server ← Dashboard) ─── */
const BOARD_NAMES = { b1: 'ДВИГУН', b2: 'СИЛА', b3: 'ЗБРОЯ', b4: 'СЕНС' };

const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
let ws = null;
let wsRetryDelay = 1000;

function setBoardConn(id, online) {
    const dot = document.getElementById('conn-' + id);
    if (dot) dot.className = online ? 'conn-online' : 'conn-offline';
}

function handleTelemetry(id, d) {
    console.log(`[TELEMETRY] ${id}:`, d);
    if (id === 'b1' && d.temp !== undefined) {
        const t = Number(d.temp);
        tempData.push(t); tempData.shift();
        chart.update('none');
        document.getElementById('current-temp').textContent = `${Math.round(t)}°C`;
    }
    if (id === 'b2') {
        if (d.charge   !== undefined) document.getElementById('current-charge').textContent   = `${Math.round(d.charge)}%`;
        if (d.voltage  !== undefined) document.getElementById('current-voltage').textContent  = `${Number(d.voltage).toFixed(1)} В`;
        if (d.power    !== undefined) {
            const p = Number(d.power);
            pwrData.push(p); pwrData.shift();
            pwrChart.update('none');
            document.getElementById('current-power').textContent = `${p.toFixed(1)} А`;
        }
    }
}

function connectRelay() {
    if (ws) return;
    try { ws = new WebSocket(wsUrl); }
    catch (e) { addLog('Помилка створення WebSocket'); scheduleReconnect(); return; }

    ws.onopen = () => {
        wsRetryDelay = 1000;
        addLog('ПІДКЛЮЧЕНО ДО СЕРВЕРА');
    };

    ws.onmessage = ev => {
        let msg;
        try { msg = JSON.parse(ev.data); }
        catch (e) { return; }
        if (msg.type === 'board') {
            setBoardConn(msg.id, msg.online);
            const name = BOARD_NAMES[msg.id] || msg.id;
            if (msg.online) {
                addLog(`ПЛАТА ${name} ПІДКЛЮЧЕНА`);
            } else {
                addLog(`ПЛАТА ${name} ВІДКЛЮЧЕНА`);
            }
        } else if (msg.type === 'telemetry') {
            handleTelemetry(msg.board, msg.data);
        } else if (msg.type === 'emergency') {
            const name = BOARD_NAMES[msg.board] || msg.board;
            addLog(`АВАРІЙНА ЗУПИНКА ${name}: ${msg.reason}`);
            statusText.textContent = 'АВАРІЯ';
            statusText.className = 'status-heating';
            document.querySelectorAll('.btn-active').forEach(b => b.classList.remove('btn-active'));
        } else if (msg.type === 'error') {
            addLog(`ERR: ${msg.text}`);
        }
    };

    ws.onclose = () => {
        ws = null;
        addLog('ВІДКЛЮЧЕНО ВІД СЕРВЕРА');
        Object.keys(BOARD_NAMES).forEach(id => setBoardConn(id, false));
        scheduleReconnect();
    };

    ws.onerror = () => {};
}

function scheduleReconnect() {
    setTimeout(connectRelay, wsRetryDelay);
    wsRetryDelay = Math.min(wsRetryDelay * 2, 8000);
}

function relaySend(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

/* ─── Симуляція (фолбек) — вимкнено, використовується реальна телеметрія ─── */
// setInterval(() => {
//     const variation = (Math.random() - 0.5) * 4;
//     const newTemp = Math.round(tempData[tempData.length - 1] + variation);
//     tempData.push(newTemp); tempData.shift();
//     chart.update('none');
//     pwrChart.update('none');
//     document.getElementById('current-temp').textContent = `${newTemp}°C`;
// }, 1000);

/* ─── Кнопки ─── */
// Toggling buttons (btn-primary only)
const TOGGLE_BTN_MAP = {
    'btn-start':   { target: 'b1', cmd: 'start' },
    'btn-axe':     { target: 'b3', cmd: 'axe' },
    'btn-sensors': { target: 'b4', cmd: 'sensors' },
};

// One-time command buttons (btn-warning, btn-danger)
const CMD_BTN_MAP = {
    'btn-pump':    { target: 'b1', cmd: 'pump' },
    'btn-eye':     { target: 'b4', cmd: 'eye' },
};

// Toggle button handlers
Object.entries(TOGGLE_BTN_MAP).forEach(([id, cfg]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
        const isActive = btn.classList.toggle('btn-active');
        addLog(`${btn.textContent} ${isActive ? 'УВІМКНЕНО' : 'ВИМКНЕНО'}`);
        relaySend({ target: cfg.target, cmd: cfg.cmd, state: isActive });
        if (isActive) {
            statusText.textContent = 'РОБОТА';
            statusText.className = 'status-working';
        } else if (!document.querySelector('.btn-active')) {
            statusText.textContent = 'ГОТОВА';
            statusText.className = 'status-ready';
        }
    });
});

// One-time command button handlers (no state change)
Object.entries(CMD_BTN_MAP).forEach(([id, cfg]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
        addLog(`Команда "${btn.textContent}" надіслана`);
        relaySend({ target: cfg.target, cmd: cfg.cmd });
    });
});

// Stop button (emergency stop - no toggle, clears all toggles)
document.getElementById('btn-stop').onclick = () => {
    document.querySelectorAll('.btn-active').forEach(b => b.classList.remove('btn-active'));
    statusText.textContent = 'СТОП (АВАРІЙНО)';
    statusText.className = 'status-heating';
    relaySend({ cmd: 'stop' });
    addLog('АВАРІЙНА ЗУПИНКА! СИГНАЛ НАДІСЛАНО ВСІМ ПЛАТАМ');
};

connectRelay();