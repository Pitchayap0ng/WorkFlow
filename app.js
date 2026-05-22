// ✅ CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(),
    db = firebase.database();
emailjs.init("WSvF2N1nopC2xfuZo");

let currentUser = null,
    myInfo = {},
    targetInfo = {},
    logs = [],
    viewDate = new Date(),
    adminTargetId = null;
let timerInterval = null,
    regOTP = null;

let generatedOTP = null;
// เพิ่มตัวแปรสำหรับ Session
let localSessionId = null;
let isLoggingIn = false;

// ฟังก์ชันดึงข้อมูล IP และ Location
async function getClientInfo() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        return {
            ip: data.ip || 'Unknown',
            location: `${data.city || 'Unknown'}, ${data.country_name || 'Unknown'}`,
            isp: data.org || 'Unknown'
        };
    } catch (error) {
        return { ip: 'Unknown', location: 'Unknown', isp: 'Unknown' };
    }
}

// ฟังก์ชันควบคุมการสลับบล็อกฟอร์มใน Auth UI ป้องกันหน้าซ้อนทับกัน
function toggleAuth(mode) {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('reg-form');

    if (mode === 'reg') {
        if (loginForm) { loginForm.classList.remove('block'); loginForm.classList.add('hidden'); }
        if (regForm) { regForm.classList.remove('hidden'); regForm.classList.add('block'); }
    } else {
        if (regForm) { regForm.classList.remove('block'); regForm.classList.add('hidden'); }
        if (loginForm) { loginForm.classList.remove('hidden'); loginForm.classList.add('block'); }
    }
}

async function sendRegistrationOTP() {
    const name = document.getElementById('r-name').value.trim();
    const user = document.getElementById('r-user').value.toLowerCase().trim();
    const email = document.getElementById('r-email').value.trim();
    const pw = document.getElementById('r-pw').value;

    // ตรวจสอบข้อมูลเบื้องต้น
    if (!name || !user || !email || !pw) return pushLog("กรุณากรอกข้อมูลให้ครบ", "warning");
    if (pw.length < 6) return pushLog("รหัสผ่านต้อง 6 ตัวขึ้นไป", "warning");

    // ตรวจสอบ Username ซ้ำใน Firebase Database
    const checkUser = await db.ref(`usernames/${user}`).once('value');
    if (checkUser.exists()) return pushLog("Username นี้ถูกใช้งานแล้ว", "error");

    // สุ่มรหัส OTP 6 หลัก
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    pushLog("กำลังส่ง OTP...", "info");

    // กำหนด Parameter ส่งไปหา EmailJS
    const templateParams = {
        to_name: name,
        to_email: email,
        passcode: generatedOTP,
        time: "15"
    };

    emailjs.send('IMS-work', 'template_34sz4uc', templateParams)
        .then(() => {
            pushLog("ส่ง OTP สำเร็จ!");
            // สั่งเปิดกล่องกรอก OTP (ตรงกับ id="reg-otp-area" ใน HTML)
            document.getElementById('reg-otp-area').classList.remove('hidden');
        })
        .catch(err => {
            console.error(err);
            pushLog("ส่งไม่สำเร็จ", "error");
        });
}

// ฟังก์ชันสำหรับให้ Admin เลือกปลดบล็อกรายบุคคล
function unlockUser(targetUid, displayName) {
    Swal.fire({
        title: 'ยืนยันการปลดบล็อก?',
        text: `คุณต้องการปลดล็อกและล้างประวัติการกรอกรหัสผิดของ "${displayName}" ใช่หรือไม่?`,
        icon: 'checkmark',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ปลดบล็อกเลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#10b981', // สีเขียว Success
        background: '#151517',
        color: '#fff'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                // อัปเดตล้างค่าในคีย์ผู้ใช้คนนั้นๆ บน Firebase
                await db.ref(`users/${targetUid}`).update({
                    isBlocked: false,
                    failedAttempts: 0
                });

                Swal.fire('สำเร็จ!', `ปลดล็อกบัญชีของ ${displayName} เรียบร้อยแล้ว สามารถเข้าใช้งานได้ปกติ`, 'success');

                // สั่งรีโหลดข้อมูลหน้าแอดมินใหม่เบาๆ เพื่ออัปเดต UI 
                if (typeof viewUser === 'function') viewUser(targetUid);

            } catch (err) {
                console.error(err);
                Swal.fire('ผิดพลาด', 'ไม่สามารถแก้ไขข้อมูลได้เนื่องจากสิทธิ์ไม่ครบ', 'error');
            }
        }
    });
}
// ค้นหาฟังก์ชัน viewUser ในโค้ดเดิมของคุณ แล้วเพิ่มเช็กสถานะตัวแปรปุ่มปลดบล็อกรายคน
function viewUser(uid) {
    db.ref(`users/${uid}`).once('value', s => {
        const u = s.val();
        if (!u) return;

        // 💡 สร้าง Element ปุ่มพิเศษ: ถ้าเขาถูกบล็อกอยู่ (isBlocked === true) ให้แสดงปุ่มปลดล็อก
        let unlockButtonHtml = "";
        if (u.isBlocked) {
            unlockButtonHtml = `
                <div class="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                    <p class="text-xs text-red-400 mb-2 font-semibold">⚠️ บัญชีนี้ถูกล็อก (ใส่รหัสผิดครบกำหนด)</p>
                    <button onclick="unlockUser('${uid}', '${u.displayName || u.username}')" 
                            class="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs tracking-wider rounded-xl transition-all active:scale-95">
                        <i class="fa-solid fa-key mr-1"></i> UNLOCK USER (ปลดบล็อก)
                    </button>
                </div>
            `;
        }

        // นำตัวแปร unlockButtonHtml นี้ไปใส่พ่วงไว้ใน html: `...` ของ Swal.fire ในฟังก์ชัน viewUser เดิมของคุณได้เลยครับ!
    });
}

