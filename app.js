// --- CONFIGURATION & INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.database();
const IMGBB_KEY = "8a72c60399b9c276904659cf219a03c9";

let currentUser = null, userData = {}, logs = [], viewDate = new Date();
let adminTargetId = null; // State สำคัญสำหรับคุมเครื่องคนอื่น

const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

const HOLIDAYS = {
    "01-01": "วันขึ้นปีใหม่", "04-13": "วันสงกรานต์", "04-14": "วันสงกรานต์", 
    "04-15": "วันสงกรานต์", "05-01": "วันแรงงาน", "05-04": "วันฉัตรมงคล",
    "07-28": "วันเฉลิมฯ ร.10", "08-12": "วันแม่แห่งชาติ", "10-13": "วันคล้ายวันสวรรคต ร.9",
    "12-05": "วันพ่อแห่งชาติ", "12-10": "วันรัฐธรรมนูญ", "12-31": "วันสิ้นปี"
};

window.onload = () => {
    // ฟีเจอร์: จำ Username
    const saved = localStorage.getItem('remembered_user');
    if (saved) {
        document.getElementById('l-id').value = saved;
        document.getElementById('remember-me').checked = true;
    }
};

function alertCenter(msg, icon = "success") {
    Swal.fire({
        icon: icon, title: msg, position: 'center', showConfirmButton: false, timer: 1500,
        background: '#1c1c1e', color: '#fff'
    });
}

// --- AUTHENTICATION SYSTEM ---
function toggleAuth(mode) {
    document.getElementById('auth-login').classList.toggle('hidden', mode === 'reg');
    document.getElementById('auth-reg').classList.toggle('hidden', mode === 'login');
}

async function doLogin() {
    const id = document.getElementById('l-id').value.trim(),
          pw = document.getElementById('l-pw').value,
          remember = document.getElementById('remember-me').checked;
    if(!id || !pw) return alertCenter("กรุณากรอกข้อมูลให้ครบ", "warning");

    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return alertCenter("ไม่พบชื่อผู้ใช้งาน", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
        if (remember) localStorage.setItem('remembered_user', id);
        else localStorage.removeItem('remembered_user');
        alertCenter("เข้าสู่ระบบสำเร็จ");
    } catch (e) { alertCenter("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", "error"); }
}

async function doRegister() {
    const u = document.getElementById('r-user').value.trim().toLowerCase(),
          e = document.getElementById('r-email').value.trim(),
          p = document.getElementById('r-pw').value;
    if(!u || !e || !p) return alertCenter("กรอกข้อมูลให้ครบ", "warning");
    try {
        const check = await db.ref('usernames/' + u).once('value');
        if(check.exists()) return alertCenter("ชื่อผู้ใช้นี้มีคนใช้แล้ว", "error");
        const cred = await auth.createUserWithEmailAndPassword(e, p);
        await db.ref('users/' + cred.user.uid).set({ 
            username: u, email: e, role: 'staff', jobType: 'staff', salary: 0, photoURL: '' 
        });
        await db.ref('usernames/' + u).set({ email: e, uid: cred.user.uid });
        alertCenter("สมัครสมาชิกสำเร็จ");
        toggleAuth('login');
    } catch (err) { alertCenter(err.message, "error"); }
}

async function forgotPW() {
    const { value: email } = await Swal.fire({ 
        title: 'ลืมรหัสผ่าน', input: 'email', inputPlaceholder: 'กรอกอีเมลของคุณ',
        background: '#1c1c1e', color: '#fff' 
    });
    if (email) {
        auth.sendPasswordResetEmail(email)
            .then(() => alertCenter("ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว"))
            .catch(() => alertCenter("ไม่พบอีเมลนี้ในระบบ", "error"));
    }
}

