"use strict";

/*
|--------------------------------------------------------------------------
| DESA-SYNC
| Digital Village Accountability
|--------------------------------------------------------------------------
| Architecture:
| - Vanilla ES6+
| - LocalForage / IndexedDB
| - Chart.js
| - CryptoJS SHA-256
| - QRCode.js
| - Offline-first state
| - Simulated delta-CRDT synchronization
|--------------------------------------------------------------------------
*/


/* ============================================================
   1. GLOBAL CONFIGURATION
============================================================ */

const APP_CONFIG = {
    appName: "DESA-SYNC",
    version: "1.0.0",

    budget: 1_000_000_000,

    credentials: {
        username: "kades_3t",
        password: "indonesiaemas2045"
    },

    ssh: {
        Semen: 75_000,
        Laptop: 10_000_000,
        Kertas: 50_000
    },

    markup: {
        normal: 0,
        warning: 0.20,
        blocked: 0.20
    },

    storageKeys: {
        transactions: "desa_sync_transactions",
        auditLogs: "desa_sync_audit_logs",
        pendingSync: "desa_sync_pending_sync",
        session: "desa_sync_session"
    }
};


/* ============================================================
   2. APPLICATION STATE
============================================================ */

const state = {
    currentSection: "dashboard",

    currentUser: null,

    transactions: [],

    auditLogs: [],

    pendingSync: [],

    online: navigator.onLine,

    chart: null,

    syncSequence: 0
};


/* ============================================================
   3. DOM REFERENCES
============================================================ */

const DOM = {};

function cacheDOM() {

    const ids = [
        "login-screen",
        "login-form",
        "username",
        "password",
        "role",
        "toggle-password",
        "login-button",

        "app-shell",
        "sidebar",
        "topbar",

        "sidebar-user-name",
        "sidebar-user-role",

        "logout-button",

        "network-toggle",
        "network-dot",
        "network-label",

        "page-title",
        "page-eyebrow",

        "metric-budget",
        "metric-realization",
        "metric-realization-percent",
        "metric-silpa",

        "transaction-chart",
        "audit-count",

        "transaction-form",
        "item-name",
        "item-volume",
        "item-price",

        "transaction-table-body",
        "empty-transactions",
        "transaction-count",

        "spj-table-body",
        "spj-eligible-count",
        "spj-justification-count",

        "print-spj-button",
        "print-table-body",
        "qrcode",

        "crdt-console",

        "toast-container",
        "modal-root"
    ];

    ids.forEach(id => {
        DOM[id] = document.getElementById(id);
    });

    DOM.sections = {
        dashboard: document.getElementById("section-dashboard"),
        pbj: document.getElementById("section-pbj"),
        spj: document.getElementById("section-spj"),
        crdt: document.getElementById("section-crdt")
    };

    DOM.navItems = document.querySelectorAll("[data-section]");
}


/* ============================================================
   4. LOCALFORAGE
============================================================ */

const db = localforage.createInstance({
    name: "DESA-SYNC",
    storeName: "desa_sync_store",
    description: "Offline-first village accountability database"
});


/* ============================================================
   5. UTILITY FUNCTIONS
============================================================ */

function generateId(prefix = "DS") {

    const timestamp = Date.now().toString(36);

    const random = Math.random()
        .toString(36)
        .substring(2, 10);

    return `${prefix}-${timestamp}-${random}`;
}


function formatRupiah(value) {

    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}