// ฟังก์ชันแสดงรายการผู้ใช้พร้อมปุ่มปลดบล็อก
async function renderUserList() {
    const userListDiv = document.getElementById('user-list');
    if (!userListDiv) return;

    userListDiv.innerHTML = '<div class="text-xs opacity-50 text-center py-4">กำลังโหลดรายชื่อ...</div>';

    try {
        const snap = await db.ref('users').once('value');
        userListDiv.innerHTML = '';

        let found = false;
        snap.forEach(child => {
            const user = child.val();
            const uid = child.key;

            // แสดงรายการเฉพาะผู้ใช้ที่ถูกบล็อก
            if (user.isBlocked) {
                found = true;
                const div = document.createElement('div');
                div.className = "flex items-center justify-between p-3 bg-white/5 rounded-xl border border-red-500/20";
                div.innerHTML = `
                    <div>
                        <div class="text-sm font-bold text-white">${user.email || 'No Email'}</div>
                        <div class="text-[10px] text-red-500 font-bold">● บัญชีถูกระงับ (BLOCKED)</div>
                    </div>
                    <button onclick="unblockUser('${uid}')" class="px-4 py-2 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-lg border border-green-500/20 active:scale-95 transition">ปลดบล็อก</button>
                `;
                userListDiv.appendChild(div);
            }
        });

        if (!found) {
            userListDiv.innerHTML = '<div class="text-xs opacity-50 text-center py-4">ไม่มีผู้ใช้งานที่ถูกบล็อกในขณะนี้</div>';
        }
    } catch (e) {
        userListDiv.innerHTML = '<div class="text-xs text-red-500 text-center py-4">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>';
    }
}

async function handleLogin() {
    const input = document.getElementById('l-id').value.trim();
    const password = document.getElementById('l-pw').value;

    if (!input || !password) {
        return pushLog("กรุณากรอกข้อมูลให้ครบ", "error");
    }

    let email = null;
    let databaseKey = null;
    let targetUserData = null;

    try {
        isLoggingIn = true;
        pushLog("กำลังตรวจสอบข้อมูล...", "info");

        // 1. ค้นหาผู้ใช้จากระบบ
        if (input.includes('@')) {
            email = input.toLowerCase().trim();
            const usersSnap = await db.ref('users').once('value');
            const usersData = usersSnap.val() || {};
            for (const key in usersData) {
                if (usersData[key].email && usersData[key].email.toLowerCase().trim() === email) {
                    targetUserData = usersData[key];
                    databaseKey = key;
                    break;
                }
            }
        } else {
            const userLower = input.toLowerCase();
            const usernameSnap = await db.ref(`usernames/${userLower}`).once('value');
            if (usernameSnap.exists()) {
                const usernameInfo = usernameSnap.val();
                email = usernameInfo.email;
                databaseKey = usernameInfo.uid;
                const userSnap = await db.ref(`users/${databaseKey}`).once('value');
                targetUserData = userSnap.val();
            }
        }

        // กรณีไม่พบผู้ใช้
        if (!email || !databaseKey || !targetUserData) {
            return Swal.fire('ไม่พบผู้ใช้งาน', 'ไม่พบบัญชีนี้ในฐานข้อมูลระบบ', 'error');
        }

        // ตรวจสอบการบล็อกบัญชี
        if (targetUserData.isBlocked) {
            return Swal.fire('บัญชีถูกระงับ', 'บัญชีนี้ถูกบล็อก กรุณาติดต่อ Admin', 'error');
        }

        // 2. ตรวจสอบการล็อกอินซ้อน (Multi-device Prevention)
        if (targetUserData.currentSessionId) {
            const { value: pin } = await Swal.fire({
                title: 'บัญชีนี้กำลังใช้งานอยู่!',
                html: `<p>มีการเข้าใช้งานจากอุปกรณ์อื่นอยู่ หากต้องการเข้าสู่ระบบเครื่องนี้ <b>จำเป็นต้องใช้รหัส Admin</b></p>`,
                input: 'password',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'ยืนยัน',
                cancelButtonText: 'ยกเลิก'
            });

            if (pin === undefined) return;

            const settingsSnap = await db.ref('settings/adminPin').once('value');
            const realPin = settingsSnap.exists() ? String(settingsSnap.val()) : "1234";

            if (pin !== realPin) {
                return Swal.fire('รหัสไม่ถูกต้อง', 'ไม่สามารถเข้าใช้งานได้', 'error');
            }
        }

        // 3. ทำการ Auth ผ่าน Firebase
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const uid = userCredential.user.uid;
        const newSessionId = 'SESS_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        localSessionId = newSessionId;

        const clientInfo = await getClientInfo();

        await db.ref(`users/${uid}`).update({
            currentSessionId: newSessionId,
            failedAttempts: 0,
            isBlocked: false,
            lastIp: clientInfo.ip,
            lastLocation: clientInfo.location,
            lastLoginTime: firebase.database.ServerValue.TIMESTAMP
        });

        // ⚠️ สำคัญ: อัปเดตตัวแปรเครื่องนี้ให้ตรงกับ Database เพื่อไม่ให้โดนเตะตัวเอง


        pushLog("เข้าสู่ระบบสำเร็จ!");
        if (typeof showPage === "function") showPage('p-home');

        setTimeout(() => { isLoggingIn = false; }, 2000);

    } catch (error) {
        isLoggingIn = false;
        console.error("Login Process Error:", error);

        // จัดการกรณีรหัสผ่านผิด (รองรับ Error แบบใหม่ของ Firebase)
        const isAuthError =
            error.code === 'auth/wrong-password' ||
            error.code === 'auth/invalid-credential' ||
            error.code === 'auth/invalid-login-credentials' ||
            (error.message && error.message.includes('INVALID_LOGIN_CREDENTIALS'));

        if (databaseKey && isAuthError) {
            const freshUserSnap = await db.ref(`users/${databaseKey}`).once('value');
            const freshUserData = freshUserSnap.val() || {};
            let currentAttempts = (freshUserData.failedAttempts || 0) + 1;

            await db.ref(`users/${databaseKey}`).update({
                failedAttempts: currentAttempts,
                isBlocked: currentAttempts >= 5
            });

            if (currentAttempts >= 5) {
                Swal.fire('ถูกระงับบัญชี!', 'คุณกรอกรหัสผิดเกิน 5 ครั้ง', 'error');
            } else {
                Swal.fire('รหัสผ่านไม่ถูกต้อง', `เหลือโอกาสอีก ${5 - currentAttempts} ครั้ง`, 'warning');
            }
        } else {
            // ป้องกันไม่ให้ข้อความ Error แบบ JSON ดิบๆ ไปโชว์บนหน้าจอ
            let errorMsg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง";
            if (typeof error.message === 'string' && !error.message.includes('INVALID_LOGIN_CREDENTIALS') && !error.message.includes('{')) {
                errorMsg = error.message;
            }
            Swal.fire('เกิดข้อผิดพลาด', errorMsg, 'error');
        }
    }
}

