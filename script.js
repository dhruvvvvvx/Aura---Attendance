const TIMETABLE = {
    1: ["PPS(T)", "TC(T)", "DT", "AE(T)", "SP(T)"], 
    2: ["MATHS", "TC(T)", "MPWS", "SP(P)"],
    3: ["UHV", "PPS(T)", "PPS(P)", "MATHS"],
    4: ["SP(T)", "MATHS", "AE(T)", "TC(P)"],
    5: ["MATHS", "UHV", "AE(T)", "AE(P)"]
};

const HOLIDAYS = [
    "2026-01-14", "2026-01-15", "2026-01-23", "2026-01-26",
    "2026-02-12", "2026-02-19", "2026-02-20",
    "2026-03-03", "2026-03-04", "2026-03-19", "2026-03-20", "2026-03-21", 
    "2026-03-22", "2026-03-23", "2026-03-24", "2026-03-26", "2026-03-31",
    "2026-04-03"
];

const INITIAL_BUNKS = {
    "AE(T)": 6, "AE(P)": 2, "DT": 3, "MATHS": 7, "MPWS": 1,
    "PPS(P)": 2, "PPS(T)": 6, "SP(T)": 8, "SP(P)": 2,
    "TC(T)": 6, "TC(P)": 2, "UHV": 5
};

const startDate = new Date("2026-01-12");
const endDate = new Date("2026-05-25");
let openFolders = new Set();
let undoStack = JSON.parse(localStorage.getItem('undo_stack')) || [];
let redoStack = JSON.parse(localStorage.getItem('redo_stack')) || [];

function isHoliday(dateStr) {
    return HOLIDAYS.includes(dateStr);
}

function saveState(data) {
    const current = localStorage.getItem('attendance_db');
    if (current) {
        undoStack.push(current);
        if (undoStack.length > 50) undoStack.shift();
        redoStack = [];
    }
    localStorage.setItem('attendance_db', JSON.stringify(data));
    localStorage.setItem('undo_stack', JSON.stringify(undoStack));
    localStorage.setItem('redo_stack', JSON.stringify(redoStack));
    render();
}

function undo() {
    if (!undoStack.length) return;
    redoStack.push(localStorage.getItem('attendance_db'));
    localStorage.setItem('attendance_db', undoStack.pop());
    render();
}

function redo() {
    if (!redoStack.length) return;
    undoStack.push(localStorage.getItem('attendance_db'));
    localStorage.setItem('attendance_db', redoStack.pop());
    render();
}

function toggleFolder(id) {
    if (openFolders.has(id)) openFolders.delete(id);
    else openFolders.add(id);
    render();
}

const calcBunksBudget = (att, currT, futureT) => {
    const totalPeriod = currT + futureT;
    if (totalPeriod === 0) return 0;
    const maxAbsencesAllowed = Math.floor(totalPeriod - (0.75 * totalPeriod));
    const currentAbsences = currT - att;
    return Math.max(0, maxAbsencesAllowed - currentAbsences);
};

function initData() {
    if (localStorage.getItem('attendance_db')) return;
    let logs = []; let curr = new Date(startDate); const today = new Date();
    while (curr <= today) {
        let dStr = curr.toISOString().split('T')[0];
        if (curr.getDay() >= 1 && curr.getDay() <= 5 && !isHoliday(dStr)) {
            (TIMETABLE[curr.getDay()] || []).forEach(s => logs.push({ date: dStr, subject: s, status: 'Present' }));
        }
        curr.setDate(curr.getDate() + 1);
    }
    let bC = {...INITIAL_BUNKS};
    for(let i=0; i<logs.length; i++){ 
        if(bC[logs[i].subject]>0){ logs[i].status='Absent'; bC[logs[i].subject]--; }
    }
    localStorage.setItem('attendance_db', JSON.stringify(logs));
}