function formatNumber(value) {

    return new Intl.NumberFormat("id-ID", {
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}


function formatDateTime(dateValue) {

    const date = new Date(dateValue);

    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}


function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function sleep(ms) {

    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}


function getSSHPrice(itemName) {

    const normalized = String(itemName)
        .trim()
        .toLowerCase();

    const key = Object.keys(APP_CONFIG.ssh)
        .find(item => item.toLowerCase() === normalized);

    return key ? APP_CONFIG.ssh[key] : null;
}


function calculateMarkup(actualPrice, basePrice) {

    if (!basePrice || basePrice <= 0) {
        return null;
    }

    return (actualPrice - basePrice) / basePrice;
}


function getTransactionStatus(markup) {

    if (markup <= 0) {
        return {
            tier: 1,
            code: "WAJAR",
            label: "Wajar",
            color: "green"
        };
    }

    if (markup <= APP_CONFIG.markup.warning) {
        return {
            tier: 2,
            code: "JUSTIFIKASI",
            label: "Justifikasi",
            color: "yellow"
        };
    }

    return {
        tier: 3,
        code: "DITOLAK",
        label: "Diblokir",
        color: "red"
    };
}


/* ============================================================
   6. TOAST SYSTEM
============================================================ */

function showToast({
    title,
    message,
    type = "info",
    duration = 4500
}) {

    const colors = {
        success: {
            icon: "fa-circle-check",
            iconColor: "text-emerald-500",
            border: "border-emerald-100"
        },

        warning: {
            icon: "fa-triangle-exclamation",
            iconColor: "text-amber-500",
            border: "border-amber-100"
        },

        error: {
            icon: "fa-circle-xmark",
            iconColor: "text-red-500",
            border: "border-red-100"
        },

        info: {
            icon: "fa-circle-info",
            iconColor: "text-indigo-500",
            border: "border-indigo-100"
        }
    };

    const theme = colors[type] || colors.info;

    const toast = document.createElement("div");

    toast.className = `
        pointer-events-auto
        bg-white
        border
        ${theme.border}
        shadow-2xl
        rounded-2xl
        p-4
        flex
        gap-3
        translate-x-[120%]
        transition-transform
        duration-300
    `;

    toast.innerHTML = `
        <div class="flex-shrink-0 mt-0.5">
            <i class="fa-solid ${theme.icon} ${theme.iconColor}"></i>
        </div>

        <div class="min-w-0 flex-1">
            <div class="font-bold text-sm text-slate-800">
                ${escapeHTML(title)}
            </div>

            <div class="text-xs text-slate-500 mt-1 leading-5">
                ${escapeHTML(message)}
            </div>
        </div>

        <button
            type="button"
            class="toast-close text-slate-300 hover:text-slate-600"
            aria-label="Tutup"
        >
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    DOM["toast-container"].appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove("translate-x-[120%]");
    });

    const removeToast = () => {

        toast.classList.add("translate-x-[120%]");

        setTimeout(() => {
            toast.remove();
        }, 300);
    };

    toast
        .querySelector(".toast-close")
        .addEventListener("click", removeToast);

    setTimeout(removeToast, duration);
}


/* ============================================================
   7. MODAL SYSTEM
============================================================ */

function closeModal() {

    DOM["modal-root"].classList.add("hidden");

    DOM["modal-root"].innerHTML = "";
}


function openModal({
    title,
    message,
    type = "info",
    confirmText = "Konfirmasi",
    cancelText = "Batal",
    showCancel = true,
    onConfirm = null
}) {

    const theme = {
        info: {
            icon: "fa-circle-info",
            iconBg: "bg-indigo-50",
            iconColor: "text-indigo-600",
            button: "bg-indigo-600 hover:bg-indigo-700"
        },

        warning: {
            icon: "fa-triangle-exclamation",
            iconBg: "bg-amber-50",
            iconColor: "text-amber-600",
            button: "bg-amber-500 hover:bg-amber-600"
        },

        error: {
            icon: "fa-shield-halved",
            iconBg: "bg-red-50",
            iconColor: "text-red-600",
            button: "bg-red-600 hover:bg-red-700"
        },

        success: {
            icon: "fa-circle-check",
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600",
            button: "bg-emerald-600 hover:bg-emerald-700"
        }
    }[type];

    DOM["modal-root"].innerHTML = `
        <div class="absolute inset-0 modal-backdrop flex items-center justify-center p-5">

            <div
                class="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-white overflow-hidden"
            >

                <div class="p-6">

                    <div class="flex items-start gap-4">

                        <div class="w-12 h-12 rounded-2xl ${theme.iconBg} ${theme.iconColor} flex items-center justify-center flex-shrink-0">
                            <i class="fa-solid ${theme.icon} text-lg"></i>
                        </div>

                        <div class="flex-1">

                            <h3 class="text-lg font-extrabold text-slate-900">
                                ${escapeHTML(title)}
                            </h3>

                            <div class="text-sm text-slate-500 mt-2 leading-6">
                                ${message}
                            </div>

                        </div>

                    </div>

                    <div class="mt-6 flex gap-3">

                        ${
                            showCancel
                                ? `
                                    <button
                                        id="modal-cancel"
                                        class="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition"
                                    >
                                        ${escapeHTML(cancelText)}
                                    </button>
                                  `
                                : ""
                        }

                        <button
                            id="modal-confirm"
                            class="flex-1 h-11 rounded-xl ${theme.button} text-white font-bold text-sm transition"
                        >
                            ${escapeHTML(confirmText)}
                        </button>

                    </div>

                </div>

            </div>

        </div>
    `;

    DOM["modal-root"].classList.remove("hidden");

    const cancelButton = document.getElementById("modal-cancel");

    if (cancelButton) {
        cancelButton.addEventListener("click", closeModal);
    }

    document
        .getElementById("modal-confirm")
        .addEventListener("click", async () => {

            if (typeof onConfirm === "function") {
                await onConfirm();
            }

            closeModal();
        });
}


/* ============================================================
   8. LOGIN
============================================================ */

function initializeAuth() {

    DOM["toggle-password"].addEventListener("click", () => {

        const input = DOM["password"];
        const icon = DOM["toggle-password"].querySelector("i");

        if (input.type === "password") {
            input.type = "text";
            icon.className = "fa-solid fa-eye-slash";
        } else {
            input.type = "password";
            icon.className = "fa-solid fa-eye";
        }
    });


    DOM["login-form"].addEventListener("submit", async event => {

        event.preventDefault();

        const username = DOM["username"].value.trim();
        const password = DOM["password"].value;
        const role = DOM["role"].value;

        const loginButton = DOM["login-button"];

        if (
            username !== APP_CONFIG.credentials.username ||
            password !== APP_CONFIG.credentials.password
        ) {

            showToast({
                title: "Autentikasi gagal",
                message: "Username atau password tidak valid.",
                type: "error"
            });

            return;
        }


        loginButton.disabled = true;

        loginButton.innerHTML = `
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <span>Memvalidasi Device ID...</span>
        `;

        await sleep(900);

        loginButton.innerHTML = `
            <i class="fa-solid fa-fingerprint fa-spin"></i>
            <span>Verifikasi perangkat...</span>
        `;

        await sleep(1000);

        loginButton.innerHTML = `
            <i class="fa-solid fa-shield-check"></i>
            <span>Otorisasi...</span>
        `;

        await sleep(700);


        state.currentUser = {
            username,
            role,
            loggedAt: new Date().toISOString(),
            deviceId: generateDeviceFingerprint()
        };


        await db.setItem(
            APP_CONFIG.storageKeys.session,
            state.currentUser
        );


        loginButton.disabled = false;

        loginButton.innerHTML = `
            <span>Masuk ke Sistem</span>
            <i class="fa-solid fa-arrow-right"></i>
        `;

        DOM["login-screen"].classList.add("hidden");

        DOM["app-shell"].classList.remove("hidden");

        updateUserProfile();

        showToast({
            title: "Device tervalidasi",
            message: "Sesi DESA-SYNC berhasil diinisialisasi.",
            type: "success"
        });

        await initializeApplication();
    });
}


function generateDeviceFingerprint() {

    const raw = [
        navigator.userAgent,
        navigator.language,
        navigator.platform,
        window.screen.width,
        window.screen.height,
        window.devicePixelRatio
    ].join("|");

    return CryptoJS.SHA256(raw).toString().substring(0, 16).toUpperCase();
}


async function restoreSession() {

    try {

        const session = await db.getItem(
            APP_CONFIG.storageKeys.session
        );

        if (!session) {
            return false;
        }

        state.currentUser = session;

        DOM["login-screen"].classList.add("hidden");

        DOM["app-shell"].classList.remove("hidden");

        updateUserProfile();

        return true;

    } catch (error) {

        console.error("Session restoration error:", error);

        return false;
    }
}


function updateUserProfile() {

    if (!state.currentUser) {
        return;
    }

    const isInspector =
        state.currentUser.role === "inspektorat";

    DOM["sidebar-user-name"].textContent =
        isInspector
            ? "Inspektorat"
            : "Kaur Keuangan";

    DOM["sidebar-user-role"].textContent =
        isInspector
            ? "Auditor / Monitoring"
            : "Operator Keuangan Desa";
}


/* ============================================================
   9. LOGOUT
============================================================ */

function initializeLogout() {

    DOM["logout-button"].addEventListener("click", () => {

        openModal({
            title: "Keluar dari DESA-SYNC?",
            message:
                "Data lokal tetap tersimpan di perangkat. Anda hanya akan mengakhiri sesi pengguna.",
            type: "warning",
            confirmText: "Ya, Keluar",
            cancelText: "Batal",
            onConfirm: async () => {

                state.currentUser = null;

                await db.removeItem(
                    APP_CONFIG.storageKeys.session
                );

                DOM["app-shell"].classList.add("hidden");

                DOM["login-screen"].classList.remove("hidden");

                DOM["password"].value = "";

                showToast({
                    title: "Sesi berakhir",
                    message: "Anda telah keluar dari DESA-SYNC.",
                    type: "info"
                });
            }
        });
    });
}


/* ============================================================
   10. NAVIGATION
============================================================ */

const SECTION_META = {
    dashboard: {
        title: "Dasbor Utama",
        eyebrow: "Command Center"
    },

    pbj: {
        title: "Pengadaan PBJ",
        eyebrow: "Procurement Intelligence"
    },

    spj: {
        title: "Laporan SPJ",
        eyebrow: "Accountability"
    },

    crdt: {
        title: "Konsol δ-CRDT",
        eyebrow: "Developer / Jury View"
    }
};


function initializeNavigation() {

    DOM.navItems.forEach(item => {

        item.addEventListener("click", () => {

            const section = item.dataset.section;

            navigateTo(section);
        });
    });
}


function navigateTo(section) {

    if (!DOM.sections[section]) {
        return;
    }

    state.currentSection = section;

    Object.entries(DOM.sections).forEach(
        ([key, element]) => {

            if (key === section) {
                element.classList.remove("hidden-section");
            } else {
                element.classList.add("hidden-section");
            }
        }
    );


    DOM.navItems.forEach(item => {

        const active =
            item.dataset.section === section;

        item.classList.toggle(
            "bg-indigo-600",
            active
        );

        item.classList.toggle(
            "text-white",
            active
        );

        item.classList.toggle(
            "text-slate-400",
            !active
        );

        item.classList.toggle(
            "hover:bg-white/5",
            !active
        );
    });


    const meta = SECTION_META[section];

    DOM["page-title"].textContent = meta.title;

    DOM["page-eyebrow"].textContent = meta.eyebrow;


    if (section === "dashboard") {
        updateDashboard();
    }

    if (section === "spj") {
        renderSPJ();
    }

    if (section === "crdt") {
        renderCRDTInitialState();
    }
}


/* ============================================================
   11. NETWORK STATUS
============================================================ */

function initializeNetworkStatus() {

    updateNetworkUI();


    window.addEventListener("offline", async () => {

        state.online = false;

        updateNetworkUI();

        appendCRDTLog(
            "[NETWORK] Connection lost. Edge node switched to OFFLINE mode.",
            "warning"
        );

        showToast({
            title: "Mode Luring",
            message:
                "Koneksi terputus. Data tetap dapat disimpan secara lokal.",
            type: "warning"
        });
    });


    window.addEventListener("online", async () => {

        state.online = true;

        updateNetworkUI();

        appendCRDTLog(
            "[NETWORK] Connection restored. Starting delta reconciliation...",
            "success"
        );

        await synchronizePendingData();
    });


    DOM["network-toggle"].addEventListener("click", () => {

        /*
         * Browser networking state cannot safely be changed by JS.
         * The button therefore provides a simulated network toggle
         * for the competition demonstration.
         */

        const newState = !state.online;

        state.online = newState;

        updateNetworkUI();

        if (newState) {
            synchronizePendingData();
        } else {

            appendCRDTLog(
                "[SIMULATION] Manual offline mode enabled by operator.",
                "warning"
            );

            showToast({
                title: "Mode Luring",
                message:
                    "Simulasi koneksi offline aktif. Data baru masuk antrean delta.",
                type: "warning"
            });
        }
    });
}


function updateNetworkUI() {

    const dot = DOM["network-dot"];
    const label = DOM["network-label"];

    if (state.online) {

        DOM["network-toggle"].className =
            "flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold";

        dot.className =
            "w-2 h-2 rounded-full bg-emerald-500 pulse-dot";

        label.textContent = "Daring";

    } else {

        DOM["network-toggle"].className =
            "flex items-center gap-2 px-3.5 py-2 rounded-full bg-red-50 border border-red-100 text-red-700 text-xs font-bold";

        dot.className =
            "w-2 h-2 rounded-full bg-red-500";

        label.textContent = "Luring";
    }
}


/* ============================================================
   12. LOCAL DATA LOADING
============================================================ */

async function loadLocalData() {

    try {

        const transactions =
            await db.getItem(
                APP_CONFIG.storageKeys.transactions
            );

        const auditLogs =
            await db.getItem(
                APP_CONFIG.storageKeys.auditLogs
            );

        const pendingSync =
            await db.getItem(
                APP_CONFIG.storageKeys.pendingSync
            );


        state.transactions =
            Array.isArray(transactions)
                ? transactions
                : [];

        state.auditLogs =
            Array.isArray(auditLogs)
                ? auditLogs
                : [];

        state.pendingSync =
            Array.isArray(pendingSync)
                ? pendingSync
                : [];


    } catch (error) {

        console.error("Local data loading failed:", error);

        state.transactions = [];
        state.auditLogs = [];
        state.pendingSync = [];
    }
}


async function persistTransactions() {

    await db.setItem(
        APP_CONFIG.storageKeys.transactions,
        state.transactions
    );
}


async function persistAuditLogs() {

    await db.setItem(
        APP_CONFIG.storageKeys.auditLogs,
        state.auditLogs
    );
}


async function persistPendingSync() {

    await db.setItem(
        APP_CONFIG.storageKeys.pendingSync,
        state.pendingSync
    );
}


/* ============================================================
   13. DASHBOARD CHART
============================================================ */

function initializeChart() {

    const context =
        DOM["transaction-chart"].getContext("2d");

    state.chart = new Chart(context, {

        type: "doughnut",

        data: {
            labels: [
                "Transaksi Wajar",
                "Transaksi Anomali"
            ],

            datasets: [
                {
                    data: [0, 0],

                    backgroundColor: [
                        "#10b981",
                        "#f59e0b"
                    ],

                    borderColor: [
                        "#ffffff",
                        "#ffffff"
                    ],

                    borderWidth: 5,

                    hoverOffset: 7
                }
            ]
        },

        options: {

            responsive: true,

            maintainAspectRatio: false,

            cutout: "72%",

            plugins: {

                legend: {
                    position: "bottom",

                    labels: {
                        usePointStyle: true,
                        padding: 22,
                        font: {
                            family: "Inter",
                            size: 12,
                            weight: "600"
                        }
                    }
                },

                tooltip: {
                    callbacks: {
                        label: function(context) {

                            const value =
                                context.raw || 0;

                            return ` ${context.label}: ${value}`;
                        }
                    }
                }
            }
        }
    });

    updateChart();
}


function updateChart() {

    if (!state.chart) {
        return;
    }

    const normalCount =
        state.transactions.filter(
            transaction =>
                transaction.statusCode === "WAJAR"
        ).length;

    const anomalyCount =
        state.transactions.filter(
            transaction =>
                transaction.statusCode !== "WAJAR"
        ).length;


    state.chart.data.datasets[0].data = [
        normalCount,
        anomalyCount
    ];

    state.chart.update();
}


/* ============================================================
   14. DASHBOARD METRICS
============================================================ */

function getTotalRealization() {

    return state.transactions.reduce(
        (sum, transaction) =>
            sum + Number(transaction.totalPrice || 0),
        0
    );
}


function updateDashboard() {

    const realization =
        getTotalRealization();

    const silpa =
        Math.max(
            APP_CONFIG.budget - realization,
            0
        );

    const realizationPercent =
        APP_CONFIG.budget > 0
            ? (realization / APP_CONFIG.budget) * 100
            : 0;


    DOM["metric-budget"].textContent =
        formatRupiah(APP_CONFIG.budget);

    DOM["metric-realization"].textContent =
        formatRupiah(realization);

    DOM["metric-realization-percent"].textContent =
        `${formatNumber(realizationPercent)}% dari pagu`;

    DOM["metric-silpa"].textContent =
        formatRupiah(silpa);

    DOM["audit-count"].textContent =
        state.auditLogs.length;

    updateChart();
}


/* ============================================================
   15. TRANSACTION FORM
============================================================ */

function initializeTransactionForm() {

    DOM["transaction-form"].addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            await processTransaction();
        }
    );
}


async function processTransaction() {

    const itemName =
        DOM["item-name"].value.trim();

    const volume =
        Number(DOM["item-volume"].value);

    const unitPrice =
        Number(DOM["item-price"].value);


    if (!itemName) {

        showToast({
            title: "Data belum lengkap",
            message: "Nama barang wajib diisi.",
            type: "error"
        });

        return;
    }


    if (!Number.isFinite(volume) || volume <= 0) {

        showToast({
            title: "Volume tidak valid",
            message: "Volume harus lebih besar dari nol.",
            type: "error"
        });

        return;
    }


    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {

        showToast({
            title: "Harga tidak valid",
            message: "Harga satuan harus lebih besar dari nol.",
            type: "error"
        });

        return;
    }


    const basePrice =
        getSSHPrice(itemName);


    /*
     * For items outside the local SSH dictionary,
     * the edge validator cannot establish a reference.
     * We therefore stop the transaction instead of
     * pretending that it has been validated.
     */

    if (basePrice === null) {

        openModal({
            title: "Referensi SSH tidak ditemukan",
            message: `
                <p>
                    Barang
                    <strong>${escapeHTML(itemName)}</strong>
                    belum memiliki referensi harga pada SSH Dictionary lokal.
                </p>

                <p class="mt-2">
                    Transaksi tidak dapat dinyatakan Wajar atau Justifikasi
                    tanpa baseline harga.
                </p>
            `,
            type: "warning",
            confirmText: "Mengerti",
            showCancel: false
        });

        return;
    }


    const markup =
        calculateMarkup(unitPrice, basePrice);

    const status =
        getTransactionStatus(markup);


    /* ========================================================
       TIER 3
    ======================================================== */

    if (status.tier === 3) {

        openModal({
            title: "Transaksi Diblokir",
            message: `
                <div class="space-y-3">

                    <div class="p-3 rounded-xl bg-red-50 border border-red-100">
                        <div class="text-xs text-red-500 font-bold uppercase">
                            Mark-up terdeteksi
                        </div>

                        <div class="text-xl font-extrabold text-red-700 mt-1">
                            ${formatNumber(markup * 100)}%
                        </div>
                    </div>

                    <p>
                        Mark-up ekstrem terdeteksi.
                        Transaksi melebihi ambang batas
                        <strong>20%</strong> dari referensi SSH.
                    </p>

                    <p class="text-xs text-slate-400">
                        Edge validator mencegah transaksi disimpan.
                    </p>

                </div>
            `,
            type: "error",
            confirmText: "Tutup",
            showCancel: false
        });

        return;
    }


    /* ========================================================
       TIER 2
    ======================================================== */

    if (status.tier === 2) {

        openJustificationModal({
            itemName,
            volume,
            unitPrice,
            basePrice,
            markup
        });

        return;
    }


    /* ========================================================
       TIER 1
    ======================================================== */

    await saveValidatedTransaction({
        itemName,
        volume,
        unitPrice,
        basePrice,
        markup,
        status,
        justification: ""
    });
}


/* ============================================================
   16. JUSTIFICATION MODAL
============================================================ */

function openJustificationModal({
    itemName,
    volume,
    unitPrice,
    basePrice,
    markup
}) {

    DOM["modal-root"].innerHTML = `
        <div class="absolute inset-0 modal-backdrop flex items-center justify-center p-5">

            <div class="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">

                <div class="px-6 py-5 border-b border-slate-100 flex items-center gap-4">

                    <div class="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>

                    <div>
                        <h3 class="font-extrabold text-lg">
                            Justifikasi Diperlukan
                        </h3>

                        <p class="text-xs text-slate-400 mt-1">
                            Tier 2 • Peringatan mark-up
                        </p>
                    </div>

                </div>


                <div class="p-6">

                    <div class="grid grid-cols-2 gap-3 mb-5">

                        <div class="bg-slate-50 rounded-xl p-3">
                            <div class="text-[10px] text-slate-400 uppercase font-bold">
                                Referensi SSH
                            </div>

                            <div class="font-bold mt-1">
                                ${formatRupiah(basePrice)}
                            </div>
                        </div>

                        <div class="bg-amber-50 rounded-xl p-3">
                            <div class="text-[10px] text-amber-600 uppercase font-bold">
                                Mark-up
                            </div>

                            <div class="font-bold text-amber-700 mt-1">
                                ${formatNumber(markup * 100)}%
                            </div>
                        </div>

                    </div>


                    <div class="mb-5">

                        <label
                            for="justification-input"
                            class="block text-xs font-bold text-slate-600 mb-2"
                        >
                            ALASAN JUSTIFIKASI
                        </label>

                        <textarea
                            id="justification-input"
                            rows="4"
                            maxlength="500"
                            placeholder="Contoh: Selisih harga disebabkan oleh biaya transportasi ke lokasi desa."
                            class="w-full rounded-xl border border-slate-200 p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                        ></textarea>

                        <div class="text-[10px] text-slate-400 mt-2">
                            Maksimum 500 karakter.
                        </div>

                    </div>


                    <div class="flex gap-3">

                        <button
                            id="justification-cancel"
                            type="button"
                            class="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
                        >
                            Batal
                        </button>

                        <button
                            id="justification-save"
                            type="button"
                            class="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm"
                        >
                            Simpan Justifikasi
                        </button>

                    </div>

                </div>

            </div>

        </div>
    `;

    DOM["modal-root"].classList.remove("hidden");


    document
        .getElementById("justification-cancel")
        .addEventListener("click", closeModal);


    document
        .getElementById("justification-save")
        .addEventListener("click", async () => {

            const justification =
                document
                    .getElementById("justification-input")
                    .value
                    .trim();


            if (!justification) {

                showToast({
                    title: "Justifikasi wajib",
                    message:
                        "Berikan alasan sebelum transaksi disimpan.",
                    type: "warning"
                });

                return;
            }


            await saveValidatedTransaction({
                itemName,
                volume,
                unitPrice,
                basePrice,
                markup,
                status: {
                    tier: 2,
                    code: "JUSTIFIKASI",
                    label: "Justifikasi",
                    color: "yellow"
                },
                justification
            });

            closeModal();
        });
}


/* ============================================================
   17. CRYPTOGRAPHIC AUDIT
============================================================ */

function createCanonicalTransactionPayload(transaction) {

    return JSON.stringify({
        id: transaction.id,
        timestamp: transaction.timestamp,
        itemName: transaction.itemName,
        volume: transaction.volume,
        unitPrice: transaction.unitPrice,
        basePrice: transaction.basePrice,
        totalPrice: transaction.totalPrice,
        markup: transaction.markup,
        statusCode: transaction.statusCode,
        justification: transaction.justification,
        username: transaction.username,
        deviceId: transaction.deviceId
    });
}


function generateTransactionHash(transaction) {

    const payload =
        createCanonicalTransactionPayload(transaction);

    return CryptoJS.SHA256(payload).toString();
}


/* ============================================================
   18. SAVE VALIDATED TRANSACTION
============================================================ */

async function saveValidatedTransaction({
    itemName,
    volume,
    unitPrice,
    basePrice,
    markup,
    status,
    justification
}) {

    const totalPrice =
        volume * unitPrice;

    const timestamp =
        new Date().toISOString();


    const transaction = {

        id: generateId("TX"),

        timestamp,

        itemName,

        volume,

        unitPrice,

        basePrice,

        totalPrice,

        markup,

        markupPercent:
            markup * 100,

        statusCode:
            status.code,

        statusLabel:
            status.label,

        tier:
            status.tier,

        justification:
            justification || "",

        username:
            state.currentUser?.username || "unknown",

        role:
            state.currentUser?.role || "unknown",

        deviceId:
            state.currentUser?.deviceId || generateDeviceFingerprint(),

        syncStatus:
            state.online
                ? "SYNCED"
                : "PENDING",

        createdAt:
            timestamp
    };


    transaction.hash =
        generateTransactionHash(transaction);


    state.transactions.unshift(transaction);


    const auditRecord = {

        id: generateId("AUDIT"),

        transactionId:
            transaction.id,

        timestamp,

        action: "CREATE_TRANSACTION",

        hash:
            transaction.hash,

        actor:
            transaction.username,

        deviceId:
            transaction.deviceId
    };


    state.auditLogs.unshift(auditRecord);


    if (!state.online) {

        state.pendingSync.push({
            operation: "CREATE",
            transactionId: transaction.id,
            timestamp,
            hash: transaction.hash
        });
    }


    await persistTransactions();

    await persistAuditLogs();

    await persistPendingSync();


    renderTransactionTable();

    updateDashboard();

    renderSPJ();

    appendCRDTLog(
        `[LOCAL] Transaction ${transaction.id} committed locally.`,
        "success"
    );


    if (state.online) {

        await simulateImmediateSync(transaction);

    } else {

        showToast({
            title: "Tersimpan secara lokal",
            message:
                `${itemName} masuk ke antrean sinkronisasi karena perangkat sedang luring.`,
            type: "warning"
        });

    }


    resetTransactionForm();
}


function resetTransactionForm() {

    DOM["transaction-form"].reset();

    DOM["item-name"].focus();
}


/* ============================================================
   19. TRANSACTION TABLE
============================================================ */

function renderTransactionTable() {

    const body =
        DOM["transaction-table-body"];

    const empty =
        DOM["empty-transactions"];


    DOM["transaction-count"].textContent =
        `${state.transactions.length} transaksi`;


    if (state.transactions.length === 0) {

        body.innerHTML = "";

        empty.classList.remove("hidden");

        return;
    }


    empty.classList.add("hidden");


    body.innerHTML =
        state.transactions
            .map(transaction => {

                const statusHTML =
                    getStatusBadgeHTML(transaction);

                return `
                    <tr class="hover:bg-slate-50/80 transition">

                        <td class="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                            ${formatDateTime(transaction.timestamp)}
                        </td>

                        <td class="px-6 py-4">
                            <div class="font-bold text-slate-800">
                                ${escapeHTML(transaction.itemName)}
                            </div>

                            ${
                                transaction.justification
                                    ? `
                                        <div class="text-[10px] text-amber-600 mt-1 max-w-xs truncate">
                                            <i class="fa-solid fa-comment-dots mr-1"></i>
                                            ${escapeHTML(transaction.justification)}
                                        </div>
                                      `
                                    : ""
                            }
                        </td>

                        <td class="px-6 py-4 text-slate-600">
                            ${formatNumber(transaction.volume)}
                        </td>

                        <td class="px-6 py-4 font-bold text-slate-800">
                            ${formatRupiah(transaction.totalPrice)}
                        </td>

                        <td class="px-6 py-4">
                            <span class="text-xs font-semibold ${
                                transaction.markup > 0
                                    ? "text-amber-600"
                                    : "text-emerald-600"
                            }">
                                ${
                                    transaction.markup > 0
                                        ? `+${formatNumber(transaction.markupPercent)}%`
                                        : "0%"
                                }
                            </span>
                        </td>

                        <td class="px-6 py-4">
                            ${statusHTML}
                        </td>

                        <td class="px-6 py-4">

                            <div
                                class="group relative inline-flex items-center gap-2"
                                title="${escapeHTML(transaction.hash)}"
                            >

                                <span class="font-mono text-[10px] text-slate-400">
                                    ${transaction.hash.substring(0, 14)}...
                                </span>

                                <i class="fa-solid fa-fingerprint text-indigo-400 text-xs"></i>

                            </div>

                        </td>

                    </tr>
                `;
            })
            .join("");
}


function getStatusBadgeHTML(transaction) {

    if (transaction.statusCode === "WAJAR") {

        return `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Wajar
            </span>
        `;
    }


    if (transaction.statusCode === "JUSTIFIKASI") {

        return `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Justifikasi
            </span>
        `;
    }


    return `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-bold">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            Diblokir
        </span>
    `;
}


/* ============================================================
   20. SPJ
============================================================ */

function getSPJTransactions() {

    return state.transactions.filter(
        transaction =>
            transaction.statusCode === "WAJAR" ||
            transaction.statusCode === "JUSTIFIKASI"
    );
}


function renderSPJ() {

    const transactions =
        getSPJTransactions();

    const body =
        DOM["spj-table-body"];

    const printBody =
        DOM["print-table-body"];


    DOM["spj-eligible-count"].textContent =
        transactions.length;


    DOM["spj-justification-count"].textContent =
        transactions.filter(
            transaction =>
                transaction.statusCode === "JUSTIFIKASI"
        ).length;


    if (transactions.length === 0) {

        body.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    class="px-6 py-16 text-center text-slate-400"
                >
                    <i class="fa-solid fa-file-circle-xmark text-2xl mb-3"></i>

                    <div class="font-semibold">
                        Belum ada transaksi eligible SPJ.
                    </div>
                </td>
            </tr>
        `;

        printBody.innerHTML = "";

        return;
    }


    body.innerHTML =
        transactions
            .map((transaction, index) => {

                return `
                    <tr class="hover:bg-slate-50">

                        <td class="px-6 py-4 text-slate-400">
                            ${index + 1}
                        </td>

                        <td class="px-6 py-4 text-xs text-slate-500">
                            ${formatDateTime(transaction.timestamp)}
                        </td>

                        <td class="px-6 py-4 font-semibold">
                            ${escapeHTML(transaction.itemName)}
                        </td>

                        <td class="px-6 py-4">
                            ${formatNumber(transaction.volume)}
                        </td>

                        <td class="px-6 py-4 font-bold">
                            ${formatRupiah(transaction.totalPrice)}
                        </td>

                        <td class="px-6 py-4">
                            ${getStatusBadgeHTML(transaction)}
                        </td>

                    </tr>
                `;
            })
            .join("");


    printBody.innerHTML =
        transactions
            .map((transaction, index) => {

                return `
                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                            ${formatDateTime(transaction.timestamp)}
                        </td>

                        <td>
                            ${escapeHTML(transaction.itemName)}
                            ${
                                transaction.justification
                                    ? `<br><small>Justifikasi: ${escapeHTML(transaction.justification)}</small>`
                                    : ""
                            }
                        </td>

                        <td>
                            ${formatNumber(transaction.volume)}
                        </td>

                        <td>
                            ${formatRupiah(transaction.totalPrice)}
                        </td>

                        <td>
                            ${transaction.statusLabel}
                        </td>

                    </tr>
                `;
            })
            .join("");
}