async function verifyAndRegister() {
    const inputOTP = document.getElementById('r-otp').value.trim();

    if (inputOTP !== generatedOTP) return pushLog("รหัส OTP ไม่ถูกต้อง", "error");

    const name = document.getElementById('r-name').value.trim();
    const user = document.getElementById('r-user').value.toLowerCase().trim();
    const email = document.getElementById('r-email').value.trim();
    const job = document.getElementById('r-job').value;
    const pw = document.getElementById('r-pw').value;

    auth.createUserWithEmailAndPassword(email, pw).then(async r => {
        const userData = {
            displayName: name,
            username: user,
            email: email,
            phone: "",
            jobType: job,
            role: 'user',
            salary: 10810,
            billRate: 15,
            photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png'
        };

        await db.ref(`users/${r.user.uid}`).set(userData);
        await db.ref(`usernames/${user}`).set({ email: email, uid: r.user.uid });

        pushLog("สมัครสมาชิกสำเร็จ!");
        generatedOTP = null;

        document.getElementById('r-name').value = "";
        document.getElementById('r-user').value = "";
        document.getElementById('r-email').value = "";
        document.getElementById('r-pw').value = "";
        document.getElementById('r-otp').value = "";

        document.getElementById('reg-otp-area').classList.add('hidden');
        toggleAuth('login');
    }).catch(e => {
        pushLog(e.message, "error");
    });
}

// --- [ AUTH SYSTEM STATE ] ---
auth.onAuthStateChanged(user => {
    const authUi = document.getElementById('auth-ui');
    const appUi = document.getElementById('app-ui');

    if (user) {
        currentUser = user;
        if (authUi) authUi.classList.add('hidden');
        if (appUi) appUi.classList.remove('hidden');

        db.ref(`users/${user.uid}`).on('value', s => {
            myInfo = s.val();
            if (!myInfo) return;

            // 1. ตรวจสอบการโดนบล็อก
            if (myInfo.isBlocked) {
                db.ref(`users/${user.uid}`).off();
                auth.signOut();
                Swal.fire('ถูกระงับ!', 'บัญชีของคุณถูกระงับ กรุณาติดต่อ Admin', 'error').then(() => location.reload());
                return;
            }

            // 2. ตรวจสอบการล็อกอินซ้อน (Session Mismatch)
            if (!isLoggingIn && localSessionId !== null && myInfo.currentSessionId && myInfo.currentSessionId !== localSessionId) {
                console.log("⚠️ Session mismatch detected. Kicking...");

                // ปิดการดักจับข้อมูลเพื่อไม่ให้ทำงานซ้ำซ้อน
                db.ref(`users/${user.uid}`).off();

                // นำรูปแบบแจ้งเตือนที่ละเอียดกว่ามาใช้
                Swal.fire({
                    title: '⚠️ ระบบมีการเข้าใช้งานใหม่!',
                    html: `บัญชีของคุณถูกล็อกอินจากอุปกรณ์อื่น หรือ Admin เข้ามาตรวจสอบระบบ <br><br> <b>ระบบจะนำคุณออกจากระบบโดยอัตโนมัติ</b>`,
                    icon: 'warning',
                    confirmButtonText: 'รับทราบ',
                    allowOutsideClick: false,
                    background: '#151517',
                    color: '#fff'
                }).then(() => {
                    // ทำการ Sign Out หลังจากกดรับทราบ
                    auth.signOut().then(() => {
                        localSessionId = null;
                        location.reload();
                    });
                });

                return;
            }

            // 3. กำหนดค่า localSessionId ครั้งแรก (ถ้าเครื่องนี้ยังว่างอยู่)
            // ยอมรับค่าจาก DB มาเป็นค่าเริ่มต้นสำหรับเครื่องนี้
            if (localSessionId === null && myInfo.currentSessionId) {
                localSessionId = myInfo.currentSessionId;
            }

            // 4. จัดการ UI และเริ่มระบบ
            const navAdmin = document.getElementById('nav-admin');
            if (navAdmin) navAdmin.classList.toggle('hidden', myInfo.role !== 'admin');
            if (!adminTargetId) initApp();
        });
    } else {
        currentUser = null;
        localSessionId = null; // เคลียร์ค่าเมื่อออกจากระบบ
        if (appUi) appUi.classList.add('hidden');
        if (authUi) authUi.classList.remove('hidden');
        if (typeof toggleAuth === 'function') toggleAuth('login');
    }
});

function previewProfileImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('edit-photo-preview').src = e.target.result;
            document.getElementById('edit-photo').value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// ตัวอย่างฟังก์ชันโหลดรายชื่อพนักงานในหน้า Management 
