// --- INITIALIZE FIREBASE ---
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
const IMGBB_KEY = "8a72c60399b9c276904659cf219a03c9";
emailjs.init("WSvF2N1nopC2xfuZo");

let currentUser = null, userData = {}, logs = [], viewDate = new Date(), regType = 'staff';
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- 1. AUTHENTICATION ---

function toggleAuth(isReg) {
    document.getElementById('login-box').classList.toggle('hidden', isReg);
    document.getElementById('reg-box').classList.toggle('hidden', !isReg);
}

function updateRegUI() {
    document.getElementById('rt-staff').className = regType === 'staff' ? 'flex-1 py-3 rounded-xl text-xs font-bold bg-green-600' : 'flex-1 py-3 rounded-xl text-xs font-bold text-zinc-500';
    document.getElementById('rt-rider').className = regType === 'rider' ? 'flex-1 py-3 rounded-xl text-xs font-bold bg-green-600' : 'flex-1 py-3 rounded-xl text-xs font-bold text-zinc-500';
}

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

async function sendOTP() {
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const mail = document.getElementById('r-mail').value.trim();
    const pw = document.getElementById('r-pw').value;
    const name = document.getElementById('r-name').value;
    if (!user || !mail || !pw || !name) return toast("กรอกข้อมูลไม่ครบ", "warning");

    const snap = await db.ref('usernames/' + user).once('value');
    if (snap.exists()) return toast("Username นี้ถูกใช้ไปแล้ว", "error");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    Swal.fire({ title: 'กำลังส่ง OTP...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    emailjs.send("IMS-work", "template_34sz4uc", { to_email: mail, passcode: otp })
        .then(() => {
            Swal.fire({
                title: 'ยืนยัน OTP', text: 'ส่งรหัสไปที่ ' + mail, input: 'text', background: '#1c1c1e', color: '#fff',
                preConfirm: (v) => v === otp ? v : Swal.showValidationMessage('รหัสไม่ถูกต้อง')
            }).then(r => { if (r.isConfirmed) finalizeReg({user, mail, pw, name}); });
        }).catch(() => toast("ส่งเมลไม่สำเร็จ", "error"));
}

async function finalizeReg(info) {
    try {
        const res = await auth.createUserWithEmailAndPassword(info.mail, info.pw);
        await db.ref('users/' + res.user.uid).set({ 
            username: info.user, displayName: info.name, email: info.mail, 
            salary: 15000, role: 'staff', jobType: regType, otRate: 1.5 
        });
        await db.ref('usernames/' + info.user).set({ email: info.mail, uid: res.user.uid });
        toast("ลงทะเบียนสำเร็จ");
    } catch (e) { toast(e.message, "error"); }
}

// --- 2. CORE SYSTEM ---

auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) init();
});

function init() {
    db.ref('users/' + currentUser.uid).on('value', s => {
        userData = s.val() || {};
        document.getElementById('u-display').innerText = userData.displayName || 'Guest';
        document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('rider-card').classList.toggle('hidden', userData.jobType !== 'rider');
        
        if (userData.role === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
            loadAdmin();
        } else {
            document.getElementById('nav-admin').classList.add('hidden');
        }
        renderSchedule();
        calculateAll();
    });

    db.ref('attendance/' + currentUser.uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculateAll();
    });
}

// --- 3. ADMIN & USER MANAGEMENT ---

function loadAdmin() {
    const list = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const data = s.val();
        if (!data) return;
        const users = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
        list.innerHTML = users.map(u => `
            <div onclick="editProfile('${u.uid}', ${JSON.stringify(u).replace(/"/g, '&quot;')})" class="glass-card p-4 flex items-center justify-between mb-2 active:scale-95 transition cursor-pointer">
                <div class="flex items-center gap-3">
                    <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <p class="font-bold text-sm leading-tight">${u.displayName || u.username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest text-blue-400">${u.role} • ${u.jobType}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold">฿${(u.salary || 0).toLocaleString()}</p>
                </div>
            </div>
        `).join('');
    });
}