/* ============================================================
   21. QR CODE / TTE
============================================================ */

function generateQRCode() {

    const container =
        DOM["qrcode"];

    container.innerHTML = "";

    const spjTransactions =
        getSPJTransactions();

    const documentPayload = {

        documentId:
            "DS-SPJ-2026-001",

        system:
            APP_CONFIG.appName,

        signer:
            "Budi Santoso, S.E.",

        role:
            "Kepala Desa",

        generatedAt:
            new Date().toISOString(),

        transactionCount:
            spjTransactions.length,

        documentHash:
            CryptoJS.SHA256(
                JSON.stringify(
                    spjTransactions.map(
                        transaction => transaction.hash
                    )
                )
            ).toString()
    };


    new QRCode(container, {

        text:
            JSON.stringify(documentPayload),

        width: 105,

        height: 105,

        colorDark: "#000000",

        colorLight: "#ffffff",

        correctLevel:
            QRCode.CorrectLevel.M
    });
}


/* ============================================================
   22. PRINT SPJ
============================================================ */

function initializePrinting() {

    DOM["print-spj-button"].addEventListener(
        "click",
        () => {

            renderSPJ();

            generateQRCode();

            setTimeout(() => {

                window.print();

            }, 250);
        }
    );
}


/* ============================================================
   23. CRDT CONSOLE
============================================================ */