function loadUsersManagement() {
    db.ref('users').on('value', snapshot => {
        const userListDiv = document.getElementById('user-list');
        if (!userListDiv) return;

        userListDiv.innerHTML = '';
        const usersData = snapshot.val() || {};

        for (const uid in usersData) {
            const u = usersData[uid];

            // ข้าม ID ของตัวเอง (แอดมินไม่อยากกดจัดการตัวเองในหน้ารวม)
            if (currentUser && uid === currentUser.uid) continue;

            // 🚨 ตรวจสอบสถานะการติดบล็อกเพื่อสร้างปุ่มด่วนด้านท้ายแถว
            let actionBtnHtml = "";
            if (u.isBlocked) {
                // บัญชีโดนล็อก -> แสดงปุ่มปลดล็อกด่วน (ปุ่มสั่น/เด่นเตือนใจ)
                actionBtnHtml = `
                    <button onclick="unlockUserDirect('${uid}', '${u.displayName || u.username}')" 
                            class="px-3 py-2 bg-red-500/10 hover:bg-emerald-500/20 border border-red-500/30 hover:border-emerald-500/40 text-red-400 hover:text-emerald-400 font-bold text-[10px] rounded-xl transition-all active:scale-95 flex items-center gap-1 animate-pulse">
                        <i class="fa-solid fa-unlock text-xs"></i> ปลดบล็อก
                    </button>
                `;
            } else {
                // บัญชีปกติ -> แสดงปุ่มดูข้อมูลทั่วไป (หรือปุ่มแก้ไขตามระบบเดิมของคุณ)
                actionBtnHtml = `
                    <button onclick="viewUser('${uid}')" 
                            class="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-400 hover:text-white text-[10px] rounded-xl transition-all active:scale-95 flex items-center gap-1">
                        <i class="fa-solid fa-eye text-xs"></i> ส่องดู
                    </button>
                `;
            }

            // สร้าง Element แถวของพนักงานแต่ละคน (ปรับสไตล์ UI ตระกูล Dark Mode อิงตามธีมระบบของคุณ)
            const row = document.createElement('div');
            row.className = `flex justify-between items-center p-3 rounded-2xl border transition-all ${u.isBlocked
                ? 'bg-red-950/20 border-red-500/20 shadow-lg shadow-red-950/20'
                : 'bg-zinc-900/40 border-white/5'
                }`;

            row.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" 
                             class="w-9 h-9 rounded-xl object-cover border ${u.isBlocked ? 'border-red-500/40' : 'border-white/10'}">
                        ${u.isBlocked ? '<span class="absolute -top-1 -right-1 flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>' : ''}
                    </div>
                    <div>
                        <div class="font-bold text-xs ${u.isBlocked ? 'text-red-400' : 'text-white'}">
                            ${u.displayName || u.username || 'พนักงานไม่มีชื่อ'}
                        </div>
                        <div class="text-[9px] opacity-40 flex items-center gap-1.5 mt-0.5">
                            <span>ID: ${u.username || 'ไม่มีคีย์'}</span>
                            <span>•</span>
                            <span class="${u.isBlocked ? 'text-red-400/80 font-semibold' : ''}">
                                ${u.isBlocked ? `กรอกผิด ${u.failedAttempts || 0} ครั้ง` : (u.role || 'staff')}
                            </span>
                        </div>
                    </div>
                </div>
                <div>${actionBtnHtml}</div>
            `;

            userListDiv.appendChild(row);
        }
    });
}

// ฟังก์ชันสำหรับแอดมินกดปลดบล็อกด่วนหน้าห้อง Management
function unlockUserDirect(targetUid, displayName) {
    Swal.fire({
        title: 'ปลดล็อกบัญชี?',
        text: `คุณต้องการล้างประวัติการพิมพ์รหัสผ่านผิด และเปิดสิทธิ์ใช้งานให้คุณ "${displayName}" ทันทีใช่หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ปลดล็อกเลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#10b981', // สีเขียวสว่าง
        background: '#151517',
        color: '#fff',
        customClass: {
            popup: 'rounded-2xl border border-white/10'
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                pushLog(`กำลังปลดบล็อก ${displayName}...`, "info");

                // 🔓 ทำการเคลียร์ค่าล็อกบน Firebase Realtime Database
                await db.ref(`users/${targetUid}`).update({
                    isBlocked: false,
                    failedAttempts: 0
                });

                // บันทึก Log การสั่งปลดล็อกเพื่อเอาไว้ตรวจสอบย้อนหลังในหน้า Security Logs
                if (currentUser) {
                    await db.ref('security_logs').push({
                        uid: currentUser.uid,
                        email: currentUser.email,
                        timestamp: firebase.database.ServerValue.TIMESTAMP,
                        action: `ADMIN_UNLOCKED_USER: ${displayName} (${targetUid})`
                    }).catch(e => console.log(e));
                }

                Swal.fire({
                    title: 'ปลดล็อกสำเร็จ!',
                    text: `บัญชีของ ${displayName} ได้รับการปลดบล็อกเรียบร้อยแล้ว`,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false,
                    background: '#151517',
                    color: '#fff'
                });

            } catch (err) {
                console.error("Error unlocking user:", err);
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถแก้ไขข้อมูลได้เนื่องจากติดกฎความปลอดภัย', 'error');
            }
        }
    });
}