async function editProfile(targetUid = currentUser.uid, targetData = userData) {
    const isAdmin = userData.role === 'admin';
    const { value: res } = await Swal.fire({
        title: 'ตั้งค่าผู้ใช้', background: '#1c1c1e', color: '#fff',
        html: `
            <div class="space-y-4 text-left">
                <div class="flex justify-center mb-4" onclick="document.getElementById('file-input').dataset.target='${targetUid}'; document.getElementById('file-input').click()">
                    <img src="${targetData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-20 h-20 rounded-full object-cover border-2 border-blue-500 shadow-xl">
                </div>
                <input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.displayName || ''}" placeholder="ชื่อเล่น">
                <input id="sw-sal" type="number" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.salary || 15000}" placeholder="เงินเดือนพื้นฐาน">
                ${isAdmin ? `
                    <select id="sw-job" class="w-full bg-white/5 p-4 rounded-xl text-white outline-none">
                        <option value="staff" ${targetData.jobType==='staff'?'selected':''}>Staff (พนักงานใน)</option>
                        <option value="rider" ${targetData.jobType==='rider'?'selected':''}>Rider (ส่งของ)</option>
                    </select>
                    <select id="sw-role" class="w-full bg-white/5 p-4 rounded-xl text-white outline-none">
                        <option value="staff" ${targetData.role==='staff'?'selected':''}>พนักงานทั่วไป</option>
                        <option value="admin" ${targetData.role==='admin'?'selected':''}>Admin (ผู้ดูแล)</option>
                    </select>
                ` : ''}
            </div>`,
        showCancelButton: true, confirmButtonText: 'บันทึก',
        preConfirm: () => {
            const d = { displayName: document.getElementById('sw-name').value, salary: parseFloat(document.getElementById('sw-sal').value) };
            if (isAdmin) { d.jobType = document.getElementById('sw-job').value; d.role = document.getElementById('sw-role').value; }
            return d;
        }
    });
    if (res) { await db.ref('users/' + targetUid).update(res); toast("บันทึกสำเร็จ"); }
}

// --- 4. ATTENDANCE & CALCULATION ---

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
    if(logs.find(l => l.date === d)) return toast("เช็คอินไปแล้ววันนี้", "info");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
    toast("Check-In เรียบร้อย");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return toast("ยังไม่ได้เช็คอินหรือเช็คเอาท์แล้ว", "error");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("Check-Out เรียบร้อย");
}

function addDelivery(amt) {
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return toast("กรุณา Check-In ก่อน", "warning");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: (log.delivery || 0) + amt });
}

// --- 5. UI UTILS ---

function renderSchedule() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = `<h2 class="text-xl font-bold mb-4">ตารางงานมาตรฐาน</h2>` + DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div><span class="font-bold text-xs">${d}</span><br>
            <button onclick="db.ref('users/${currentUser.uid}/shifts/${d}/isOff').set(${!s.isOff})" class="text-[9px] text-blue-500 font-bold">${s.isOff ? 'วันหยุด' : 'วันทำงาน'}</button></div>
            <div class="flex gap-2"><input type="time" class="time-pill" value="${s.in}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/in').set(this.value)">
            <input type="time" class="time-pill" value="${s.out}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/out').set(this.value)"></div></div>`;
    }).join('');
}

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid');
    if(!grid) return; grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const date = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === date);
        const cls = log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5';
        grid.innerHTML += `<div class="day-node ${cls}">${d}</div>`;
    }
}

async function handleFileUpload(input) {
    const file = input.files[0], tid = input.dataset.target || currentUser.uid;
    if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    Swal.fire({ title: 'กำลังอัปโหลด...', didOpen: () => Swal.showLoading() });
    try {
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
        const res = await r.json();
        if (res.success) { await db.ref('users/' + tid).update({ photoURL: res.data.url }); toast("อัปโหลดแล้ว"); }
    } catch (e) { toast("อัปโหลดไม่สำเร็จ", "error"); }
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }
function confirmLogout() { Swal.fire({ title: 'ออกจากระบบ?', showCancelButton: true, background: '#1c1c1e', color: '#fff' }).then(r => { if (r.isConfirmed) auth.signOut(); }); }