function render() {
    const logs = JSON.parse(localStorage.getItem('attendance_db')) || [];
    const today = new Date();
    
    document.getElementById('undoBtn').disabled = undoStack.length === 0;
    document.getElementById('redoBtn').disabled = redoStack.length === 0;

    let subStats = {};
    let overall = { a: 0, t: 0 };
    let nestedData = {};
    let monthStats = {};
    let weekStats = {};

    logs.forEach(l => {
        const d = new Date(l.date);
        const mKey = d.toLocaleString('default', { month: 'long' });
        const weekNum = Math.floor((d - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1;
        const wKey = "Week " + weekNum;

        if (l.status !== 'Neutral') {
            if (!subStats[l.subject]) subStats[l.subject] = { a: 0, t: 0 };
            subStats[l.subject].t++;
            if (l.status === 'Present') { subStats[l.subject].a++; overall.a++; }
            overall.t++;

            if (!monthStats[mKey]) monthStats[mKey] = { a: 0, t: 0 };
            monthStats[mKey].t++; if (l.status === 'Present') monthStats[mKey].a++;

            if (!weekStats[wKey]) weekStats[wKey] = { a: 0, t: 0 };
            weekStats[wKey].t++; if (l.status === 'Present') weekStats[wKey].a++;
        }

        if (!nestedData[mKey]) nestedData[mKey] = {};
        if (!nestedData[mKey][wKey]) nestedData[mKey][wKey] = {};
        if (!nestedData[mKey][wKey][l.date]) nestedData[mKey][wKey][l.date] = [];
        nestedData[mKey][wKey][l.date].push(l);
    });

    let future = { sem: 0, subs: {}, month: 0, week: 0 };
    let scanDate = new Date(today); scanDate.setDate(scanDate.getDate() + 1);
    const curMonthKey = today.toLocaleString('default', { month: 'long' });
    const curWeekKey = "Week " + (Math.floor((today - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1);

    while(scanDate <= endDate) {
        const dStr = scanDate.toISOString().split('T')[0];
        if(scanDate.getDay() >= 1 && scanDate.getDay() <= 5 && !isHoliday(dStr)) {
            const daySubs = TIMETABLE[scanDate.getDay()] || [];
            future.sem += daySubs.length;
            daySubs.forEach(s => future.subs[s] = (future.subs[s] || 0) + 1);
            if(scanDate.toLocaleString('default', { month: 'long' }) === curMonthKey) future.month += daySubs.length;
            const sWk = "Week " + (Math.floor((scanDate - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1);
            if(sWk === curWeekKey) future.week += daySubs.length;
        }
        scanDate.setDate(scanDate.getDate() + 1);
    }

    const bTotal = calcBunksBudget(overall.a, overall.t, future.sem);
    const bMonth = calcBunksBudget(monthStats[curMonthKey]?.a || 0, monthStats[curMonthKey]?.t || 0, future.month);
    const bWeek = calcBunksBudget(weekStats[curWeekKey]?.a || 0, weekStats[curWeekKey]?.t || 0, future.week);

    document.getElementById('summaryDashboard').innerHTML = `
        <div class="summary-card">
            <span class="desc">OVERALL SEMESTER</span>
            <span class="val" style="color:${(overall.a/overall.t)<0.75?'var(--danger)':'var(--success)'}">${((overall.a/overall.t||0)*100).toFixed(1)}%</span>
            <span class="desc">Lectures: ${overall.a}/${overall.t} | Safe Bunks: <b>${bTotal}</b></span>
        </div>
        <div class="summary-card">
            <span class="desc">MONTHLY (${curMonthKey.toUpperCase()})</span>
            <span class="val">${((monthStats[curMonthKey]?.a/monthStats[curMonthKey]?.t||0)*100).toFixed(1)}%</span>
            <span class="desc">Lectures: ${monthStats[curMonthKey]?.a || 0}/${monthStats[curMonthKey]?.t || 0} | Safe Bunks: <b>${bMonth}</b></span>
        </div>
        <div class="summary-card">
            <span class="desc">WEEKLY (${curWeekKey.toUpperCase()})</span>
            <span class="val">${((weekStats[curWeekKey]?.a/weekStats[curWeekKey]?.t||0)*100).toFixed(1)}%</span>
            <span class="desc">Lectures: ${weekStats[curWeekKey]?.a || 0}/${weekStats[curWeekKey]?.t || 0} | Safe Bunks: <b>${bWeek}</b></span>
        </div>
    `;

    document.getElementById('statsContainer').innerHTML = Object.keys(subStats).sort().map(sub => {
        const b = calcBunksBudget(subStats[sub].a, subStats[sub].t, future.subs[sub] || 0);
        const perc = (subStats[sub].a / subStats[sub].t * 100).toFixed(0);
        const isLow = perc < 75;
        return `<div class="sub-card ${isLow ? 'warning' : ''}">
            <div style="color:var(--text-dim);font-size:0.8rem;font-weight:700; margin-bottom: 5px;">
                ${sub} <span class="perc-badge" style="color:${isLow ? 'var(--danger)' : 'var(--success)'}">${perc}%</span>
            </div>
            <div style="font-size:1.8rem;font-weight:800;margin:2px 0; color:${isLow?'var(--danger)':'white'}">${b}</div>
            <div style="font-size:0.65rem;color:var(--accent);font-weight:800;letter-spacing:1px">SAFE BUNKS</div>
            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top:5px;">
                History: <b>${subStats[sub].a}</b>/<b>${subStats[sub].t}</b>
            </div>
        </div>`;
    }).join('');

    let html = "";
    ["January", "February", "March", "April", "May"].forEach(mKey => {
        if (!nestedData[mKey]) return;
        const mOpen = openFolders.has(mKey) ? "active" : "";
        const mAtt = ((monthStats[mKey]?.a / monthStats[mKey]?.t || 0) * 100).toFixed(1);
        html += `<div class="folder">
            <div class="folder-trigger" onclick="toggleFolder('${mKey}')">
                <span>📁 ${mKey} <span class="perc-badge">${mAtt}%</span></span> <span>${openFolders.has(mKey)?'−':'+'}</span>
            </div>
            <div class="content-pane ${mOpen}">`;
        Object.keys(nestedData[mKey]).forEach(wKey => {
            const wId = mKey + wKey;
            const wOpen = openFolders.has(wId) ? "active" : "";
            const wAtt = ((weekStats[wKey]?.a / weekStats[wKey]?.t || 0) * 100).toFixed(1);
            html += `<div class="folder" style="margin: 0 10px 10px;">
                <div class="folder-trigger" onclick="toggleFolder('${wId}')">
                    <span>📍 ${wKey} <span class="perc-badge">${wAtt}%</span></span> <span>${openFolders.has(wId)?'−':'+'}</span>
                </div>
                <div class="content-pane ${wOpen}">`;
            Object.keys(nestedData[mKey][wKey]).forEach(dKey => {
                const dayLabel = new Date(dKey).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
                const dOpen = openFolders.has(dKey) ? "active" : "";
                html += `<div class="folder" style="margin: 0 10px 5px;">
                    <div class="folder-trigger" style="font-size:0.9rem">
                        <span onclick="toggleFolder('${dKey}')">📅 ${dayLabel}</span>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <button class="holiday-btn" onclick="setDayHoliday('${dKey}')">Holiday</button>
                            <span onclick="toggleFolder('${dKey}')" style="cursor:pointer; width:20px; text-align:center;">${openFolders.has(dKey)?'−':'+'}</span>
                        </div>
                    </div>
                    <div class="content-pane ${dOpen}">
                        <table class="data-table">
                            ${nestedData[mKey][wKey][dKey].map(item => `
                                <tr>
                                    <td>${item.subject}</td>
                                    <td class="status-${item.status.toLowerCase()}">${item.status}</td>
                                    <td align="right">
                                        <button class="toggle-chip" onclick="toggleAt('${item.date}','${item.subject}','${item.status==='Present'?'Absent':'Present'}')">Toggle</button>
                                        <button class="neutral-chip" onclick="toggleAt('${item.date}','${item.subject}','Neutral')">Mass Bunk</button>
                                    </td>
                                </tr>`).join('')}
                        </table>
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        });
        html += `</div></div>`;
    });
    document.getElementById('nestedLogsContainer').innerHTML = html;
}

window.toggleAt = (d, s, st) => {
    let l = JSON.parse(localStorage.getItem('attendance_db'));
    let r = l.find(x => x.date === d && x.subject === s);
    if(r) r.status = st;
    saveState(l);
};

window.setDayHoliday = (d) => {
    if(!confirm("Mark this entire day as Holiday? (Removes all lectures)")) return;
    let l = JSON.parse(localStorage.getItem('attendance_db'));
    let filtered = l.filter(x => x.date !== d);
    saveState(filtered);
};

document.getElementById('undoBtn').onclick = undo;
document.getElementById('redoBtn').onclick = redo;

initData();
render();