function initApp() {
    // กำหนด Target ID: ถ้าเป็นแอดมินส่องคนอื่นจะเป็น adminTargetId ถ้าพนักงานทั่วไปจะเป็น uid ตัวเอง
    const tid = adminTargetId || (currentUser ? currentUser.uid : null);
    if (!tid) return;

    // เฝ้าติดตามข้อมูลเฉพาะบุคคลนั้นๆ ไม่ดึงทั้งหมดข้ามพาร์ท ป้องกัน Permission Denied
    db.ref(`users/${tid}`).on('value', s => {
        targetInfo = s.val() || {};

        const displayElem = document.getElementById('u-display');
        const photoElem = document.getElementById('u-photo');
        const riderCard = document.getElementById('rider-card');

        if (displayElem) displayElem.innerText = targetInfo.displayName || 'User';
        if (photoElem) photoElem.src = targetInfo.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        if (riderCard) riderCard.classList.toggle('hidden', targetInfo.jobType !== 'delivery');

        calculateSalary();
    }, error => {
        console.error("initApp users ref error:", error);
    });

    db.ref(`attendance/${tid}`).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({
            id: k,
            ...d[k]
        })) : [];

        const today = new Date().toISOString().split('T')[0],
            tLog = logs.find(l => l.date === today);

        if (document.getElementById('today-bills')) {
            document.getElementById('today-bills').innerText = tLog ? (tLog.delivery || 0) : 0;
        }

        handleWorkTimer(tLog);
        renderCal();
        renderWeekly(targetInfo);
        calculateSalary();
    }, error => {
        console.error("initApp attendance ref error:", error);
    });
}

function renderWeekly(u) {
    const list = document.getElementById('week-list');
    if (!list) return;
    list.innerHTML = '';
    const names = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - today.getDay() + i);

        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const ds = `${Y}-${M}-${D}`;

        const log = logs.find(l => l.date === ds);
        const isOff = log && (log.isOff === true || log.isOff === "true");

        if (i === 7) {
            list.innerHTML += `<div class="pt-6 pb-2 border-b border-white/10 mb-2 px-2">
                <p class="text-[10px] font-bold text-blue-500 uppercase italic opacity-60">Next Week</p>
            </div>`;
        }

        const isToday = d.toDateString() === today.toDateString();
        const bgClass = isOff ?
            "bg-red-500/10 border-red-500/20 opacity-60" :
            (isToday ? "bg-blue-500/10 border-blue-500/40" : "bg-white/5 border-transparent");

        const iconColor = isOff ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-500";
        const timeText = isOff ? "วันหยุด (OFF)" : (log?.checkIn ? `${log.checkIn} - ${log.checkOut}` : "--:-- --:--");

        list.innerHTML += `
            <div onclick="openEditLog('${ds}')" 
                 class="glass-card p-4 flex justify-between items-center cursor-pointer active:scale-[0.98] transition-all border mb-1 ${bgClass}">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}">
                        <i class="fa-solid ${isOff ? 'fa-couch' : 'fa-clock'}"></i>
                    </div>
                    <div>
                        <p class="text-[9px] font-bold opacity-40 uppercase">${names[d.getDay()]}</p>
                        <p class="text-sm font-bold ${isOff ? 'text-red-200' : ''}">${d.getDate()} ${d.toLocaleDateString('th-TH', { month: 'short' })}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold ${isOff ? 'text-red-400' : 'text-blue-400'}">${timeText}</p>
                    <p class="text-[9px] font-bold uppercase opacity-40">${isOff ? 'OFF DAY' : (log?.delivery > 0 ? `BILLS: ${log.delivery}` : 'READY')}</p>
                </div>
            </div>`;
    }
}

function loadUserList() {
    // 🔒 ป้องกันไว้ก่อน: ถ้าไม่ใช่ admin ห้ามเรียกข้อมูลเด็ดขาด ป้องกัน PERMISSION_DENIED
    if (!myInfo || myInfo.role !== 'admin') {
        console.warn("Access denied: loadUserList is for admin only.");
        return;
    }

    db.ref('users').once('value', s => {
        const users = s.val();
        const container = document.getElementById('user-list');
        if (!container || !users) return;
        container.innerHTML = '';
        Object.keys(users).forEach(uid => {
            const u = users[uid];
            container.innerHTML += `
             <div onclick="viewUser('${uid}')" class="glass-card p-4 flex items-center gap-4 cursor-pointer active:scale-95 transition-transform">
                 <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-12 h-12 rounded-2xl object-cover border border-white/10">
                 <div class="flex-1">
                     <p class="font-bold text-sm">${u.displayName || u.username}</p>
                     <p class="text-[10px] opacity-40 uppercase">${u.jobType || 'staff'} | ${u.role || 'user'}</p>
                 </div>
                 <i class="fa-solid fa-chevron-right opacity-20 text-xs"></i>
             </div>`;
        });
    }).catch(error => {
        console.error("loadUserList error:", error);
    });
}

function viewUser(uid) {
    adminTargetId = uid;
    db.ref(`users/${uid}`).once('value', s => {
        const u = s.val();
        document.getElementById('remote-name').innerText = u.displayName || u.username;
        document.getElementById('remote-banner').classList.remove('hidden');
        go('p-home', document.querySelector('.nav-btn'));
        initApp();
    });
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('remote-banner').classList.add('hidden');
    initApp();
}

function renderCal() {
    const grid = document.getElementById('cal-days');
    if (!grid) return;
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const names = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('mon-view').innerText = `${names[m]} ${y + 543}`;
    grid.innerHTML = '';
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, log = logs.find(l => l.date === ds);
        const isOff = log && (log.isOff === true || log.isOff === 'true');
        const statusClass = log ? (isOff ? 'st-off' : 'st-normal') : 'bg-white/5';
        grid.innerHTML += `
         <div onclick="openEditLog('${ds}')" class="h-12 flex flex-col items-center justify-center rounded-xl text-sm cursor-pointer transition-all active:scale-90 ${statusClass}">
             <span class="font-bold">${d}</span>
             ${log?.delivery > 0 ? `<span class="text-[8px]">${log.delivery}</span>` : ''}
         </div>`;
    }
}

