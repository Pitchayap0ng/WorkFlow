// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

// Initialize Firebase & EmailJS
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
emailjs.init("WSvF2N1nopC2xfuZo"); // Public Key ของคุณ

let currentUser = null, userData = {}, logs = [], viewDate = new Date();
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- Authentication Functions ---
function toggleAuth(isReg) {
    document.getElementById('login-box').classList.toggle('hidden', isReg);
    document.getElementById('reg-box').classList.toggle('hidden', !isReg);
}

async function doLogin() {
    const id = document.getElementById('l-id').value.trim();
    const pw = document.getElementById('l-pw').value;
    if(!id || !pw) return toast("กรุณากรอกข้อมูล", "warning");
    
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return toast("ไม่พบ Username", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { toast("ข้อมูลไม่ถูกต้อง", "error"); }
}

async function sendOTP() {
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const mail = document.getElementById('r-mail').value.trim();
    const pw = document.getElementById('r-pw').value;
    const name = document.getElementById('r-name').value;
    
    if (!user || !mail || pw.length < 6) return toast("ข้อมูลไม่ครบ (รหัสต้อง 6 ตัวขึ้นไป)", "error");

    const snap = await db.ref('usernames/' + user).once('value');
    if (snap.exists()) return toast("Username นี้มีคนใช้แล้ว", "error");

    // สร้างรหัส OTP และเวลาหมดอายุให้ตรงกับ Template HTML
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expireTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // ส่ง Email ผ่าน EmailJS
    // สำคัญ: ต้องไปปิด 'Use Private Key' ในหน้า Account > Security ของ EmailJS ก่อน
    emailjs.send("IMS-work", "template_34sz4uc", {
        passcode: otp,       // ตรงกับ {{passcode}} ใน HTML
        time: expireTime,    // ตรงกับ {{time}} ใน HTML
        to_email: mail       // ต้องใส่ {{to_email}} ในช่อง To Email ของ EmailJS
    }).then(() => {
        Swal.fire({
            title: 'ยืนยัน OTP',
            text: 'รหัสส่งไปที่ ' + mail,
            input: 'text',
            background: '#1c1c1e', color: '#fff',
            confirmButtonText: 'ยืนยัน',
            preConfirm: (v) => v === otp ? v : Swal.showValidationMessage('รหัส OTP ไม่ถูกต้อง')
        }).then(r => { 
            if (r.isConfirmed) finalizeReg({user, mail, pw, name}); 
        });
    }).catch(e => {
        console.error("EmailJS Error:", e);
        toast("ส่งเมลไม่สำเร็จ: " + (e.text || "ตรวจสอบการตั้งค่า Private Key"), "error");
    });
}

async function finalizeReg(info) {
    try {
        const res = await auth.createUserWithEmailAndPassword(info.mail, info.pw);
        const uid = res.user.uid;
        await db.ref('users/' + uid).set({
            username: info.user, displayName: info.name, email: info.mail, salary: 15000, isAdmin: false
        });
        await db.ref('usernames/' + info.user).set({ email: info.mail, uid: uid });
        toast("สมัครสมาชิกสำเร็จ!");
    } catch (e) { toast(e.message, "error"); }
}

// --- App Core Logic ---
auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) init();
});

function init() {
    db.ref('users/' + currentUser.uid).on('value', s => {
        userData = s.val() || {};
        document.getElementById('u-display').innerText = userData.displayName || 'User';
        if (userData.isAdmin) {
            const adminTag = document.getElementById('admin-tag');
            if(adminTag) adminTag.classList.remove('hidden');
        }
        renderWeekly();
        calculateSalary();
    });
    db.ref('attendance/' + currentUser.uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculateSalary();
    });
}

function calculateSalary() {
    const dailyRate = (userData.salary || 15000) / 30;
    const currentMonth = new Date().getMonth();
    // นับเฉพาะวันที่เช็คอินแล้วและไม่ใช่วันหยุด
    const monthLogs = logs.filter(l => new Date(l.date).getMonth() === currentMonth && !l.isOff && l.checkIn);
    const total = monthLogs.length * dailyRate;
    const salaryView = document.getElementById('salary-view');
    if(salaryView) salaryView.innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
}

function renderWeekly() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div class="flex flex-col"><span class="font-bold text-sm">${d}</span>
            <button onclick="setOff('${d}', ${!s.isOff})" class="text-[10px] text-left ${s.isOff ? 'text-red-500' : 'text-blue-500'}">${s.isOff ? 'วันหยุด' : 'วันทำงาน'}</button></div>
            <div class="flex gap-2"><input type="time" class="time-pill" value="${s.in}" onchange="setShift('${d}','in',this.value)" ${s.isOff ? 'disabled' : ''}>
            <input type="time" class="time-pill" value="${s.out}" onchange="setShift('${d}','out',this.value)" ${s.isOff ? 'disabled' : ''}></div></div>`;
    }).join('');
}

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const monView = document.getElementById('mon-view');
    if(monView) monView.innerText = `${MONTHS_TH[m]} ${y + 543}`;
    
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid');
    if(!grid) return;
    
    grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const date = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === date);
        const cls = log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5';
        grid.innerHTML += `<div onclick="editDay('${date}')" class="day-node ${cls}">${d}</div>`;
    }
}

function setShift(d, k, v) { db.ref(`users/${currentUser.uid}/shifts/${d}/${k}`).set(v); }
function setOff(d, v) { db.ref(`users/${currentUser.uid}/shifts/${d}/isOff`).set(v); }

function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return toast("วันนี้คุณเช็คอินไปแล้ว", "info");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false });
    toast("เช็คอินสำเร็จ");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log) return toast("ยังไม่ได้เช็คอินสำหรับวันนี้", "error");
    if(log.checkOut) return toast("คุณเช็คเอาท์ไปแล้ว", "warning");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("เช็คเอาท์สำเร็จ");
}

async function editDay(date) {
    const log = logs.find(l => l.date === date) || { checkIn: '', checkOut: '', isOff: false };
    const { value: res } = await Swal.fire({
        title: date, background: '#1c1c1e', color: '#fff',
        html: `<div class="text-left space-y-4"><label class="flex justify-between items-center bg-white/5 p-3 rounded-xl"><span>วันหยุด</span><input type="checkbox" id="e-off" ${log.isOff ? 'checked' : ''}></label>
        <div class="grid grid-cols-2 gap-2"><input type="time" id="e-in" class="time-pill w-full" value="${log.checkIn}"><input type="time" id="e-out" class="time-pill w-full" value="${log.checkOut}"></div>`,
        showCancelButton: true, preConfirm: () => ({ 
            isOff: document.getElementById('e-off').checked, 
            checkIn: document.getElementById('e-in').value, 
            checkOut: document.getElementById('e-out').value 
        })
    });
    if(res) {
        if(log.id) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ ...res, date });
        else db.ref(`attendance/${currentUser.uid}`).push({ ...res, date });
    }
}

// Navigation & Utilities
function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(id);
    if(targetPage) targetPage.classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }

function toast(m, i="success") { 
    Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); 
}
