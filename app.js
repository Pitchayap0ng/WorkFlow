const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.database();
let currentUser = null, userData = {}, logs = [], viewDate = new Date();
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- AUTH ---

async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return toast("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return toast("ไม่พบ Username", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
        toast("เข้าสู่ระบบสำเร็จ", "success");
    } catch (e) { toast("ข้อมูลไม่ถูกต้อง", "error"); }
}

auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) init();
});

function init() {
    // 1. โหลดข้อมูลตัวเอง + เช็ค Admin
    db.ref('users/' + currentUser.uid).on('value', s => {
        userData = s.val() || {};
        document.getElementById('u-display').innerText = userData.displayName || 'User';
        document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('rider-card').classList.toggle('hidden', userData.jobType !== 'rider');
        
        // แก้ไขหน้า Admin ไม่ขึ้น: เช็ค role ให้ตรงกับฐานข้อมูล
        if (userData.role === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
            loadAdminList();
        }
        calculateAll();
    });

    // 2. โหลดประวัติงาน
    db.ref('attendance/' + currentUser.uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculateAll();
    });
}

// --- ADMIN MANAGEMENT ---

function loadAdminList() {
    const list = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const data = s.val();
        if (!data) return;
        const users = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
        list.innerHTML = users.map(u => `
            <div onclick="editUserProfile('${u.uid}')" class="glass-card p-4 flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                    <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <p class="font-bold text-sm">${u.displayName || u.username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest text-blue-400">${u.role}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20"></i>
            </div>
        `).join('');
    }, err => {
        list.innerHTML = `<p class="text-xs text-red-500">Error: ${err.message}. อย่าลืมแก้ Rules จาก isAdmin เป็น role</p>`;
    });
}

// --- RIDER: แก้ไขบิล ---

async function editBills() {
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return toast("กรุณา Check-In ก่อน", "warning");

    const { value: amt } = await Swal.fire({
        title: 'ระบุจำนวนบิลวันนี้',
        input: 'number',
        inputValue: log.delivery || 0,
        background: '#1c1c1e', color: '#fff',
        showCancelButton: true
    });
    if (amt !== undefined) {
        db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: parseInt(amt) || 0 });
    }
}

function addDelivery(val) {
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return toast("กรุณา Check-In ก่อน", "warning");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: (log.delivery || 0) + val });
}

// --- CALENDAR: แก้ไข/ลบ ---

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === dateStr);
        const cls = log ? (log.isOff ? 'st-off' : 'st-work') : 'bg-white/5';
        grid.innerHTML += `<div onclick="manageLog('${dateStr}')" class="day-node ${cls}">${d}${log ? '<div class="dot"></div>' : ''}</div>`;
    }
}

async function manageLog(dateStr) {
    const log = logs.find(l => l.date === dateStr);
    
    if (!log) {
        // ถ้าไม่มีข้อมูล ให้เลือกว่าจะเพิ่มข้อมูลไหม
        const { isConfirmed } = await Swal.fire({
            title: 'ไม่มีข้อมูลวันที่ ' + dateStr,
            text: "ต้องการเพิ่มบันทึกย้อนหลังหรือไม่?",
            showCancelButton: true, confirmButtonText: 'เพิ่มบันทึก', background: '#1c1c1e', color: '#fff'
        });
        if (isConfirmed) {
            db.ref(`attendance/${currentUser.uid}`).push({ date: dateStr, checkIn: '08:30', checkOut: '17:30', delivery: 0, isOff: false });
        }
        return;
    }

    // ถ้ามีข้อมูล ให้เลือก แก้ไข หรือ ลบ
    const { value: action } = await Swal.fire({
        title: 'จัดการวันที่ ' + dateStr,
        background: '#1c1c1e', color: '#fff',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'แก้ไขข้อมูล',
        denyButtonText: 'ลบทิ้ง',
        denyButtonColor: '#ef4444'
    });

    if (action === true) {
        // แก้ไข
        const { value: formValues } = await Swal.fire({
            title: 'แก้ไขเวลา',
            background: '#1c1c1e', color: '#fff',
            html: `
                <div class="text-left text-xs mb-1">Check-In:</div>
                <input id="sw-in" type="time" class="w-full bg-white/5 p-3 rounded mb-3" value="${log.checkIn}">
                <div class="text-left text-xs mb-1">Check-Out:</div>
                <input id="sw-out" type="time" class="w-full bg-white/5 p-3 rounded" value="${log.checkOut}">
            `,
            preConfirm: () => [document.getElementById('sw-in').value, document.getElementById('sw-out').value]
        });
        if (formValues) {
            db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkIn: formValues[0], checkOut: formValues[1] });
        }
    } else if (Swal.isVisible() && action === undefined) {
        // ลบ (ถ้ากด Deny)
        db.ref(`attendance/${currentUser.uid}/${log.id}`).remove();
        toast("ลบข้อมูลสำเร็จ");
    }
}

// --- UTILS ---

function calculateAll() {
    const dailyRate = (userData.salary || 15000) / 30;
    const curMonth = new Date().getMonth();
    let total = 0, todayB = 0;
    logs.forEach(l => {
        if (new Date(l.date).getMonth() === curMonth) {
            if (!l.isOff && l.checkIn) total += dailyRate;
            if (l.delivery) total += (l.delivery * 15);
            if (l.date === new Date().toISOString().split('T')[0]) todayB = l.delivery || 0;
        }
    });
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('today-bills').innerText = todayB;
}

function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return toast("วันนี้บันทึกไปแล้ว", "info");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
    toast("Check-In แล้ว");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return toast("ไม่พบรายการที่ยังไม่จบ", "error");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("Check-Out แล้ว");
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }
function confirmLogout() { auth.signOut(); }