async function openEditLog(dateStr) {
    const log = logs.find(l => l.date === dateStr) || { date: dateStr, checkIn: '', checkOut: '', delivery: 0, isOff: false };
    const { value: result, isDenied } = await Swal.fire({
        title: `<span class="text-blue-400">วันที่ ${dateStr}</span>`,
        background: '#121212',
        color: '#fff',
        html: `
         <div class="text-left space-y-4 p-2 overflow-hidden">
             <div>
                 <label class="text-[10px] uppercase font-bold text-zinc-500 block mb-1">ประเภทวันทำงาน</label>
                 <select id="swal-off" class="w-full p-4 bg-zinc-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
                     <option value="false" ${!log.isOff ? 'selected' : ''}>วันทำงานปกติ (ON)</option>
                     <option value="true" ${log.isOff ? 'selected' : ''}>วันหยุดประจำสัปดาห์ (OFF)</option>
                 </select>
             </div>
             <div class="grid grid-cols-2 gap-3">
                 <div>
                     <label class="text-[10px] uppercase font-bold text-zinc-500 block mb-1">เวลาเข้างาน</label>
                     <input type="time" id="swal-in" value="${log.checkIn || ''}" class="w-full p-4 bg-zinc-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
                 </div>
                 <div>
                     <label class="text-[10px] uppercase font-bold text-zinc-500 block mb-1">เวลาออกงาน</label>
                     <input type="time" id="swal-out" value="${log.checkOut || ''}" class="w-full p-4 bg-zinc-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
                 </div>
             </div>
             <div>
                 <label class="text-[10px] uppercase font-bold text-zinc-500 block mb-1">จำนวนบิลส่งของ (เฉพาะเดลิเวอรี่)</label>
                 <input type="number" id="swal-bill" value="${log.delivery || 0}" class="w-full p-4 bg-zinc-900 border border-white/10 rounded-xl text-sm text-white focus:outline-none">
             </div>
         </div>`,
        showCancelButton: true,
        showDenyButton: log.id ? true : false,
        confirmButtonText: 'บันทึกข้อมูล',
        denyButtonText: 'ลบข้อมูลประจำวันนี้',
        cancelButtonText: 'ยกเลิก',
        customClass: {
            confirmButton: 'bg-blue-600 text-white px-8 py-4 m-2 rounded-2xl w-full sm:w-auto text-sm',
            denyButton: 'bg-red-500/20 text-red-500 px-8 py-4 m-2 rounded-2xl w-full sm:w-auto text-sm font-bold',
            cancelButton: 'bg-white/5 text-white/50 px-8 py-4 m-2 rounded-2xl w-full sm:w-auto text-sm'
        },
        preConfirm: () => ({
            isOff: document.getElementById('swal-off').value === 'true',
            checkIn: document.getElementById('swal-in').value,
            checkOut: document.getElementById('swal-out').value,
            delivery: parseInt(document.getElementById('swal-bill').value) || 0
        })
    });

    const tid = adminTargetId || currentUser.uid;
    if (isDenied) {
        confirmAction('ต้องการลบข้อมูลวันนี้ใช่ไหม?', async () => {
            await db.ref(`attendance/${tid}/${log.id}`).remove();
            pushLog("ลบข้อมูลแล้ว", "info");
        });
    } else if (result) {
        if (log.id) await db.ref(`attendance/${tid}/${log.id}`).update(result);
        else await db.ref(`attendance/${tid}`).push({ ...result, date: dateStr });
        pushLog("บันทึกสำเร็จ");
    }
}

async function saveProfile() {
    // เลือกเป้าหมาย UID ปลายทางที่จะบันทึกให้ชัดเจน
    const tid = adminTargetId || (currentUser ? currentUser.uid : null);
    if (!tid) return pushLog("ไม่พบข้อมูลผู้ใช้งานในการบันทึก", "error");

    const updateData = {
        displayName: document.getElementById('edit-name').value.trim(),
        photoURL: document.getElementById('edit-photo').value.trim()
    };

    const newPw = document.getElementById('edit-pw').value.trim();
    if (newPw) {
        if (newPw.length < 6) return pushLog("รหัสผ่านสั้นเกินไป", "warning");
        if (tid === currentUser.uid) await currentUser.updatePassword(newPw);
        else updateData.tempPassword = newPw;
    }

    if (myInfo && myInfo.role === 'admin') {
        updateData.salary = parseInt(document.getElementById('edit-salary').value) || 0;
        updateData.billRate = parseInt(document.getElementById('edit-bill-rate').value) || 0;
        updateData.jobType = document.getElementById('edit-job').value;
        updateData.role = document.getElementById('edit-role').value;
    }

    // บันทึกแบบเจาะจงจุดพาร์ทรายบุคคล
    db.ref(`users/${tid}`).update(updateData).then(() => {
        pushLog("บันทึกเรียบร้อย");
        closeProfileModal();
    }).catch(error => {
        console.error("Error saving profile:", error);
        Swal.fire("สิทธิ์ไม่ถูกต้อง", "คุณไม่มีสิทธิ์แก้ไขข้อมูลในตำแหน่งนี้", "error");
    });
}

function openProfileModal() {
    const tid = adminTargetId || currentUser.uid;
    db.ref(`users/${tid}`).once('value', s => {
        const u = s.val() || {};
        document.getElementById('edit-user').value = u.username || '';
        document.getElementById('edit-email').value = u.email || '';
        document.getElementById('edit-name').value = u.displayName || '';
        document.getElementById('edit-photo').value = u.photoURL || '';
        document.getElementById('edit-photo-preview').src = u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

        const adminFields = document.getElementById('admin-fields');
        if (myInfo.role === 'admin') {
            adminFields.classList.remove('hidden');
            document.getElementById('edit-salary').value = u.salary || 0;
            document.getElementById('edit-bill-rate').value = u.billRate || 0;
            document.getElementById('edit-job').value = u.jobType || 'staff';
            document.getElementById('edit-role').value = u.role || 'user';
        } else {
            adminFields.classList.add('hidden');
        }
        document.getElementById('profile-modal').classList.remove('hidden');
    });
}

function closeProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}