async function confirmLogout() {
    const res = await Swal.fire({ 
        title: 'ออกจากระบบ?', background: '#1c1c1e', color: '#fff', 
        showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (res.isConfirmed) {
        document.getElementById('l-pw').value = ""; // ฟีเจอร์: เคลียร์ช่อง Password
        auth.signOut();
    }
}

// --- CORE DATA SYNC ---
auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) {
        db.ref('users/' + u.uid).on('value', s => {
            userData = s.val() || {};
            if (!adminTargetId) { // ถ้าไม่ได้คุมเครื่องคนอื่น ให้โชว์ข้อมูลตัวเอง
                updateUI(userData);
                renderSchedule(userData);
            }
            if (userData.role === 'admin') {
                document.getElementById('nav-admin').classList.remove('hidden');
                loadAdminList();
            } else {
                document.getElementById('nav-admin').classList.add('hidden');
            }
        });

        db.ref('attendance/' + u.uid).on('value', s => {
            if (!adminTargetId) { // ถ้าไม่ได้คุมเครื่องคนอื่น ให้ใช้ Log ตัวเอง
                const d = s.val();
                logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
                renderCal();
                calculate();
            }
        });
    }
});

function updateUI(data) {
    document.getElementById('u-display').innerText = data.displayName || data.username || 'User';
    document.getElementById('u-photo').src = data.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('rider-card').classList.toggle('hidden', data.jobType !== 'rider');
}

// --- ADMIN & REMOTE CONTROL ---
function loadAdminList() {
    db.ref('users').once('value', s => {
        const users = s.val();
        document.getElementById('user-list').innerHTML = Object.keys(users).map(uid => `
            <div onclick="enterAdminView('${uid}', '${users[uid].displayName || users[uid].username}')" 
                 class="glass-card p-4 flex justify-between items-center active:scale-95 transition">
                <div class="flex items-center gap-4">
                    <img src="${users[uid].photoURL || ''}" class="w-10 h-10 rounded-full object-cover bg-zinc-800">
                    <div>
                        <p class="font-bold">${users[uid].displayName || users[uid].username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest">${users[uid].role} | ${users[uid].jobType}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20"></i>
            </div>`).join('');
    });
}

function enterAdminView(uid, name) {
    adminTargetId = uid;
    document.getElementById('remote-banner').classList.remove('hidden');
    document.getElementById('remote-name').innerText = name;
    
    // โหลดข้อมูลพนักงานคนนั้นมาทับ UI
    db.ref('users/' + uid).once('value', s => {
        const data = s.val();
        updateUI(data);
        renderSchedule(data);
    });

    db.ref('attendance/' + uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculate();
    });
    
    go('p-home'); // ไปหน้าแรกเพื่อลงเวลาแทนคนอื่นได้
    alertCenter("เข้าสู่โหมดควบคุม: " + name, "info");
}

function exitAdminView() {
    adminTargetId = null; // รีเซ็ต State กลับเป็นตัวเอง
    document.getElementById('remote-banner').classList.add('hidden');
    
    // คืนค่า UI เป็นของตัวเอง
    updateUI(userData);
    renderSchedule(userData);
    
    // โหลด Log ตัวเองกลับมา
    db.ref('attendance/' + currentUser.uid).once('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculate();
    });
    
    go('p-home');
    alertCenter("กลับสู่หน้าจอของคุณ", "info");
}

// --- ACTION LOGIC (CLOCKING & BILLS) ---
function tapIn() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0], 
          t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return alertCenter("วันนี้ลงเวลาไปแล้ว", "warning");
    
    db.ref(`attendance/${tid}`).push({ 
        date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0, otHours: 0 
    });
    alertCenter("ลงเวลาเข้างานสำเร็จ");
}

function tapOut() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0], 
          t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    
    if(log && !log.checkOut) {
        db.ref(`attendance/${tid}/${log.id}`).update({ checkOut: t });
        alertCenter("ลงเวลาออกงานสำเร็จ");
    } else alertCenter("ไม่พบข้อมูลเข้างาน", "error");
}

async function bulkDelivery() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return alertCenter("กรุณาลงเวลาเข้าก่อน", "warning");

    const { value: num } = await Swal.fire({ 
        title: 'เพิ่มจำนวนบิล', input: 'number', 
        background: '#1c1c1e', color: '#fff', showCancelButton: true 
    });
    if (num) {
        let current = log.delivery || 0;
        await db.ref(`attendance/${tid}/${log.id}`).update({ delivery: current + parseInt(num) });
    }
}