function appendCRDTLog(message, type = "info") {

    const consoleElement =
        DOM["crdt-console"];

    if (!consoleElement) {
        return;
    }


    const timestamp =
        new Date()
            .toLocaleTimeString(
                "id-ID",
                {
                    hour12: false
                }
            );


    const colors = {
        info: "text-slate-300",
        success: "text-emerald-400",
        warning: "text-amber-400",
        error: "text-red-400"
    };


    const line =
        document.createElement("div");

    line.className =
        colors[type] || colors.info;

    line.textContent =
        `[${timestamp}] ${message}`;


    consoleElement.appendChild(line);

    consoleElement.scrollTop =
        consoleElement.scrollHeight;
}


function renderCRDTInitialState() {

    const consoleElement =
        DOM["crdt-console"];

    if (
        consoleElement.children.length > 0
    ) {
        return;
    }


    appendCRDTLog(
        "[BOOT] DESA-SYNC Edge Runtime initialized.",
        "success"
    );

    appendCRDTLog(
        `[BOOT] Device ID: ${state.currentUser?.deviceId || "UNKNOWN"}`,
        "info"
    );

    appendCRDTLog(
        `[BOOT] Network state: ${state.online ? "ONLINE" : "OFFLINE"}`,
        state.online ? "success" : "warning"
    );

    appendCRDTLog(
        `[BOOT] Local records: ${state.transactions.length}`,
        "info"
    );

    appendCRDTLog(
        `[BOOT] Pending delta operations: ${state.pendingSync.length}`,
        "info"
    );

    appendCRDTLog(
        "[CRDT] Replica vector initialized.",
        "success"
    );

    appendCRDTLog(
        "[CRDT] Conflict resolver: deterministic last-write ordering.",
        "info"
    );

    appendCRDTLog(
        "[CRDT] Waiting for network reconciliation events...",
        "info"
    );
}