function handleWorkTimer(log) {
    const display = document.getElementById('work-timer');
    if (!display) return;
    clearInterval(timerInterval);

    if (log?.checkIn && !log?.checkOut) {
        const start = new Date(`${log.date}T${log.checkIn}:00`);
        timerInterval = setInterval(() => {
            const now = new Date();
            const diff = now - start;
            display.innerText = formatDiff(diff);
        }, 1000);
    } else if (log?.checkIn && log?.checkOut) {
        const start = new Date(`${log.date}T${log.checkIn}:00`);
        let end = new Date(`${log.date}T${log.checkOut}:00`);
        if (end < start) {
            end.setDate(end.getDate() + 1);
        }
        display.innerText = formatDiff(end - start);
    } else {
        display.innerText = "00:00:00";
    }
}

function formatDiff(ms) {
    let s = Math.floor(Math.max(0, ms) / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function go(id, btn) {
    const pages = document.querySelectorAll('.page');
    const targetPage = document.getElementById(id);
    if (!targetPage) return;
    pages.forEach(p => {
        p.classList.remove('active');
        p.style.opacity = '0';
    });
    targetPage.classList.add('active');
    setTimeout(() => {
        targetPage.style.opacity = '1';
    }, 10);
    if (btn) {
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('active');
        });
        btn.classList.add('active');
    }
}

function moveMonth(dir) {
    viewDate.setMonth(viewDate.getMonth() + dir);
    renderCal();
}

function pushLog(msg, icon = "success") {
    Swal.fire({
        text: msg,
        icon: icon,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        background: '#151517',
        color: '#fff'
    });
}

function confirmAction(title, callback) {
    Swal.fire({
        title: title,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก',
        background: '#151517',
        color: '#fff'
    }).then(result => {
        if (result.isConfirmed) callback();
    });
}

async function tapIn() {
    const tid = adminTargetId || currentUser.uid;
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0].substring(0, 5);

    const log = logs.find(l => l.date === today);
    if (log?.checkIn) return pushLog("คุณลงเวลาเข้างานไปแล้ววันนี้", "warning");

    if (log?.id) {
        await db.ref(`attendance/${tid}/${log.id}`).update({ checkIn: time });
    } else {
        await db.ref(`attendance/${tid}`).push({ date: today, checkIn: time, delivery: 0, isOff: false });
    }
    pushLog("ลงเวลาเข้างานสำเร็จ");
}

async function tapOut() {
    const tid = adminTargetId || currentUser.uid;
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0].substring(0, 5);

    const log = logs.find(l => l.date === today);
    if (!log?.checkIn) return pushLog("ยังไม่ได้ลงเวลาเข้างาน", "warning");
    if (log?.checkOut) return pushLog("คุณลงเวลาออกงานไปแล้ววันนี้", "warning");

    await db.ref(`attendance/${tid}/${log.id}`).update({ checkOut: time });
    pushLog("ลงเวลาออกงานสำเร็จ");
}

async function addDelivery(val) {
    const tid = adminTargetId || currentUser.uid;
    const today = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === today);

    if (!log) return pushLog("ต้องมีประวัติงานของวันนี้ก่อนจึงจะเพิ่มบิลได้", "warning");
    let current = log.delivery || 0;
    let nextVal = Math.max(0, current + val);

    await db.ref(`attendance/${tid}/${log.id}`).update({ delivery: nextVal });
}

function calculateSalary() {
    const viewY = viewDate.getFullYear(), viewM = viewDate.getMonth();
    const baseSal = targetInfo.salary || 0;
    const bRate = targetInfo.billRate || 0;
    const isRider = targetInfo.jobType === 'delivery';

    let totalBills = 0, workDays = 0;

    logs.forEach(l => {
        if (!l.date) return;
        const [ly, lm] = l.date.split('-').map(Number);
        if (ly === viewY && (lm - 1) === viewM) {
            if (l.checkIn && l.checkOut && !l.isOff) workDays++;
            if (isRider && l.delivery) totalBills += parseInt(l.delivery) || 0;
        }
    });

    let extraIncome = totalBills * bRate;
    let totalEarnings = baseSal + extraIncome;

    const salaryView = document.getElementById('salary-view');
    const salaryDetail = document.getElementById('salary-detail');

    if (salaryView) salaryView.innerText = totalEarnings.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (salaryDetail) {
        if (isRider) {
            salaryDetail.innerHTML = `ฐานเงินเดือน: ฿${baseSal.toLocaleString()} | ทำงาน: ${workDays} วัน | บิลรวม: ${totalBills} บิล (+฿${extraIncome.toLocaleString()})`;
        } else {
            salaryDetail.innerHTML = `ฐานเงินเดือน: ฿${baseSal.toLocaleString()} | ทำงานประจำเดือน: ${workDays} วัน`;
        }
    }
}

async function unblockUser(uid) {
    Swal.fire({
        title: 'ปลดบล็อกผู้ใช้นี้?',
        text: "ผู้ใช้นี้จะสามารถเข้าใช้งานระบบได้ทันที",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#d33',
        confirmButtonText: 'ใช่, ปลดบล็อกเลย',
        background: '#151517',
        color: '#fff'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await db.ref(`users/${uid}`).update({
                    failedAttempts: 0,
                    isBlocked: false
                });
                Swal.fire('สำเร็จ!', 'ปลดบล็อกบัญชีเรียบร้อยแล้ว', 'success');
                renderUserList(); // อัปเดตรายชื่อทันที
            } catch (e) {
                Swal.fire('ข้อผิดพลาด', 'ไม่สามารถปลดบล็อกได้ในขณะนี้', 'error');
            }
        }
    });
}

async function changeAdminPin() {
    if (myInfo.role !== 'admin') return pushLog("เฉพาะแอดมินเท่านั้น", "error");
    const { value: newPin } = await Swal.fire({
        title: 'ตั้งค่ารหัสผ่านลับควบคุมระบบ',
        input: 'password',
        inputPlaceholder: 'กรอกรหัสลับใหม่ที่นี่...',
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        background: '#1c1c1e',
        color: '#fff'
    });
    if (newPin) {
        if (newPin.trim().length < 4) return Swal.fire('ล้มเหลว', 'ควรตั้งรหัสอย่างน้อย 4 ตัวอักษรขึ้นไป', 'error');
        await db.ref('settings/adminPin').set(newPin);
        pushLog("อัปเดตรหัสลับความปลอดภัยสำเร็จแล้ว");
    }
}