async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return alertCenter("ลงเวลาเข้างานก่อน", "warning");
    await db.ref(`attendance/${tid}/${log.id}`).update({ 
        delivery: Math.max(0, (log.delivery || 0) + v) 
    });
}

// --- CALENDAR & HOLIDAYS ---
function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = (new Date(y, m, 1).getDay() + 6) % 7;
    const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = '';
    
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    
    for (let d = 1; d <= total; d++) {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const holidayKey = `${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === ds);
        
        let status = "bg-white/5 opacity-40";
        if (log) {
            status = log.isOff ? 'st-off' : 'st-normal';
        } else if (HOLIDAYS[holidayKey]) {
            status = 'st-holiday'; // ฟีเจอร์: วันสำคัญสีส้ม
        }

        grid.innerHTML += `<div onclick="manageLog('${ds}', '${HOLIDAYS[holidayKey] || ''}')" 
            class="day-node mx-auto ${status}">${d}</div>`;
    }
}

async function manageLog(ds, hName) {
    if(hName) await Swal.fire({ title: hName, text: "วันนี้เป็นวันหยุดสำคัญ", icon: 'info', background: '#1c1c1e', color: '#fff' });
    
    const tid = adminTargetId || currentUser.uid;
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({
        title: ds, background: '#1c1c1e', color: '#fff',
        showDenyButton: !!log, confirmButtonText: log ? 'แก้ไข' : 'เพิ่มประวัติ', denyButtonText: 'ลบ'
    });

    if (action === true) {
        const { value: res } = await Swal.fire({
            background: '#1c1c1e', color: '#fff',
            html: `<input id="sw-in" type="time" class="time-pill mb-2" value="${log?log.checkIn:'08:30'}">
                   <input id="sw-out" type="time" class="time-pill mb-2" value="${log?log.checkOut:'17:30'}">
                   <input id="sw-oth" type="number" step="0.5" class="time-pill mb-2" placeholder="OT (ชั่วโมง)" value="${log?log.otHours:0}">
                   <input id="sw-bill" type="number" class="time-pill" placeholder="จำนวนบิล" value="${log?log.delivery:0}">
                   <div class="mt-4 flex items-center gap-2"><input type="checkbox" id="sw-off" ${log?.isOff?'checked':''}> <label class="text-xs">เป็นวันหยุดพนักงาน</label></div>`,
            preConfirm: () => ({
                checkIn: document.getElementById('sw-in').value,
                checkOut: document.getElementById('sw-out').value,
                otHours: parseFloat(document.getElementById('sw-oth').value)||0,
                delivery: parseInt(document.getElementById('sw-bill').value)||0,
                isOff: document.getElementById('sw-off').checked,
                date: ds
            })
        });
        if (res) {
            // แก้ไข: บันทึกย้อนหลัง (ถ้ามีให้ update ถ้าไม่มีให้ push)
            if (log) await db.ref(`attendance/${tid}/${log.id}`).update(res);
            else await db.ref(`attendance/${tid}`).push(res);
            alertCenter("บันทึกสำเร็จ");
        }
    } else if (action === false) {
        await db.ref(`attendance/${tid}/${log.id}`).remove();
        alertCenter("ลบประวัติแล้ว");
    }
}

// --- UTILITIES ---
function calculate() {
    let total = 0;
    const currentData = adminTargetId ? {} : userData; // logic คำนวณตามเดิม
    logs.forEach(l => {
        if(!l.isOff && l.checkIn) total += 500; // ตัวอย่างคำนวณเงินเดือน
    });
    document.getElementById('salary-view').innerText = total.toLocaleString();
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }

function renderSchedule(data) {
    const list = document.getElementById('week-list');
    list.innerHTML = DAYS.map(d => `
        <div class="glass-card p-4 flex justify-between items-center">
            <span class="font-bold text-xs">${d}</span>
            <div class="flex gap-2">
                <input type="time" class="bg-white/5 border-none text-[10px] p-1 rounded" value="${data.shifts?.[d]?.in || '08:30'}">
                <input type="time" class="bg-white/5 border-none text-[10px] p-1 rounded" value="${data.shifts?.[d]?.out || '17:30'}">
            </div>
        </div>
    `).join('');
}