/* ============================================================
   24. SIMULATED SYNC
============================================================ */

async function simulateImmediateSync(transaction) {

    appendCRDTLog(
        `[SYNC] Preparing delta for ${transaction.id}...`,
        "info"
    );

    await sleep(350);

    const payload =
        JSON.stringify({
            operation: "CREATE",
            transactionId: transaction.id,
            hash: transaction.hash
        });

    const payloadKB =
        Math.max(
            payload.length / 1024,
            0.1
        ).toFixed(1);


    appendCRDTLog(
        `[SYNC] Delta payload: ${payloadKB} KB transmitted.`,
        "success"
    );

    await sleep(300);

    appendCRDTLog(
        `[SYNC] ${transaction.id} acknowledged by central replica.`,
        "success"
    );


    transaction.syncStatus =
        "SYNCED";


    const pendingIndex =
        state.pendingSync.findIndex(
            item =>
                item.transactionId === transaction.id
        );


    if (pendingIndex !== -1) {

        state.pendingSync.splice(
            pendingIndex,
            1
        );

        await persistPendingSync();
    }


    await persistTransactions();
}


async function synchronizePendingData() {

    if (!state.online) {
        return;
    }


    if (state.pendingSync.length === 0) {

        appendCRDTLog(
            "[SYNC] No pending deltas. Replica already converged.",
            "info"
        );

        showToast({
            title: "Sistem tersinkronisasi",
            message:
                "Tidak ada data tertunda. Replica lokal sudah konvergen.",
            type: "success"
        });

        return;
    }


    const pending =
        [...state.pendingSync];


    const payloadObject = {

        protocol:
            "DESA-SYNC-DELTA",

        sequence:
            ++state.syncSequence,

        operations:
            pending.map(item => ({
                operation: item.operation,
                transactionId: item.transactionId,
                hash: item.hash
            }))
    };


    const serialized =
        JSON.stringify(payloadObject);


    const payloadKB =
        Math.max(
            serialized.length / 1024,
            0.1
        ).toFixed(1);


    appendCRDTLog(
        `[SYNC] Delta payload: ${payloadKB} KB transmitted.`,
        "success"
    );


    await sleep(650);


    pending.forEach(item => {

        const transaction =
            state.transactions.find(
                transaction =>
                    transaction.id === item.transactionId
            );

        if (transaction) {
            transaction.syncStatus = "SYNCED";
        }
    });


    state.pendingSync = [];


    await persistTransactions();

    await persistPendingSync();


    appendCRDTLog(
        "[SYNC] Zero-conflict reconciliation completed.",
        "success"
    );

    appendCRDTLog(
        `[SYNC] ${pending.length} delta operation(s) committed to central replica.`,
        "success"
    );


    showToast({
        title: "Sinkronisasi berhasil",
        message:
            "Data tertunda berhasil disinkronkan ke Peladen Pusat (Zero-Conflict).",
        type: "success",
        duration: 6000
    });


    updateDashboard();

    renderTransactionTable();

    renderSPJ();
}


/* ============================================================
   25. INITIALIZATION
============================================================ */

async function initializeApplication() {

    await loadLocalData();

    renderTransactionTable();

    renderSPJ();

    updateDashboard();

    updateNetworkUI();

    renderCRDTInitialState();
}


/* ============================================================
   26. APPLICATION BOOTSTRAP
============================================================ */

async function bootstrap() {

    cacheDOM();

    initializeAuth();

    initializeLogout();

    initializeNavigation();

    initializeNetworkStatus();

    initializeTransactionForm();

    initializePrinting();

    initializeChart();


    await loadLocalData();


    const restored =
        await restoreSession();


    if (restored) {

        updateUserProfile();

        renderTransactionTable();

        renderSPJ();

        updateDashboard();

        renderCRDTInitialState();
    }
}


/* ============================================================
   27. START
============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    bootstrap
);