async function viewSecurityLogs() {
    if (myInfo.role !== 'admin') return pushLog("เฉพาะแอดมินเท่านั้น", "error");
    try {
        const snap = await db.ref('security_logs').orderByChild('timestamp').limitToLast(50).once('value');
        let logsHtml = `<div class="text-left text-xs space-y-2 max-h-96 overflow-y-auto pr-1">`;
        const logsList = [];
        snap.forEach(child => {
            logsList.push(child.val());
        });
        logsList.reverse();

        logsList.forEach(l => {
            const dateStr = new Date(l.timestamp).toLocaleString('th-TH');
            logsHtml += `
                <div class="p-2.5 bg-white/5 border border-white/5 rounded-xl space-y-1">
                    <div class="flex justify-between font-bold text-blue-400">
                        <span>${l.action || 'LOG'}</span>
                        <span class="text-zinc-500">${l.ip || '0.0.0.0'}</span>
                    </div>
                    <div class="text-zinc-400">${l.email || 'unknown'}</div>
                    <div class="text-[10px] text-zinc-500 opacity-80">${l.location || 'Unknown'} (${l.isp || 'ISP'})</div>
                    <div class="text-[10px] text-zinc-500 text-right font-medium pt-1 border-t border-white/5">${dateStr}</div>
                </div>`;
        });
        logsHtml += `</div>`;

        Swal.fire({
            title: 'Security Control Center',
            html: logsHtml,
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-unlock-keyhole mr-2"></i>ปลดบล็อกผู้ใช้ทั้งหมด',
            cancelButtonText: 'ปิดหน้าต่าง',
            confirmButtonColor: '#10b981',
            background: '#151517',
            color: '#fff',
            customClass: { popup: 'rounded-2xl border border-white/10' }
        }).then(async result => {
            if (result.isConfirmed) {
                const usersSnap = await db.ref('users').once('value');
                let count = 0;
                usersSnap.forEach(child => {
                    if (child.val().isBlocked) {
                        db.ref(`users/${child.key}`).update({ isBlocked: false, failedAttempts: 0 });
                        count++;
                    }
                });
                Swal.fire('สำเร็จ', `ปลดบล็อกบัญชีผู้ใช้งานเรียบร้อยแล้วทั้งหมด ${count} บัญชี`, 'success');
            }
        });
    } catch (e) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูล Logs ได้', 'error');
    }
}

// 🟥 3. เพิ่มฟังก์ชันการออกจากระบบอย่างปลอดภัยไว้ด้านล่างสุดของไฟล์ (ห้ามลบโค้ดเก่าเด็ดขาด)
async function handleLogout() {
    const result = await Swal.fire({
        title: 'ยืนยันการออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        background: '#151517',
        color: '#fff'
    });

    if (result.isConfirmed) {
        try {
            // ปิด Listener ก่อนออกจากระบบเพื่อป้องกันการรันโค้ดค้าง
            if (currentUser) {
                db.ref(`users/${currentUser.uid}`).off();
                await db.ref(`users/${currentUser.uid}/currentSessionId`).remove();
            }
            await auth.signOut();
            localSessionId = null;
            location.reload(); // รีเฟรชชัวร์ที่สุด
        } catch (error) {
            console.error("Logout Error:", error);
            pushLog("เกิดข้อผิดพลาดในการออกจากระบบ", "error");
        }
    }
}
// ฟังก์ชันดึงรายชื่อพนักงานที่ติดบล็อกมาแสดง
async function renderBlockedStaffList() {
    const listContainer = document.getElementById('blocked-user-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="text-xs opacity-50 text-center py-4">กำลังตรวจสอบสถานะ...</div>';

    try {
        const snap = await db.ref('users').once('value');
        listContainer.innerHTML = '';

        let hasBlocked = false;

        snap.forEach(child => {
            const user = child.val();
            const uid = child.key;

            if (user.isBlocked) {
                hasBlocked = true;
                const div = document.createElement('div');
                // ใส่คลาส blink-alert เพื่อให้ไฟกะพริบ
                div.className = "flex items-center justify-between p-3 rounded-xl blink-alert transition-all mb-2";

                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <div>
                            <div class="text-sm font-bold">${user.email || 'No Email'}</div>
                            <div class="text-[10px] text-red-400">สถานะ: ถูกบล็อก (Failed: ${user.failedAttempts || 0}/5)</div>
                        </div>
                    </div>
                    <button onclick="unblockSpecificUser('${uid}')" 
                            class="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-300 text-[10px] font-bold rounded-lg border border-red-500/30 transition-all">
                        🔓 ปลดบล็อก
                    </button>
                `;
                listContainer.appendChild(div);
            }
        });

        if (!hasBlocked) {
            listContainer.innerHTML = '<div class="text-xs opacity-50 text-center py-4">ไม่มีพนักงานที่ติดบล็อก</div>';
        }
    } catch (e) {
        console.error(e);
    }
}

// ฟังก์ชันปลดบล็อกรายบุคคล
async function unblockSpecificUser(uid) {
    Swal.fire({
        title: 'ยืนยันปลดบล็อก?',
        text: "พนักงานคนนี้จะสามารถกลับเข้าใช้งานระบบได้ทันที",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ปลดบล็อก',
        cancelButtonText: 'ยกเลิก',
        background: '#151517',
        color: '#fff'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await db.ref(`users/${uid}`).update({
                isBlocked: false,
                failedAttempts: 0
            });
            Swal.fire('สำเร็จ', 'ปลดบล็อกเรียบร้อยแล้ว', 'success');
            renderBlockedStaffList(); // อัปเดตรายการใหม่ทันที
        }
    });
}