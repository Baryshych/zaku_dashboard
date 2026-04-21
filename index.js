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
            y: { min: 140, max: 260, grid: { color: '#113311' } },
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

// Симуляція температури
setInterval(() => {
    const variation = (Math.random() - 0.5) * 4;
    const newTemp = Math.round(tempData[tempData.length - 1] + variation);
    tempData.push(newTemp);
    tempData.shift();
    chart.update('none');
    pwrChart.update('none');
    document.getElementById('current-temp').textContent = `${newTemp}°C`;
}, 1000);

// Кнопки
const toggleButtons = ['btn-axe', 'btn-sensors', 'btn-start'];

toggleButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
        const isActive = btn.classList.toggle('btn-active');
        const label = btn.textContent;
        addLog(`${label} ${isActive ? 'УВІМКНЕНО' : 'ВИМКНЕНО'}`);
        if (isActive) {
            statusText.textContent = 'РОБОТА';
            statusText.className = 'status-working';
        } else if (!document.querySelector('.btn-active')) {
            statusText.textContent = 'ГОТОВА';
            statusText.className = 'status-ready';
        }
    });
});

document.getElementById('btn-stop').onclick = () => {
    toggleButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('btn-active');
    });
    statusText.textContent = 'СТОП (АВАРІЙНО)';
    statusText.className = 'status-heating';
    addLog('АВАРІЙНА ЗУПИНКА СИСТЕМИ! ВСІ МОДУЛІ ДЕАКТИВОВАНО');
};