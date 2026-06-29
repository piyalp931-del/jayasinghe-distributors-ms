// ================================================================
// assets/js/app.js - Main Application Logic (FULL COMPLETE)
// ================================================================

// ================================================================
// STATE
// ================================================================
const state = {
    currentUser: null,
    userRole: 'viewer',
    transactions: [],
    customers: [],
    routes: [],
    cheques: [],
    users: [],
    settings: { companyName: 'Jayasinghe Distributors', currency: 'LKR', dateFormat: 'DD/MM/YYYY' },
    editing: { transaction: null, customer: null, route: null, user: null },
    darkMode: localStorage.getItem('jdms-dark') === 'true',
    chartInstance: null,
};

// ================================================================
// DOM REFS
// ================================================================
const $ = id => document.getElementById(id);
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const qsa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ================================================================
// HELPERS
// ================================================================
function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) amount = 0;
    const sym = state.settings.currency === 'LKR' ? 'Rs. ' : state.settings.currency === 'USD' ? '$ ' : '€ ';
    return sym + Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatCurrencyShort(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) amount = 0;
    const sym = state.settings.currency === 'LKR' ? 'Rs. ' : state.settings.currency === 'USD' ? '$ ' : '€ ';
    return sym + Number(amount).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const fmt = state.settings.dateFormat || 'DD/MM/YYYY';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    if (fmt === 'MM/DD/YYYY') return mm + '/' + dd + '/' + yyyy;
    if (fmt === 'YYYY-MM-DD') return yyyy + '-' + mm + '-' + dd;
    return dd + '/' + mm + '/' + yyyy;
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getCurrentDateTime() {
    return new Date().toLocaleString();
}

function generateId() {
    return 'TXN-' + Date.now().toString().slice(-8) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function showToast(message, type = 'success') {
    const container = document.querySelector('.toast-container');
    if (!container) {
        console.warn('Toast container not found');
        return;
    }
    const colors = { success: '#22c55e', danger: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const bg = colors[type] || colors.info;
    const el = document.createElement('div');
    el.className = 'toast align-items-center text-white border-0 show';
    el.style.background = bg;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    container.appendChild(el);
    setTimeout(() => { el.classList.remove('show');
        setTimeout(() => el.remove(), 300); }, 4000);
}

function showConfirm(title, body) {
    return new Promise((resolve) => {
        const titleEl = $('confirmTitle');
        const bodyEl = $('confirmBody');
        const okBtn = $('confirmOkBtn');
        const modalEl = $('confirmModal');
        if (!titleEl || !bodyEl || !okBtn || !modalEl) {
            console.warn('Confirm modal elements not found');
            resolve(false);
            return;
        }
        titleEl.textContent = title;
        bodyEl.textContent = body;
        const modal = new bootstrap.Modal(modalEl);
        okBtn.onclick = () => { modal.hide();
            resolve(true); };
        modal.show();
        modalEl.addEventListener('hidden.bs.modal', () => { resolve(false); }, { once: true });
    });
}

function updateLastUpdated() {
    const el = $('lastUpdated');
    if (el) el.textContent = 'Last updated: ' + getCurrentDateTime();
}

// ================================================================
// LOGOUT FUNCTION
// ================================================================
async function performLogout() {
    const ok = await showConfirm('Logout', 'Are you sure you want to logout?');
    if (!ok) return;
    try {
        await auth.signOut();
        showToast('Logged out successfully');

        state.currentUser = null;
        state.userRole = 'viewer';
        state.transactions = [];
        state.customers = [];
        state.routes = [];
        state.cheques = [];
        state.users = [];

        const loginPage = $('loginPage');
        const mainApp = $('mainApp');
        if (loginPage) loginPage.style.display = 'flex';
        if (mainApp) mainApp.style.display = 'none';

        const avatar = $('userAvatar');
        if (avatar) avatar.textContent = 'U';
        const displayNameEl = $('userDisplayName');
        if (displayNameEl) displayNameEl.textContent = 'User';
        const emailDisplay = $('userEmailDisplay');
        if (emailDisplay) emailDisplay.textContent = 'user@example.com';

    } catch (err) {
        showToast('Error during logout: ' + err.message, 'danger');
        console.error('Logout error:', err);
    }
}

// ================================================================
// AUTH
// ================================================================
function checkAuth() {
    auth.onAuthStateChanged(async user => {
        if (user) {
            state.currentUser = user;
            try {
                const doc = await db.collection('users').doc(user.uid).get();
                if (doc.exists) {
                    state.userRole = doc.data().role || 'viewer';
                } else {
                    await db.collection('users').doc(user.uid).set({
                        email: user.email,
                        role: 'admin',
                        created: new Date().toISOString(),
                        lastLogin: new Date().toISOString()
                    });
                    state.userRole = 'admin';
                }
            } catch (e) {
                console.warn('Error fetching user role:', e);
                state.userRole = 'viewer';
            }

            const email = user.email || 'U';
            const displayName = email.split('@')[0] || 'User';

            const avatar = $('userAvatar');
            const displayNameEl = $('userDisplayName');
            const emailDisplay = $('userEmailDisplay');
            if (avatar) avatar.textContent = displayName.charAt(0).toUpperCase();
            if (displayNameEl) displayNameEl.textContent = displayName;
            if (emailDisplay) emailDisplay.textContent = email;

            updateProfilePage(user, displayName);

            const loginPage = $('loginPage');
            const mainApp = $('mainApp');
            if (loginPage) loginPage.style.display = 'none';
            if (mainApp) mainApp.style.display = 'block';

            await loadAllData();
            applyRoleRestrictions();
            initDashboard();
            updateChequeBadge();
            updateTopbarStats();
            updateLastUpdated();

            try {
                await db.collection('users').doc(user.uid).update({
                    lastLogin: new Date().toISOString()
                });
            } catch (e) { /* ignore */ }

        } else {
            const loginPage = $('loginPage');
            const mainApp = $('mainApp');
            if (loginPage) loginPage.style.display = 'flex';
            if (mainApp) mainApp.style.display = 'none';
        }
    });
}

// ================================================================
// PROFILE PAGE
// ================================================================
function updateProfilePage(user, displayName) {
    if (!user) return;

    const avatar = $('profileAvatar');
    if (avatar) avatar.textContent = displayName.charAt(0).toUpperCase();

    const displayNameEl = $('profileDisplayName');
    if (displayNameEl) displayNameEl.textContent = displayName;

    const emailEls = ['profileEmail', 'profileEmail2'];
    emailEls.forEach(id => {
        const el = $(id);
        if (el) el.textContent = user.email || '-';
    });

    const roleEls = ['profileRoleBadge', 'profileRole2'];
    roleEls.forEach(id => {
        const el = $(id);
        if (el) {
            const role = state.userRole.charAt(0).toUpperCase() + state.userRole.slice(1);
            el.textContent = role;
        }
    });

    const userIdEl = $('profileUserId');
    if (userIdEl) userIdEl.textContent = user.uid || '-';

    db.collection('users').doc(user.uid).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const createdEl = $('profileCreated');
            if (createdEl) createdEl.textContent = data.created ? formatDate(data.created) : '-';

            const lastLoginEl = $('profileLastLogin');
            if (lastLoginEl) lastLoginEl.textContent = data.lastLogin ? new Date(data.lastLogin).toLocaleString() : '-';
        }
    }).catch(() => { /* ignore */ });

    const totalTxnsEl = $('profileTotalTxns');
    if (totalTxnsEl) totalTxnsEl.textContent = state.transactions.length;

    const totalCustomersEl = $('profileTotalCustomers');
    if (totalCustomersEl) totalCustomersEl.textContent = state.customers.length;

    const totalChequesEl = $('profileTotalCheques');
    if (totalChequesEl) totalChequesEl.textContent = state.cheques.length;
}

// ================================================================
// CHANGE PASSWORD
// ================================================================
async function changePassword(currentPassword, newPassword) {
    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('No user logged in');
        }

        const credential = firebase.auth.EmailAuthProvider.credential(
            user.email,
            currentPassword
        );
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPassword);

        showToast('Password changed successfully!', 'success');
        return true;
    } catch (err) {
        let message = err.message;
        if (err.code === 'auth/wrong-password') {
            message = 'Current password is incorrect';
        } else if (err.code === 'auth/requires-recent-login') {
            message = 'Please login again before changing password';
        }
        throw new Error(message);
    }
}

// ================================================================
// UPDATE FUNCTIONS
// ================================================================
function updateChequeBadge() {
    const pending = state.cheques.filter(c => c.status === 'pending').length;
    const badge = $('cheqBadge');
    if (badge) {
        badge.textContent = pending;
        badge.style.display = pending > 0 ? 'inline' : 'none';
    }
}

function updateTopbarStats() {
    const today = getToday();
    const todayTxns = state.transactions.filter(t => t.date === today);
    const cashToday = todayTxns.reduce((s, t) => s + (parseFloat(t.cash) || 0), 0);
    const pendingCheques = state.cheques.filter(c => c.status === 'pending').length;
    const cashEl = $('topbarTodayCash');
    const pendingEl = $('topbarPendingCheques');
    if (cashEl) cashEl.textContent = formatCurrencyShort(cashToday);
    if (pendingEl) pendingEl.textContent = pendingCheques;
}

// ================================================================
// LOAD DATA
// ================================================================
async function loadAllData() {
    try {
        const txnSnap = await db.collection('transactions').orderBy('date', 'desc').get();
        state.transactions = txnSnap.docs.map(d => {
            const data = d.data();
            return {
                ...data,
                docId: d.id,
                customId: data.id || null,
                id: d.id
            };
        });

        const custSnap = await db.collection('customers').orderBy('name').get();
        state.customers = custSnap.docs.map(d => {
            const data = d.data();
            return { ...data, docId: d.id, id: d.id };
        });

        const routeSnap = await db.collection('routes').orderBy('name').get();
        state.routes = routeSnap.docs.map(d => {
            const data = d.data();
            return { ...data, docId: d.id, id: d.id };
        });

        const userSnap = await db.collection('users').get();
        state.users = userSnap.docs.map(d => {
            const data = d.data();
            return { ...data, docId: d.id, id: d.id };
        });

        const settingsSnap = await db.collection('settings').doc('app').get();
        if (settingsSnap.exists) {
            state.settings = { ...state.settings, ...settingsSnap.data() };
            const s = state.settings;
            const companyName = $('setCompanyName');
            const currency = $('setCurrency');
            const dateFormat = $('setDateFormat');
            if (companyName) companyName.value = s.companyName || 'Jayasinghe Distributors';
            if (currency) currency.value = s.currency || 'LKR';
            if (dateFormat) dateFormat.value = s.dateFormat || 'DD/MM/YYYY';
        }

        state.cheques = state.transactions
            .filter(t => t.cheque && parseFloat(t.cheque) > 0)
            .map(t => ({
                docId: t.docId,
                customId: t.customId,
                date: t.date,
                route: t.route,
                customer: t.customer || 'N/A',
                chequeNo: t.chequeNo || 'N/A',
                bank: t.bank || 'N/A',
                amount: parseFloat(t.cheque) || 0,
                chequeDate: t.chequeDate || t.date,
                status: t.chequeStatus || 'pending',
                transactionId: t.docId,
                id: t.docId
            }));

        renderAll();
        updateTopbarStats();

        if (state.currentUser) {
            updateProfilePage(state.currentUser, state.currentUser.email.split('@')[0] || 'User');
        }

    } catch (e) {
        console.error('Load error:', e);
        showToast('Error loading data: ' + e.message, 'danger');
    }
}

// ================================================================
// RENDER ALL
// ================================================================
function renderAll() {
    renderTransactions();
    renderCustomers();
    renderCheques();
    renderRoutes();
    renderUsers();
    renderDashboardStats();
    populateSelects();
    populateCustomerRouteSelects();
    populateReportRouteSelect();
    updateChequeBadge();
    updateTopbarStats();
    updateLastUpdated();
    checkChequeNotifications();
    loadRouteExpenses();
}

// ================================================================
// POPULATE SELECTS
// ================================================================
function populateSelects() {
    const routeSelects = ['txnRoute'];
    routeSelects.forEach(id => {
        const sel = $(id);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">Select Route</option>';
        state.routes.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.name;
            opt.textContent = r.name;
            sel.appendChild(opt);
        });
        if (current && Array.from(sel.options).some(o => o.value === current)) {
            sel.value = current;
        }
    });

    const custSel = $('txnCustomer');
    if (custSel) {
        const current = custSel.value;
        custSel.innerHTML = '<option value="">Select Customer</option>';
        state.customers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name;
            opt.textContent = c.name + (c.phone ? ' (' + c.phone + ')' : '');
            custSel.appendChild(opt);
        });
        if (current && Array.from(custSel.options).some(o => o.value === current)) {
            custSel.value = current;
        }
    }
}

function populateCustomerRouteSelects() {
    const selects = ['custRoute', 'custRouteFilter', 'txnRouteFilter', 'routeExpenseRoute'];
    selects.forEach(id => {
        const sel = $(id);
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">Select Route</option>';
        state.routes.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.name;
            opt.textContent = r.name;
            sel.appendChild(opt);
        });
        if (current && Array.from(sel.options).some(o => o.value === current)) {
            sel.value = current;
        }
    });
}

function populateReportRouteSelect() {
    const reportRouteEl = $('reportRoute');
    if (!reportRouteEl) return;
    const currentVal = reportRouteEl.value;
    reportRouteEl.innerHTML = '<option value="">Select</option>';
    state.routes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = 'route:' + r.name;
        opt.textContent = '🚏 ' + r.name;
        reportRouteEl.appendChild(opt);
    });
    state.customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = 'customer:' + c.name;
        opt.textContent = '👤 ' + c.name + (c.phone ? ' (' + c.phone + ')' : '');
        reportRouteEl.appendChild(opt);
    });
    if (currentVal && Array.from(reportRouteEl.options).some(o => o.value === currentVal)) {
        reportRouteEl.value = currentVal;
    }
}

// ================================================================
// DASHBOARD
// ================================================================
function initDashboard() {
    renderDashboardStats();
    renderRecentTransactions();
    renderDashboardChart();
    updateTopbarStats();
}

function renderDashboardStats() {
    const today = getToday();
    const todayTxns = state.transactions.filter(t => t.date === today);
    const cashToday = todayTxns.reduce((s, t) => s + (parseFloat(t.cash) || 0), 0);
    const chequeToday = todayTxns.reduce((s, t) => s + (parseFloat(t.cheque) || 0), 0);

    const pendingCheques = state.cheques.filter(c => c.status === 'pending').length;
    const totalExpenses = state.transactions.reduce((s, t) => s + (parseFloat(t.expense) || 0), 0);
    const totalBanked = state.transactions.reduce((s, t) => s + (parseFloat(t.banked) || 0), 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthTxns = state.transactions.filter(t => t.date >= monthStart);
    const monthlyIncome = monthTxns.reduce((s, t) => s + (parseFloat(t.cash) || 0) + (parseFloat(t.cheque) || 0) + (parseFloat(t.credit) || 0), 0);
    const monthlyExpenses = monthTxns.reduce((s, t) => s + (parseFloat(t.expense) || 0) + (parseFloat(t.petrol) || 0), 0);
    const profit = monthlyIncome - monthlyExpenses;

    const dashTodayCash = $('dashTodayCash');
    const dashTodayCheques = $('dashTodayCheques');
    const dashPendingCheques = $('dashPendingCheques');
    const dashTotalExpenses = $('dashTotalExpenses');
    const dashMonthlyIncome = $('dashMonthlyIncome');
    const dashMonthlyExpenses = $('dashMonthlyExpenses');
    const dashProfit = $('dashProfit');
    const dashBanked = $('dashBanked');

    if (dashTodayCash) dashTodayCash.textContent = formatCurrency(cashToday);
    if (dashTodayCheques) dashTodayCheques.textContent = formatCurrency(chequeToday);
    if (dashPendingCheques) dashPendingCheques.textContent = pendingCheques;
    if (dashTotalExpenses) dashTotalExpenses.textContent = formatCurrency(totalExpenses);
    if (dashMonthlyIncome) dashMonthlyIncome.textContent = formatCurrency(monthlyIncome);
    if (dashMonthlyExpenses) dashMonthlyExpenses.textContent = formatCurrency(monthlyExpenses);
    if (dashProfit) dashProfit.textContent = formatCurrency(profit);
    if (dashBanked) dashBanked.textContent = formatCurrency(totalBanked);

    const topbarCash = $('topbarTodayCash');
    const topbarPending = $('topbarPendingCheques');
    if (topbarCash) topbarCash.textContent = formatCurrencyShort(cashToday);
    if (topbarPending) topbarPending.textContent = pendingCheques;
}

function renderRecentTransactions() {
    const container = $('recentTransactions');
    if (!container) return;
    const recent = state.transactions.slice(0, 5);
    if (!recent.length) {
        container.innerHTML = `<div class="empty-state"><i class="bi bi-inbox"></i><p>No recent transactions</p></div>`;
        return;
    }
    container.innerHTML = recent.map(t => `
            <div class="d-flex justify-content-between align-items-center py-2 border-bottom" style="border-color:var(--border)!important;">
                <div>
                    <div class="fw-semibold" style="font-size:14px;">${t.route || 'N/A'}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${formatDate(t.date)} · ${t.customer || 'N/A'}</div>
                </div>
                <div class="fw-bold" style="font-size:15px;">${formatCurrency((parseFloat(t.cash)||0) + (parseFloat(t.cheque)||0))}</div>
            </div>
        `).join('');
}

let dashChartInstance = null;

function renderDashboardChart() {
    const canvas = $('dashChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const days = [];
    const cashData = [];
    const chequeData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        days.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        const dayTxns = state.transactions.filter(t => t.date === dateStr);
        cashData.push(dayTxns.reduce((s, t) => s + (parseFloat(t.cash) || 0), 0));
        chequeData.push(dayTxns.reduce((s, t) => s + (parseFloat(t.cheque) || 0), 0));
    }

    if (dashChartInstance) dashChartInstance.destroy();

    dashChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [
                { label: 'Cash', data: cashData, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 6 },
                { label: 'Cheque', data: chequeData, backgroundColor: 'rgba(245,166,35,0.7)', borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } },
                x: { grid: { display: false } }
            }
        }
    });
}

// ================================================================
// TRANSACTIONS CRUD - WITH TABS & ROUTE FILTER
// ================================================================
let currentTxnTab = 'all';

function renderTransactions() {
    const tbody = $('txnTableBody');
    if (!tbody) return;
    const search = $('txnSearch');
    const searchVal = search ? search.value.toLowerCase() : '';
    const routeFilter = $('txnRouteFilter');
    const routeVal = routeFilter ? routeFilter.value : '';

    let filtered = state.transactions;

    if (searchVal) {
        filtered = filtered.filter(t =>
            (t.route || '').toLowerCase().includes(searchVal) ||
            (t.customer || '').toLowerCase().includes(searchVal) ||
            (t.customId || '').toLowerCase().includes(searchVal) ||
            (t.id || '').toLowerCase().includes(searchVal)
        );
    }

    if (routeVal) {
        filtered = filtered.filter(t => t.route === routeVal);
    }

    if (currentTxnTab === 'cash') {
        filtered = filtered.filter(t => parseFloat(t.cash) > 0);
    } else if (currentTxnTab === 'cheque') {
        filtered = filtered.filter(t => parseFloat(t.cheque) > 0);
    } else if (currentTxnTab === 'transfer') {
        filtered = filtered.filter(t => parseFloat(t.banked) > 0 && parseFloat(t.cash) === 0 && parseFloat(t.cheque) === 0);
    } else if (currentTxnTab === 'expense') {
        filtered = filtered.filter(t => parseFloat(t.expense) > 0 || parseFloat(t.petrol) > 0);
    }

    const countEl = $('txnCount');
    if (countEl) countEl.textContent = filtered.length + ' transactions';

    const totalAmount = filtered.reduce((s, t) => s + (parseFloat(t.cash) || 0) + (parseFloat(t.cheque) || 0) + (parseFloat(t.credit) || 0), 0);
    const totalEl = $('txnTotalAmount');
    if (totalEl) totalEl.textContent = 'Total: ' + formatCurrency(totalAmount);

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">No transactions found</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.slice(0, 50).map(t => {
        let type = 'Income';
        let typeBadge = 'success';
        if (parseFloat(t.expense) > 0 || parseFloat(t.petrol) > 0) {
            type = 'Expense';
            typeBadge = 'danger';
        } else if (parseFloat(t.banked) > 0 && parseFloat(t.cash) === 0 && parseFloat(t.cheque) === 0) {
            type = 'Transfer';
            typeBadge = 'info';
        } else if (parseFloat(t.cheque) > 0) {
            type = 'Cheque';
            typeBadge = 'warning';
        } else if (parseFloat(t.cash) > 0) {
            type = 'Cash';
            typeBadge = 'primary';
        }
        return `
            <tr>
                <td><code style="font-size:12px;">${t.customId || t.id || 'N/A'}</code></td>
                <td>${formatDate(t.date)}</td>
                <td><span class="badge bg-${typeBadge}">${type}</span></td>
                <td>${t.route || '-'}</td>
                <td>${t.customer || '-'}</td>
                <td>${formatCurrency(t.cash)}</td>
                <td>${formatCurrency(t.cheque)}</td>
                <td>${formatCurrency(t.credit)}</td>
                <td>${formatCurrency(t.banked)}</td>
                <td>${formatCurrency(t.expense)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editTransaction('${t.docId}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTransaction('${t.docId}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

function getTransactionFormData() {
    return {
        date: $('txnDate') ? $('txnDate').value : '',
        route: $('txnRoute') ? $('txnRoute').value : '',
        customer: $('txnCustomer') ? $('txnCustomer').value || null : null,
        cash: parseFloat($('txnCash') ? $('txnCash').value : 0) || 0,
        cheque: parseFloat($('txnCheque') ? $('txnCheque').value : 0) || 0,
        chequeNo: $('txnChequeNo') ? $('txnChequeNo').value || null : null,
        bank: $('txnBank') ? $('txnBank').value || null : null,
        branch: $('txnBranch') ? $('txnBranch').value || null : null,
        chequeDate: $('txnChequeDate') ? $('txnChequeDate').value || null : null,
        credit: parseFloat($('txnCredit') ? $('txnCredit').value : 0) || 0,
        advance: parseFloat($('txnAdvance') ? $('txnAdvance').value : 0) || 0,
        expense: parseFloat($('txnExpense') ? $('txnExpense').value : 0) || 0,
        expenseReason: $('txnExpenseReason') ? $('txnExpenseReason').value || null : null,
        petrol: parseFloat($('txnPetrol') ? $('txnPetrol').value : 0) || 0,
        km: $('txnKM') ? $('txnKM').value || null : null,
        banked: parseFloat($('txnBanked') ? $('txnBanked').value : 0) || 0,
        transferBank: $('txnTransferBank') ? $('txnTransferBank').value || null : null,
        transferRef: $('txnTransferRef') ? $('txnTransferRef').value || null : null,
        driver: $('txnDriver') ? $('txnDriver').value || null : null,
        primary: $('txnPrimary') ? $('txnPrimary').value || null : null,
        notes: $('txnNotes') ? $('txnNotes').value || null : null,
        chequeStatus: 'pending',
    };
}

window.editTransaction = async function(docId) {
    const txn = state.transactions.find(t => t.docId === docId);
    if (!txn) {
        showToast('Transaction not found', 'danger');
        return;
    }
    const txnDate = $('txnDate');
    const txnRoute = $('txnRoute');
    const txnCustomer = $('txnCustomer');
    const txnCash = $('txnCash');
    const txnCheque = $('txnCheque');
    const txnChequeNo = $('txnChequeNo');
    const txnBank = $('txnBank');
    const txnBranch = $('txnBranch');
    const txnChequeDate = $('txnChequeDate');
    const txnCredit = $('txnCredit');
    const txnAdvance = $('txnAdvance');
    const txnExpense = $('txnExpense');
    const txnExpenseReason = $('txnExpenseReason');
    const txnPetrol = $('txnPetrol');
    const txnKM = $('txnKM');
    const txnBanked = $('txnBanked');
    const txnTransferBank = $('txnTransferBank');
    const txnTransferRef = $('txnTransferRef');
    const txnDriver = $('txnDriver');
    const txnPrimary = $('txnPrimary');
    const txnNotes = $('txnNotes');
    const txnEditId = $('txnEditId');
    const txnUpdateBtn = $('txnUpdateBtn');
    const txnDeleteBtn = $('txnDeleteBtn');
    const txnSaveBtn = $('txnSaveBtn');
    const txnFormTitle = $('txnFormTitle');
    const txnType = $('txnType');

    if (txnDate) txnDate.value = txn.date || '';
    if (txnRoute) txnRoute.value = txn.route || '';
    if (txnCustomer) txnCustomer.value = txn.customer || '';
    if (txnCash) txnCash.value = txn.cash || '';
    if (txnCheque) txnCheque.value = txn.cheque || '';
    if (txnChequeNo) txnChequeNo.value = txn.chequeNo || '';
    if (txnBank) txnBank.value = txn.bank || '';
    if (txnBranch) txnBranch.value = txn.branch || '';
    if (txnChequeDate) txnChequeDate.value = txn.chequeDate || '';
    if (txnCredit) txnCredit.value = txn.credit || '';
    if (txnAdvance) txnAdvance.value = txn.advance || '';
    if (txnExpense) txnExpense.value = txn.expense || '';
    if (txnExpenseReason) txnExpenseReason.value = txn.expenseReason || '';
    if (txnPetrol) txnPetrol.value = txn.petrol || '';
    if (txnKM) txnKM.value = txn.km || '';
    if (txnBanked) txnBanked.value = txn.banked || '';
    if (txnTransferBank) txnTransferBank.value = txn.transferBank || '';
    if (txnTransferRef) txnTransferRef.value = txn.transferRef || '';
    if (txnDriver) txnDriver.value = txn.driver || '';
    if (txnPrimary) txnPrimary.value = txn.primary || '';
    if (txnNotes) txnNotes.value = txn.notes || '';
    if (txnEditId) txnEditId.value = docId;
    if (txnUpdateBtn) txnUpdateBtn.style.display = 'inline-block';
    if (txnDeleteBtn) txnDeleteBtn.style.display = 'inline-block';
    if (txnSaveBtn) txnSaveBtn.textContent = 'Update';
    if (txnFormTitle) txnFormTitle.textContent = 'Edit Transaction';

    // Set type
    if (txnType) {
        if (parseFloat(txn.expense) > 0 || parseFloat(txn.petrol) > 0) {
            txnType.value = 'expense';
        } else if (parseFloat(txn.banked) > 0 && parseFloat(txn.cash) === 0 && parseFloat(txn.cheque) === 0) {
            txnType.value = 'transfer';
        } else {
            txnType.value = 'income';
        }
        txnType.dispatchEvent(new Event('change'));
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteTransaction = async function(docId) {
    const ok = await showConfirm('Delete Transaction', 'Are you sure you want to delete this transaction?');
    if (!ok) return;
    try {
        await db.collection('transactions').doc(docId).delete();
        showToast('Transaction deleted.');
        await loadAllData();
        renderAll();
        initDashboard();
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
    }
};

// ================================================================
// CUSTOMERS CRUD - WITH ROUTE FILTER
// ================================================================
function renderCustomers() {
    const tbody = $('custTableBody');
    if (!tbody) return;
    const search = $('custSearch');
    const searchVal = search ? search.value.toLowerCase() : '';
    const routeFilter = $('custRouteFilter');
    const routeVal = routeFilter ? routeFilter.value : '';

    let filtered = state.customers;
    if (searchVal) {
        filtered = filtered.filter(c =>
            (c.name || '').toLowerCase().includes(searchVal) ||
            (c.phone || '').includes(searchVal) ||
            (c.email || '').toLowerCase().includes(searchVal)
        );
    }
    if (routeVal) {
        filtered = filtered.filter(c => c.route === routeVal);
    }

    const countEl = $('custCount');
    if (countEl) countEl.textContent = filtered.length + ' customers';

    // Calculate customer balance
    const balances = {};
    state.transactions.forEach(t => {
        if (t.customer) {
            if (!balances[t.customer]) balances[t.customer] = 0;
            const amount = (parseFloat(t.cash) || 0) + (parseFloat(t.cheque) || 0) + (parseFloat(t.credit) || 0);
            balances[t.customer] += amount;
        }
    });

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No customers</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td><span class="badge bg-info">${c.route || 'N/A'}</span></td>
                <td>${c.phone || '-'}</td>
                <td>${c.email || '-'}</td>
                <td>${formatCurrency(c.creditLimit)}</td>
                <td>${formatCurrency(balances[c.name] || 0)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editCustomer('${c.docId}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomer('${c.docId}')"><i class="bi bi-trash"></i></button>
                    <button class="btn btn-sm btn-outline-info" onclick="showCustomerTransactions('${c.name}')"><i class="bi bi-receipt"></i></button>
                </td>
            </tr>
        `).join('');
}

window.showCustomerTransactions = function(customerName) {
    navigateTo('transactions');
    setTimeout(() => {
        const search = $('txnSearch');
        if (search) search.value = customerName;
        renderTransactions();
    }, 300);
};

window.editCustomer = function(docId) {
    const c = state.customers.find(c => c.docId === docId);
    if (!c) return;
    const custName = $('custName');
    const custRoute = $('custRoute');
    const custPhone = $('custPhone');
    const custEmail = $('custEmail');
    const custAddress = $('custAddress');
    const custCreditLimit = $('custCreditLimit');
    const custEditId = $('custEditId');
    const custDeleteBtn = $('custDeleteBtn');
    if (custName) custName.value = c.name || '';
    if (custRoute) custRoute.value = c.route || '';
    if (custPhone) custPhone.value = c.phone || '';
    if (custEmail) custEmail.value = c.email || '';
    if (custAddress) custAddress.value = c.address || '';
    if (custCreditLimit) custCreditLimit.value = c.creditLimit || '';
    if (custEditId) custEditId.value = docId;
    if (custDeleteBtn) custDeleteBtn.style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteCustomer = async function(docId) {
    const ok = await showConfirm('Delete Customer', 'This will also remove all associated transactions?');
    if (!ok) return;
    try {
        await db.collection('customers').doc(docId).delete();
        showToast('Customer deleted.');
        await loadAllData();
        renderAll();
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
    }
};

// ================================================================
// CHEQUES
// ================================================================
function renderCheques() {
    const tbody = $('cheqTableBody');
    if (!tbody) return;
    const search = $('cheqSearch');
    const searchVal = search ? search.value.toLowerCase() : '';
    const statusFilter = $('cheqStatusFilter');
    const statusVal = statusFilter ? statusFilter.value : '';

    let filtered = state.cheques;
    if (searchVal) {
        filtered = filtered.filter(c =>
            (c.route || '').toLowerCase().includes(searchVal) ||
            (c.customer || '').toLowerCase().includes(searchVal) ||
            (c.chequeNo || '').toLowerCase().includes(searchVal) ||
            (c.bank || '').toLowerCase().includes(searchVal)
        );
    }
    if (statusVal) {
        filtered = filtered.filter(c => c.status === statusVal);
    }

    const pendingEl = $('cheqPending');
    const clearedEl = $('cheqCleared');
    const returnedEl = $('cheqReturned');
    const depositedEl = $('cheqDeposited');
    const countEl = $('cheqCount');

    if (pendingEl) pendingEl.textContent = state.cheques.filter(c => c.status === 'pending').length;
    if (clearedEl) clearedEl.textContent = state.cheques.filter(c => c.status === 'cleared').length;
    if (returnedEl) returnedEl.textContent = state.cheques.filter(c => c.status === 'returned').length;
    if (depositedEl) depositedEl.textContent = state.cheques.filter(c => c.status === 'deposited').length;
    if (countEl) countEl.textContent = filtered.length + ' cheques';

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No cheques</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => `
            <tr>
                <td>${formatDate(c.date)}</td>
                <td>${c.route || '-'}</td>
                <td>${c.customer || '-'}</td>
                <td><code>${c.chequeNo}</code></td>
                <td>${c.bank || '-'}</td>
                <td>${formatCurrency(c.amount)}</td>
                <td>${formatDate(c.chequeDate)}</td>
                <td><span class="badge-status ${c.status}">${c.status}</span></td>
                <td>
                    <select class="form-select form-select-sm" style="width:auto;display:inline-block;" onchange="updateChequeStatus('${c.docId}', this.value)">
                        <option value="pending" ${c.status==='pending'?'selected':''}>Pending</option>
                        <option value="cleared" ${c.status==='cleared'?'selected':''}>Cleared</option>
                        <option value="returned" ${c.status==='returned'?'selected':''}>Returned</option>
                        <option value="deposited" ${c.status==='deposited'?'selected':''}>Deposited</option>
                    </select>
                </td>
            </tr>
        `).join('');
}

window.updateChequeStatus = async function(docId, newStatus) {
    if (!docId) {
        showToast('Invalid cheque ID', 'danger');
        return;
    }
    try {
        await db.collection('transactions').doc(docId).update({ chequeStatus: newStatus });
        showToast('Cheque status updated to ' + newStatus);
        await loadAllData();
        renderAll();
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
        console.error('Update error:', err);
    }
};

// ================================================================
// ROUTES & EXPENSES
// ================================================================
function renderRoutes() {
    const tbody = $('routeTableBody');
    if (!tbody) return;
    const countEl = $('routeCount');
    if (countEl) countEl.textContent = state.routes.length + ' routes';

    if (!state.routes.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No routes</td></tr>`;
        return;
    }

    tbody.innerHTML = state.routes.map((r, i) => {
        const customerCount = state.customers.filter(c => c.route === r.name).length;
        const expenses = state.transactions.filter(t =>
            t.route === r.name &&
            (parseFloat(t.expense) > 0 || parseFloat(t.petrol) > 0)
        );
        const totalExpense = expenses.reduce((s, t) => s + (parseFloat(t.expense) || 0) + (parseFloat(t.petrol) || 0), 0);

        return `
            <tr>
                <td>${i+1}</td>
                <td><strong>${r.name}</strong></td>
                <td>${customerCount}</td>
                <td>${formatCurrency(totalExpense)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteRoute('${r.docId}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

window.deleteRoute = async function(docId) {
    const ok = await showConfirm('Delete Route', 'Are you sure?');
    if (!ok) return;
    try {
        await db.collection('routes').doc(docId).delete();
        showToast('Route deleted.');
        await loadAllData();
        renderAll();
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
    }
};

// ================================================================
// ROUTE EXPENSES MODULE
// ================================================================
function loadRouteExpenses() {
    const routeSelect = $('routeExpenseRoute');
    const resultDiv = $('routeExpenseResult');
    if (!routeSelect || !resultDiv) return;

    const routeName = routeSelect.value;
    if (!routeName) {
        resultDiv.innerHTML = `<div class="empty-state"><i class="bi bi-receipt"></i><p>Select a route to view expenses</p></div>`;
        return;
    }

    const expenses = state.transactions.filter(t =>
        t.route === routeName &&
        (parseFloat(t.expense) > 0 || parseFloat(t.petrol) > 0)
    );

    if (!expenses.length) {
        resultDiv.innerHTML = `<div class="empty-state"><i class="bi bi-inbox"></i><p>No expenses for this route</p></div>`;
        return;
    }

    const totalExpense = expenses.reduce((s, t) => s + (parseFloat(t.expense) || 0) + (parseFloat(t.petrol) || 0), 0);

    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span><strong>${routeName}</strong> - ${expenses.length} expenses</span>
            <span class="fw-bold text-danger">Total: ${formatCurrency(totalExpense)}</span>
        </div>
        <div class="table-responsive">
            <table class="table table-sm">
                <thead><tr>
                    <th>Date</th>
                    <th>Expense</th>
                    <th>Petrol</th>
                    <th>Reason</th>
                    <th>Driver</th>
                    <th>Notes</th>
                    <th>Actions</th>
                </tr></thead>
                <tbody>
    `;

    expenses.slice(0, 50).forEach(t => {
        html += `
            <tr>
                <td>${formatDate(t.date)}</td>
                <td>${formatCurrency(t.expense)}</td>
                <td>${formatCurrency(t.petrol)}</td>
                <td>${t.expenseReason || '-'}</td>
                <td>${t.driver || '-'}</td>
                <td>${t.notes || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editTransaction('${t.docId}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTransaction('${t.docId}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    resultDiv.innerHTML = html;
}

// ================================================================
// USERS
// ================================================================
function renderUsers() {
    const tbody = $('userTableBody');
    if (!tbody) return;
    const countEl = $('userCount');
    if (countEl) countEl.textContent = state.users.length + ' users';
    if (!state.users.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No users</td></tr>`;
        return;
    }
    tbody.innerHTML = state.users.map(u => `
            <tr>
                <td>${u.email}</td>
                <td><span class="badge bg-primary">${u.role || 'viewer'}</span></td>
                <td>${u.created ? formatDate(u.created) : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editUser('${u.docId}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${u.docId}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');
}

window.editUser = function(docId) {
    const u = state.users.find(u => u.docId === docId);
    if (!u) return;
    const userEmail = $('userEmail');
    const userPassword = $('userPassword');
    const userRole = $('userRole');
    const userEditId = $('userEditId');
    const userDeleteBtn = $('userDeleteBtn');
    if (userEmail) userEmail.value = u.email || '';
    if (userPassword) userPassword.value = '';
    if (userRole) userRole.value = u.role || 'viewer';
    if (userEditId) userEditId.value = docId;
    if (userDeleteBtn) userDeleteBtn.style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteUser = async function(docId) {
    if (docId === state.currentUser?.uid) {
        return showToast('Cannot delete yourself', 'warning');
    }
    const ok = await showConfirm('Delete User', 'Are you sure?');
    if (!ok) return;
    try {
        await db.collection('users').doc(docId).delete();
        showToast('User deleted.');
        await loadAllData();
        renderAll();
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
    }
};

// ================================================================
// REPORTS
// ================================================================
function generateReport(type, month, year, routeCustomerValue, date) {
    const container = $('reportResult');
    if (!container) return;
    let data = [...state.transactions];

    if (type === 'daily') {
        const filterDate = date || getToday();
        data = data.filter(t => t.date === filterDate);
    } else if (type === 'weekly') {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];
        data = data.filter(t => t.date >= weekAgoStr && t.date <= getToday());
    } else if (type === 'monthly' && month) {
        data = data.filter(t => t.date && t.date.startsWith(month));
    } else if (type === 'yearly' && year) {
        data = data.filter(t => t.date && t.date.startsWith(year));
    } else if (type === 'expense') {
        data = data.filter(t => parseFloat(t.expense) > 0);
    } else if (type === 'petrol') {
        data = data.filter(t => parseFloat(t.petrol) > 0);
    } else if (type === 'credit') {
        data = data.filter(t => parseFloat(t.credit) > 0);
    } else if (type === 'bank') {
        data = data.filter(t => parseFloat(t.banked) > 0);
    } else if (type === 'cheque') {
        data = data.filter(t => parseFloat(t.cheque) > 0);
    }

    if (routeCustomerValue) {
        const parts = routeCustomerValue.split(':');
        if (parts.length === 2) {
            const filterType = parts[0];
            const filterValue = parts[1];
            if (filterType === 'route') {
                data = data.filter(t => t.route === filterValue);
            } else if (filterType === 'customer') {
                data = data.filter(t => t.customer === filterValue);
            }
        }
    }

    const totalCash = data.reduce((s, t) => s + (parseFloat(t.cash) || 0), 0);
    const totalCheque = data.reduce((s, t) => s + (parseFloat(t.cheque) || 0), 0);
    const totalCredit = data.reduce((s, t) => s + (parseFloat(t.credit) || 0), 0);
    const totalExpense = data.reduce((s, t) => s + (parseFloat(t.expense) || 0), 0);
    const totalPetrol = data.reduce((s, t) => s + (parseFloat(t.petrol) || 0), 0);
    const totalBanked = data.reduce((s, t) => s + (parseFloat(t.banked) || 0), 0);
    const totalIncome = totalCash + totalCheque + totalCredit;
    const totalCost = totalExpense + totalPetrol;
    const profit = totalIncome - totalCost;

    let filterDesc = '';
    if (type === 'daily') filterDesc = date || getToday();
    else if (type === 'weekly') filterDesc = 'Last 7 Days';
    else if (type === 'monthly') filterDesc = month || '';
    else if (type === 'yearly') filterDesc = year || '';
    else if (type === 'route' || type === 'customer') filterDesc = routeCustomerValue ? routeCustomerValue.split(':')[1] : '';
    else filterDesc = '';

    if (routeCustomerValue) {
        const label = routeCustomerValue.split(':')[1] || '';
        filterDesc += (filterDesc ? ' - ' : '') + 'Filter: ' + label;
    }

    let html = `
            <div class="table-responsive">
                <h6 class="fw-semibold mb-3">Report: ${type.toUpperCase()} ${filterDesc ? '('+filterDesc+')' : ''}</h6>
                <p class="text-muted small">${data.length} transactions found</p>
                <table class="table table-bordered">
                    <thead><tr><th>Metric</th><th>Amount</th></tr></thead>
                    <tbody>
                        <tr><td>Total Cash</td><td>${formatCurrency(totalCash)}</td></tr>
                        <tr><td>Total Cheque</td><td>${formatCurrency(totalCheque)}</td></tr>
                        <tr><td>Total Credit</td><td>${formatCurrency(totalCredit)}</td></tr>
                        <tr><td><strong>Total Income</strong></td><td><strong>${formatCurrency(totalIncome)}</strong></td></tr>
                        <tr><td>Total Expense</td><td>${formatCurrency(totalExpense)}</td></tr>
                        <tr><td>Total Petrol</td><td>${formatCurrency(totalPetrol)}</td></tr>
                        <tr><td><strong>Total Cost</strong></td><td><strong>${formatCurrency(totalCost)}</strong></td></tr>
                        <tr><td class="fw-bold text-success">Profit / Loss</td>
                            <td class="fw-bold ${profit>=0?'text-success':'text-danger'}">${formatCurrency(profit)}</td></tr>
                        <tr><td>Total Banked</td><td>${formatCurrency(totalBanked)}</td></tr>
                    </tbody>
                </table>
                <hr />
                <div style="max-height:300px;overflow-y:auto;">
                    <table class="table table-sm">
                        <thead><tr><th>Date</th><th>Route</th><th>Cash</th><th>Cheque</th><th>Credit</th><th>Expense</th></tr></thead>
                        <tbody>
                            ${data.slice(0,50).map(t => `<tr>
                                <td>${formatDate(t.date)}</td>
                                <td>${t.route||'-'}</td>
                                <td>${formatCurrency(t.cash)}</td>
                                <td>${formatCurrency(t.cheque)}</td>
                                <td>${formatCurrency(t.credit)}</td>
                                <td>${formatCurrency(t.expense)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    container.innerHTML = html;
}

// ================================================================
// NAVIGATION
// ================================================================
function navigateTo(page) {
    qsa('.page-section').forEach(el => el.classList.remove('active'));
    const target = $('page-' + page);
    if (target) target.classList.add('active');

    qsa('.sidebar-nav .nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    const titles = {
        dashboard: 'Dashboard',
        transactions: 'Transactions',
        customers: 'Customers',
        cheques: 'Cheque Management',
        routes: 'Routes & Expenses',
        reports: 'Reports',
        profile: 'Profile',
        users: 'Users',
        backup: 'Backup',
        settings: 'Settings',
        'sample-data': 'Sample Data'
    };
    const titleEl = $('pageTitle');
    if (titleEl) titleEl.textContent = titles[page] || page;

    closeSidebar();

    if (page === 'dashboard') initDashboard();
    if (page === 'transactions') renderTransactions();
    if (page === 'cheques') renderCheques();
    if (page === 'profile' && state.currentUser) {
        updateProfilePage(state.currentUser, state.currentUser.email.split('@')[0] || 'User');
    }
    if (page === 'reports') {
        const reportMonth = $('reportMonth');
        const reportYear = $('reportYear');
        const reportDate = $('reportDate');
        if (reportMonth) reportMonth.value = new Date().toISOString().slice(0, 7);
        if (reportYear) reportYear.value = new Date().getFullYear();
        if (reportDate) reportDate.value = getToday();
        populateReportRouteSelect();
    }
    if (page === 'routes') {
        populateCustomerRouteSelects();
        loadRouteExpenses();
    }
}
window.navigateTo = navigateTo;

function closeSidebar() {
    const sidebar = $('sidebar');
    const overlay = $('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}
window.closeSidebar = closeSidebar;

// ================================================================
// ROLE RESTRICTIONS
// ================================================================
function applyRoleRestrictions() {
    const role = state.userRole;
    const isAdmin = role === 'admin';

    const adminItems = ['users', 'backup', 'settings', 'sample-data'];
    adminItems.forEach(page => {
        const el = qs(`.sidebar-nav .nav-item[data-page="${page}"]`);
        if (el) el.style.display = isAdmin ? 'flex' : 'none';
    });
}

// ================================================================
// TRANSACTION TYPE TOGGLE
// ================================================================
function setupTransactionTypeToggle() {
    const typeSelect = $('txnType');
    if (!typeSelect) return;

    typeSelect.addEventListener('change', function() {
        const incomeFields = $('incomeFields');
        const expenseFields = $('expenseFields');
        const transferFields = $('transferFields');

        if (incomeFields) incomeFields.style.display = 'none';
        if (expenseFields) expenseFields.style.display = 'none';
        if (transferFields) transferFields.style.display = 'none';

        if (this.value === 'income') {
            if (incomeFields) incomeFields.style.display = 'flex';
        } else if (this.value === 'expense') {
            if (expenseFields) expenseFields.style.display = 'flex';
        } else if (this.value === 'transfer') {
            if (transferFields) transferFields.style.display = 'flex';
        }
    });
}

// ================================================================
// CHEQUE NOTIFICATIONS
// ================================================================
let notifiedCheques = new Set();

function checkChequeNotifications() {
    const today = new Date();
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const upcomingCheques = state.cheques.filter(c => {
        if (c.status !== 'pending') return false;
        const chqDate = new Date(c.chequeDate);
        if (isNaN(chqDate)) return false;
        const diff = (chqDate - today) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 3 && !notifiedCheques.has(c.docId + c.chequeNo);
    });

    upcomingCheques.forEach(c => {
        const daysLeft = Math.ceil((new Date(c.chequeDate) - today) / (1000 * 60 * 60 * 24));
        const message = `Cheque ${c.chequeNo} (${c.customer}) due in ${daysLeft} day(s)`;

        showToast(`⏰ ${message}`, 'warning');

        if (Notification.permission === 'granted') {
            new Notification('JDMS - Cheque Reminder', {
                body: message,
                icon: 'https://via.placeholder.com/64/1a3a6b/fff?text=JD'
            });
        }

        notifiedCheques.add(c.docId + c.chequeNo);
    });

    state.cheques.forEach(c => {
        const key = c.docId + c.chequeNo;
        if (notifiedCheques.has(key) && c.status !== 'pending') {
            notifiedCheques.delete(key);
        }
    });
}

// ================================================================
// SAMPLE DATA GENERATOR
// ================================================================
async function generateSampleData() {
    const btn = $('generateSampleDataBtn');
    const status = $('sampleDataStatus');
    const log = $('sampleDataLog');
    if (!btn || !status || !log) return;

    btn.disabled = true;
    status.textContent = '⏳ Generating...';
    log.innerHTML = '<div class="text-info">⏳ Generating sample data...</div>';

    try {
        const sampleRoutes = ['Keppitipola', 'Colombo North', 'Colombo South', 'Kandy', 'Galle', 'Matara', 'Negombo', 'Kalutara'];
        const sampleCustomers = [
            'Sunil Stores', 'Sadun Stores', 'Lanka Traders', 'City Mart', 'Sunshine Stores',
            'Green Valley', 'Ocean Enterprises', 'Royal Distributors', 'Prime Supplies',
            'Lakshmi Stores', 'Ceylon Wholesale', 'Island Traders'
        ];
        const sampleChequeNos = ['CHQ-001', 'CHQ-002', 'CHQ-003', 'CHQ-004', 'CHQ-005'];

        // Assign customers to routes
        const customerRouteMap = {};
        sampleCustomers.forEach((cust, idx) => {
            customerRouteMap[cust] = sampleRoutes[idx % sampleRoutes.length];
        });

        let routeCount = 0;
        for (const route of sampleRoutes) {
            if (!state.routes.some(r => r.name === route)) {
                await db.collection('routes').add({ name: route, createdAt: new Date().toISOString() });
                routeCount++;
            }
        }
        log.innerHTML += `<div class="text-success">✅ Added ${routeCount} routes</div>`;

        let custCount = 0;
        for (const cust of sampleCustomers) {
            if (!state.customers.some(c => c.name === cust)) {
                await db.collection('customers').add({
                    name: cust,
                    route: customerRouteMap[cust],
                    phone: '0' + (70 + Math.floor(Math.random() * 10)) + Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
                    email: cust.toLowerCase().replace(/\s/g, '') + '@gmail.com',
                    address: 'Colombo, Sri Lanka',
                    creditLimit: Math.round((Math.random() * 100 + 10) * 100) / 100,
                    balance: 0,
                    createdAt: new Date().toISOString()
                });
                custCount++;
            }
        }
        log.innerHTML += `<div class="text-success">✅ Added ${custCount} customers</div>`;

        let txnCount = 0;
        const today = new Date();
        const routes = sampleRoutes;
        const customers = sampleCustomers;

        for (let d = 29; d >= 0; d--) {
            const date = new Date(today);
            date.setDate(date.getDate() - d);
            const dateStr = date.toISOString().split('T')[0];
            const day = date.getDay();
            if (day === 0 || day === 6) continue;

            const numTxns = 2 + Math.floor(Math.random() * 4);
            for (let i = 0; i < numTxns; i++) {
                const route = routes[Math.floor(Math.random() * routes.length)];
                const customer = customers[Math.floor(Math.random() * customers.length)];
                const cash = Math.round((Math.random() * 50 + 5) * 100) / 100;
                const hasCheque = Math.random() > 0.6;
                const cheque = hasCheque ? Math.round((Math.random() * 30 + 5) * 100) / 100 : 0;
                const chequeNo = hasCheque ? sampleChequeNos[Math.floor(Math.random() * sampleChequeNos.length)] : null;
                const bank = hasCheque ? ['BOC', 'CBSL', 'Sampath', 'Commercial', 'HNB'][Math.floor(Math.random() * 5)] : null;
                const credit = Math.round((Math.random() * 20) * 100) / 100;
                const expense = Math.round((Math.random() * 10) * 100) / 100;
                const petrol = Math.round((Math.random() * 8) * 100) / 100;
                const banked = Math.round((Math.random() * 15) * 100) / 100;
                const km = Math.round(100 + Math.random() * 400);

                const customId = generateId();

                const txn = {
                    id: customId,
                    date: dateStr,
                    route: route,
                    customer: customer,
                    cash: cash,
                    cheque: cheque,
                    chequeNo: chequeNo,
                    bank: bank,
                    branch: 'Branch ' + (Math.floor(Math.random() * 5) + 1),
                    chequeDate: hasCheque ? dateStr : null,
                    credit: credit,
                    advance: 0,
                    expense: expense,
                    expenseReason: expense > 0 ? ['Fuel', 'Maintenance', 'Food', 'Supplies'][Math.floor(Math.random() * 4)] : null,
                    petrol: petrol,
                    km: km.toString(),
                    banked: banked,
                    driver: ['Saman', 'Kamal', 'Nimal', 'Sunil', 'Ranjith'][Math.floor(Math.random() * 5)],
                    notes: Math.random() > 0.7 ? ['Good day', 'Delivered on time', 'Customer happy', 'Delay due to traffic'][Math.floor(Math.random() * 4)] : null,
                    chequeStatus: hasCheque ? ['pending', 'cleared', 'deposited'][Math.floor(Math.random() * 3)] : 'pending',
                    createdAt: new Date(dateStr + 'T' + (6 + Math.floor(Math.random() * 8)).toString().padStart(2, '0') + ':00:00').toISOString()
                };

                await db.collection('transactions').add(txn);
                txnCount++;
            }
        }

        log.innerHTML += `<div class="text-success">✅ Added ${txnCount} transactions</div>`;
        log.innerHTML += `<div class="text-info">🎉 Sample data generation complete!</div>`;
        status.textContent = '✅ Done!';
        showToast(`Generated ${txnCount} transactions, ${custCount} customers, ${routeCount} routes`, 'success');

        await loadAllData();
        renderAll();
        initDashboard();

    } catch (err) {
        log.innerHTML += `<div class="text-danger">❌ Error: ${err.message}</div>`;
        status.textContent = '❌ Error';
        showToast('Error generating sample data: ' + err.message, 'danger');
        console.error(err);
    }
    btn.disabled = false;
}

// ================================================================
// DOMContentLoaded - All Event Listeners
// ================================================================
document.addEventListener('DOMContentLoaded', function() {

    // Set today's date
    const txnDate = $('txnDate');
    if (txnDate) txnDate.value = getToday();
    const reportMonth = $('reportMonth');
    if (reportMonth) reportMonth.value = new Date().toISOString().slice(0, 7);
    const reportYear = $('reportYear');
    if (reportYear) reportYear.value = new Date().getFullYear();
    const reportDate = $('reportDate');
    if (reportDate) reportDate.value = getToday();

    // --- Report type change ---
    const reportType = $('reportType');
    if (reportType) {
        reportType.addEventListener('change', function() {
            const dateGroup = document.querySelector('.col-md-2:has(#reportDate)');
            if (dateGroup) {
                if (this.value === 'daily') {
                    dateGroup.classList.add('visible');
                } else {
                    dateGroup.classList.remove('visible');
                }
            }
            populateReportRouteSelect();
        });
        if (reportType.value === 'daily') {
            const dateGroup = document.querySelector('.col-md-2:has(#reportDate)');
            if (dateGroup) dateGroup.classList.add('visible');
        }
    }

    // --- LOGIN ---
    const loginClearBtn = $('loginClearBtn');
    if (loginClearBtn) {
        loginClearBtn.addEventListener('click', function() {
            const loginEmail = $('loginEmail');
            const loginPassword = $('loginPassword');
            const loginError = $('loginError');
            if (loginEmail) loginEmail.value = '';
            if (loginPassword) loginPassword.value = '';
            if (loginError) loginError.textContent = '';
            showToast('Fields cleared', 'info');
        });
    }

    const loginForm = $('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = $('loginEmail') ? $('loginEmail').value : '';
            const password = $('loginPassword') ? $('loginPassword').value : '';
            const errorDiv = $('loginError');
            const loginBtn = $('loginBtn');

            if (errorDiv) errorDiv.textContent = '';
            if (loginBtn) {
                loginBtn.disabled = true;
                loginBtn.innerHTML = '<span class="loading-spinner"></span> Logging in...';
            }

            try {
                await auth.signInWithEmailAndPassword(email, password);
                showToast('Login successful!', 'success');
            } catch (err) {
                if (errorDiv) errorDiv.textContent = err.message;
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.innerHTML = 'Login';
                }
            }
        });
    }

    // --- TRANSACTION FORM ---
    const transactionForm = $('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = $('txnEditId') ? $('txnEditId').value : '';
            const data = getTransactionFormData();

            try {
                if (editId) {
                    await db.collection('transactions').doc(editId).update(data);
                    showToast('Transaction updated successfully!');
                    const updateBtn = $('txnUpdateBtn');
                    const deleteBtn = $('txnDeleteBtn');
                    const editIdEl = $('txnEditId');
                    const saveBtn = $('txnSaveBtn');
                    const formTitle = $('txnFormTitle');
                    if (updateBtn) updateBtn.style.display = 'none';
                    if (deleteBtn) deleteBtn.style.display = 'none';
                    if (editIdEl) editIdEl.value = '';
                    if (saveBtn) saveBtn.textContent = 'Save';
                    if (formTitle) formTitle.textContent = 'Add Transaction';
                } else {
                    const customId = generateId();
                    data.id = customId;
                    data.createdAt = new Date().toISOString();
                    await db.collection('transactions').add(data);
                    showToast('Transaction saved successfully!');
                }
                if (transactionForm) transactionForm.reset();
                const txnDateEl = $('txnDate');
                if (txnDateEl) txnDateEl.value = getToday();
                await loadAllData();
                renderAll();
                initDashboard();
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
                console.error('Transaction error:', err);
            }
        });
    }

    // --- Clear Buttons ---
    const txnClearBtn = $('txnClearBtn');
    if (txnClearBtn) {
        txnClearBtn.addEventListener('click', () => {
            const form = $('transactionForm');
            if (form) form.reset();
            const txnDateEl = $('txnDate');
            if (txnDateEl) txnDateEl.value = getToday();
            const editIdEl = $('txnEditId');
            if (editIdEl) editIdEl.value = '';
            const updateBtn = $('txnUpdateBtn');
            const deleteBtn = $('txnDeleteBtn');
            const saveBtn = $('txnSaveBtn');
            const formTitle = $('txnFormTitle');
            if (updateBtn) updateBtn.style.display = 'none';
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (saveBtn) saveBtn.textContent = 'Save';
            if (formTitle) formTitle.textContent = 'Add Transaction';
            showToast('Form cleared', 'info');
        });
    }

    const txnUpdateBtn = $('txnUpdateBtn');
    if (txnUpdateBtn) {
        txnUpdateBtn.addEventListener('click', () => {
            if (transactionForm) transactionForm.dispatchEvent(new Event('submit'));
        });
    }

    const txnDeleteBtn = $('txnDeleteBtn');
    if (txnDeleteBtn) {
        txnDeleteBtn.addEventListener('click', () => {
            const id = $('txnEditId') ? $('txnEditId').value : '';
            if (id) deleteTransaction(id);
        });
    }

    // --- Search ---
    const txnSearch = $('txnSearch');
    if (txnSearch) txnSearch.addEventListener('input', renderTransactions);

    const txnRefreshBtn = $('txnRefreshBtn');
    if (txnRefreshBtn) {
        txnRefreshBtn.addEventListener('click', async () => {
            await loadAllData();
            renderAll();
            initDashboard();
            showToast('Data refreshed!', 'info');
        });
    }

    // --- Export Buttons ---
    const txnExportExcel = $('txnExportExcel');
    if (txnExportExcel) {
        txnExportExcel.addEventListener('click', () => {
            const data = state.transactions.map(t => ({
                ID: t.customId || t.id,
                Date: t.date,
                Route: t.route,
                Customer: t.customer,
                Cash: t.cash || 0,
                Cheque: t.cheque || 0,
                Credit: t.credit || 0,
                Banked: t.banked || 0,
                Expense: t.expense || 0,
                Petrol: t.petrol || 0,
                KM: t.km || '',
                Notes: t.notes || ''
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
            XLSX.writeFile(wb, `Transactions_${getToday()}.xlsx`);
            showToast('Excel exported!');
        });
    }

    const txnExportPDF = $('txnExportPDF');
    if (txnExportPDF) {
        txnExportPDF.addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape', 'mm', 'a4');
            doc.setFontSize(16);
            doc.text('Transaction Report', 14, 20);
            doc.setFontSize(10);
            doc.text('Generated: ' + new Date().toLocaleString(), 14, 28);

            const cols = ['ID', 'Date', 'Route', 'Customer', 'Cash', 'Cheque', 'Credit', 'Banked', 'Expense'];
            const rows = state.transactions.slice(0, 30).map(t => [
                t.customId || t.id || '', t.date || '', t.route || '', t.customer || '',
                (t.cash || 0).toFixed(2), (t.cheque || 0).toFixed(2),
                (t.credit || 0).toFixed(2), (t.banked || 0).toFixed(2),
                (t.expense || 0).toFixed(2)
            ]);

            if (doc.autoTable) {
                doc.autoTable({ head: [cols], body: rows, startY: 35 });
            } else {
                doc.text('PDF export requires jspdf-autotable plugin.', 14, 60);
            }
            doc.save(`Transactions_${getToday()}.pdf`);
            showToast('PDF exported!');
        });
    }

    const txnPrintBtn = $('txnPrintBtn');
    if (txnPrintBtn) {
        txnPrintBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // --- CUSTOMERS ---
    const customerForm = $('customerForm');
    if (customerForm) {
        customerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = $('custEditId') ? $('custEditId').value : '';
            const data = {
                name: $('custName') ? $('custName').value.trim() : '',
                route: $('custRoute') ? $('custRoute').value : '',
                phone: $('custPhone') ? $('custPhone').value.trim() : '',
                email: $('custEmail') ? $('custEmail').value.trim() : '',
                address: $('custAddress') ? $('custAddress').value.trim() : '',
                creditLimit: parseFloat($('custCreditLimit') ? $('custCreditLimit').value : 0) || 0,
                balance: 0,
                updatedAt: new Date().toISOString()
            };
            if (!data.name) return showToast('Name is required', 'warning');

            try {
                if (editId) {
                    await db.collection('customers').doc(editId).update(data);
                    showToast('Customer updated!');
                } else {
                    data.createdAt = new Date().toISOString();
                    await db.collection('customers').add(data);
                    showToast('Customer added!');
                }
                if (customerForm) customerForm.reset();
                const custEditId = $('custEditId');
                const custDeleteBtn = $('custDeleteBtn');
                if (custEditId) custEditId.value = '';
                if (custDeleteBtn) custDeleteBtn.style.display = 'none';
                await loadAllData();
                renderAll();
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    const custClearBtn = $('custClearBtn');
    if (custClearBtn) {
        custClearBtn.addEventListener('click', () => {
            const form = $('customerForm');
            if (form) form.reset();
            const custEditId = $('custEditId');
            const custDeleteBtn = $('custDeleteBtn');
            if (custEditId) custEditId.value = '';
            if (custDeleteBtn) custDeleteBtn.style.display = 'none';
            showToast('Form cleared', 'info');
        });
    }

    const custSearch = $('custSearch');
    if (custSearch) custSearch.addEventListener('input', renderCustomers);

    const custDeleteBtn = $('custDeleteBtn');
    if (custDeleteBtn) {
        custDeleteBtn.addEventListener('click', () => {
            const id = $('custEditId') ? $('custEditId').value : '';
            if (id) deleteCustomer(id);
        });
    }

    // Customer Route Filter
    const custRouteFilter = $('custRouteFilter');
    if (custRouteFilter) {
        custRouteFilter.addEventListener('change', renderCustomers);
    }

    // --- ROUTES ---
    const routeForm = $('routeForm');
    if (routeForm) {
        routeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = $('routeName') ? $('routeName').value.trim() : '';
            if (!name) return showToast('Route name is required', 'warning');
            const editId = $('routeEditId') ? $('routeEditId').value : '';
            try {
                if (editId) {
                    await db.collection('routes').doc(editId).update({ name });
                    showToast('Route updated!');
                } else {
                    if (state.routes.some(r => r.name.toLowerCase() === name.toLowerCase())) {
                        return showToast('Route already exists', 'warning');
                    }
                    await db.collection('routes').add({ name, createdAt: new Date().toISOString() });
                    showToast('Route added!');
                }
                if (routeForm) routeForm.reset();
                const routeEditId = $('routeEditId');
                if (routeEditId) routeEditId.value = '';
                await loadAllData();
                renderAll();
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    const routeClearBtn = $('routeClearBtn');
    if (routeClearBtn) {
        routeClearBtn.addEventListener('click', () => {
            const form = $('routeForm');
            if (form) form.reset();
            const routeEditId = $('routeEditId');
            if (routeEditId) routeEditId.value = '';
            showToast('Form cleared', 'info');
        });
    }

    // --- ROUTE EXPENSES ---
    const routeExpenseLoadBtn = $('routeExpenseLoadBtn');
    if (routeExpenseLoadBtn) {
        routeExpenseLoadBtn.addEventListener('click', loadRouteExpenses);
    }

    const routeExpenseRoute = $('routeExpenseRoute');
    if (routeExpenseRoute) {
        routeExpenseRoute.addEventListener('change', function() {
            if (this.value) loadRouteExpenses();
        });
    }

    const routeExpenseAddBtn = $('routeExpenseAddBtn');
    if (routeExpenseAddBtn) {
        routeExpenseAddBtn.addEventListener('click', function() {
            const routeSelect = $('routeExpenseRoute');
            if (!routeSelect || !routeSelect.value) {
                showToast('Please select a route first', 'warning');
                return;
            }
            navigateTo('transactions');
            setTimeout(() => {
                const route = $('txnRoute');
                const type = $('txnType');
                if (route) route.value = routeSelect.value;
                if (type) type.value = 'expense';
                if (type) type.dispatchEvent(new Event('change'));
                const expenseField = $('txnExpense');
                if (expenseField) expenseField.focus();
                const title = $('txnFormTitle');
                if (title) title.textContent = 'Add Expense for ' + routeSelect.value;
            }, 300);
        });
    }

    // --- USERS ---
    const userForm = $('userForm');
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = $('userEmail') ? $('userEmail').value.trim() : '';
            const password = $('userPassword') ? $('userPassword').value : '';
            const role = $('userRole') ? $('userRole').value : 'viewer';
            const editId = $('userEditId') ? $('userEditId').value : '';

            if (!email) return showToast('Email is required', 'warning');

            try {
                if (editId) {
                    const updates = { role, updatedAt: new Date().toISOString() };
                    if (password && password.length >= 6) {
                        showToast('Password update requires re-authentication. Use Firebase Console.', 'warning');
                    }
                    await db.collection('users').doc(editId).update(updates);
                    showToast('User updated!');
                } else {
                    if (!password || password.length < 6) {
                        return showToast('Password must be at least 6 characters', 'warning');
                    }
                    const cred = await auth.createUserWithEmailAndPassword(email, password);
                    await db.collection('users').doc(cred.user.uid).set({
                        email,
                        role,
                        created: new Date().toISOString()
                    });
                    showToast('User created!');
                }
                if (userForm) userForm.reset();
                const userEditId = $('userEditId');
                const userDeleteBtn = $('userDeleteBtn');
                if (userEditId) userEditId.value = '';
                if (userDeleteBtn) userDeleteBtn.style.display = 'none';
                await loadAllData();
                renderAll();
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    const userClearBtn = $('userClearBtn');
    if (userClearBtn) {
        userClearBtn.addEventListener('click', () => {
            const form = $('userForm');
            if (form) form.reset();
            const userEditId = $('userEditId');
            const userDeleteBtn = $('userDeleteBtn');
            if (userEditId) userEditId.value = '';
            if (userDeleteBtn) userDeleteBtn.style.display = 'none';
            showToast('Form cleared', 'info');
        });
    }

    const userDeleteBtn = $('userDeleteBtn');
    if (userDeleteBtn) {
        userDeleteBtn.addEventListener('click', () => {
            const id = $('userEditId') ? $('userEditId').value : '';
            if (id) deleteUser(id);
        });
    }

    // --- TRANSACTION TABS ---
    document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentTxnTab = this.dataset.tab;
            renderTransactions();
        });
    });

    // Transaction Route Filter
    const txnRouteFilter = $('txnRouteFilter');
    if (txnRouteFilter) {
        txnRouteFilter.addEventListener('change', renderTransactions);
    }

    // --- REPORTS ---
    const reportGenerateBtn = $('reportGenerateBtn');
    if (reportGenerateBtn) {
        reportGenerateBtn.addEventListener('click', () => {
            const type = $('reportType') ? $('reportType').value : 'daily';
            const month = $('reportMonth') ? $('reportMonth').value : '';
            const year = $('reportYear') ? $('reportYear').value : '';
            const routeCustomerValue = $('reportRoute') ? $('reportRoute').value : '';
            const date = $('reportDate') ? $('reportDate').value : '';
            generateReport(type, month, year, routeCustomerValue, date);
        });
    }

    const reportClearBtn = $('reportClearBtn');
    if (reportClearBtn) {
        reportClearBtn.addEventListener('click', () => {
            const reportType = $('reportType');
            const reportMonth = $('reportMonth');
            const reportYear = $('reportYear');
            const reportRoute = $('reportRoute');
            const reportDate = $('reportDate');
            const reportResult = $('reportResult');
            if (reportType) reportType.value = 'daily';
            if (reportMonth) reportMonth.value = new Date().toISOString().slice(0, 7);
            if (reportYear) reportYear.value = new Date().getFullYear();
            if (reportRoute) reportRoute.value = '';
            if (reportDate) reportDate.value = getToday();
            if (reportResult) {
                reportResult.innerHTML = `<div class="empty-state"><i class="bi bi-file-earmark-bar-graph"></i><p>Select criteria and click Generate</p></div>`;
            }
            populateReportRouteSelect();
            showToast('Filters cleared', 'info');
        });
    }

    const reportPrintBtn = $('reportPrintBtn');
    if (reportPrintBtn) {
        reportPrintBtn.addEventListener('click', () => {
            const content = $('reportResult') ? $('reportResult').innerHTML : '';
            if (content.includes('No data') || !content) {
                return showToast('Generate a report first', 'warning');
            }
            const win = window.open('', '_blank');
            if (win) {
                win.document.write(`
                    <html><head><title>Report</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
                    <style>body{padding:40px;}</style>
                    </head><body>
                    <div class="container">${content}</div>
                    <script>
                        setTimeout(() => window.print(), 500);
                    <\/script>
                    </body></html>
                `);
                win.document.close();
            }
        });
    }

    const reportExportPDF = $('reportExportPDF');
    if (reportExportPDF) {
        reportExportPDF.addEventListener('click', () => {
            const content = $('reportResult') ? $('reportResult').innerHTML : '';
            if (content.includes('No data') || !content) {
                return showToast('Generate a report first', 'warning');
            }
            const win = window.open('', '_blank');
            if (win) {
                win.document.write(`
                    <html><head><title>Report</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
                    <style>body{padding:40px;}</style>
                    </head><body>
                    <div class="container">${content}</div>
                    <script>
                        setTimeout(() => window.print(), 500);
                    <\/script>
                    </body></html>
                `);
                win.document.close();
            }
        });
    }

    const reportExportExcel = $('reportExportExcel');
    if (reportExportExcel) {
        reportExportExcel.addEventListener('click', () => {
            const rows = qsa('#reportResult table tbody tr');
            if (!rows.length) return showToast('No data to export', 'warning');
            const data = [];
            const headers = ['Metric', 'Amount'];
            rows.forEach(row => {
                const cells = qsa('td', row);
                if (cells.length >= 2) {
                    data.push({ [headers[0]]: cells[0].textContent.trim(), [headers[1]]: cells[1].textContent.trim() });
                }
            });
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            XLSX.writeFile(wb, `Report_${getToday()}.xlsx`);
            showToast('Report exported!');
        });
    }

    // --- CHEQUES ---
    const cheqSearch = $('cheqSearch');
    if (cheqSearch) cheqSearch.addEventListener('input', renderCheques);
    const cheqStatusFilter = $('cheqStatusFilter');
    if (cheqStatusFilter) cheqStatusFilter.addEventListener('change', renderCheques);

    // --- BACKUP ---
    let autoBackupInterval = null;

    const backupExport = $('backupExport');
    if (backupExport) {
        backupExport.addEventListener('click', async () => {
            try {
                const allData = {
                    transactions: state.transactions,
                    customers: state.customers,
                    routes: state.routes,
                    users: state.users,
                    settings: state.settings,
                    exportedAt: new Date().toISOString()
                };
                const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `JDMS_Backup_${getToday()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Backup exported successfully!');
                const history = $('backupHistory');
                if (history) {
                    history.innerHTML = `<div class="py-2 border-bottom" style="border-color:var(--border);">✅ Backup at ${new Date().toLocaleString()} (${state.transactions.length} txns)</div>` + history.innerHTML;
                }
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    const backupRestore = $('backupRestore');
    if (backupRestore) {
        backupRestore.addEventListener('click', async () => {
            const fileInput = $('backupFileInput');
            if (!fileInput || !fileInput.files.length) return showToast('Select a JSON backup file', 'warning');
            const file = fileInput.files[0];
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.transactions || !data.customers || !data.routes) {
                    return showToast('Invalid backup file format', 'danger');
                }
                const ok = await showConfirm('Restore Backup', 'This will overwrite all current data. Are you sure?');
                if (!ok) return;

                const batch = db.batch();
                for (const txn of data.transactions) {
                    const ref = db.collection('transactions').doc();
                    batch.set(ref, txn);
                }
                for (const cust of data.customers) {
                    const ref = db.collection('customers').doc();
                    batch.set(ref, cust);
                }
                for (const route of data.routes) {
                    const ref = db.collection('routes').doc();
                    batch.set(ref, route);
                }
                await batch.commit();
                showToast('Backup restored successfully!');
                await loadAllData();
                renderAll();
                initDashboard();
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    const backupAutoToggle = $('backupAutoToggle');
    if (backupAutoToggle) {
        backupAutoToggle.addEventListener('click', function() {
            if (autoBackupInterval) {
                clearInterval(autoBackupInterval);
                autoBackupInterval = null;
                this.innerHTML = '<i class="bi bi-clock me-1"></i> Auto Backup: Off';
                showToast('Auto backup disabled');
            } else {
                autoBackupInterval = setInterval(() => {
                    const exportBtn = $('backupExport');
                    if (exportBtn) exportBtn.click();
                }, 60000 * 30);
                this.innerHTML = '<i class="bi bi-clock me-1"></i> Auto Backup: On';
                showToast('Auto backup enabled (every 30 min)');
            }
        });
    }

    // --- SETTINGS ---
    const settingsForm = $('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const settings = {
                    companyName: $('setCompanyName') ? $('setCompanyName').value : 'Jayasinghe Distributors',
                    currency: $('setCurrency') ? $('setCurrency').value : 'LKR',
                    dateFormat: $('setDateFormat') ? $('setDateFormat').value : 'DD/MM/YYYY',
                    updatedAt: new Date().toISOString()
                };
                await db.collection('settings').doc('app').set(settings, { merge: true });
                state.settings = { ...state.settings, ...settings };
                showToast('Settings saved!');
                renderAll();
                initDashboard();
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    const settingsClearBtn = $('settingsClearBtn');
    if (settingsClearBtn) {
        settingsClearBtn.addEventListener('click', () => {
            const companyName = $('setCompanyName');
            const currency = $('setCurrency');
            const dateFormat = $('setDateFormat');
            if (companyName) companyName.value = 'Jayasinghe Distributors';
            if (currency) currency.value = 'LKR';
            if (dateFormat) dateFormat.value = 'DD/MM/YYYY';
            showToast('Settings reset to defaults', 'info');
        });
    }

    // --- THEME ---
    const themeSwitch = $('settingsThemeSwitch');
    const themeToggle = $('themeToggle');

    function setTheme(dark) {
        state.darkMode = dark;
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        localStorage.setItem('jdms-dark', dark);
        if (themeSwitch) {
            themeSwitch.classList.toggle('active', dark);
        }
        if (themeToggle) {
            themeToggle.innerHTML = dark ? '<i class="bi bi-sun-fill"></i>' : '<i class="bi bi-moon-fill"></i>';
        }
    }

    setTheme(state.darkMode);

    if (themeSwitch) themeSwitch.addEventListener('click', () => setTheme(!state.darkMode));
    if (themeToggle) themeToggle.addEventListener('click', () => setTheme(!state.darkMode));

    // --- LOGO ---
    const logoUploadBtn = $('logoUploadBtn');
    if (logoUploadBtn) {
        logoUploadBtn.addEventListener('click', () => {
            const fileInput = $('logoFileInput');
            if (fileInput) fileInput.click();
        });
    }

    const logoFileInput = $('logoFileInput');
    if (logoFileInput) {
        logoFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const ref = storage.ref('logos/company_logo');
                await ref.put(file);
                const url = await ref.getDownloadURL();
                await db.collection('settings').doc('app').set({ logoUrl: url }, { merge: true });
                const preview = $('logoPreview');
                if (preview) preview.innerHTML = `<img src="${url}" alt="Logo" />`;
                showToast('Logo uploaded!');
            } catch (err) {
                showToast('Error uploading logo: ' + err.message, 'danger');
            }
        });
    }

    async function loadLogo() {
        try {
            const doc = await db.collection('settings').doc('app').get();
            if (doc.exists && doc.data().logoUrl) {
                const preview = $('logoPreview');
                if (preview) preview.innerHTML = `<img src="${doc.data().logoUrl}" alt="Logo" />`;
            }
        } catch (e) {}
    }
    loadLogo();

    const logoRemoveBtn = $('logoRemoveBtn');
    if (logoRemoveBtn) {
        logoRemoveBtn.addEventListener('click', async () => {
            try {
                await db.collection('settings').doc('app').set({ logoUrl: null }, { merge: true });
                const preview = $('logoPreview');
                if (preview) preview.innerHTML = '<i class="bi bi-cloud-upload"></i>';
                showToast('Logo removed');
            } catch (err) {
                showToast('Error: ' + err.message, 'danger');
            }
        });
    }

    // --- SAMPLE DATA ---
    const generateSampleDataBtn = $('generateSampleDataBtn');
    if (generateSampleDataBtn) {
        generateSampleDataBtn.addEventListener('click', generateSampleData);
    }

    const clearSampleDataBtn = $('clearSampleDataBtn');
    if (clearSampleDataBtn) {
        clearSampleDataBtn.addEventListener('click', async () => {
            const ok = await showConfirm('Clear All Data', 'This will delete ALL transactions, customers, and routes. Are you sure?');
            if (!ok) return;

            const log = $('sampleDataLog');
            const status = $('sampleDataStatus');
            if (status) status.textContent = '⏳ Clearing...';
            if (log) log.innerHTML = '<div class="text-warning">⏳ Clearing all data...</div>';

            try {
                const txns = await db.collection('transactions').get();
                let count = 0;
                for (const doc of txns.docs) {
                    await db.collection('transactions').doc(doc.id).delete();
                    count++;
                }
                if (log) log.innerHTML += `<div class="text-danger">🗑️ Deleted ${count} transactions</div>`;

                const custs = await db.collection('customers').get();
                let custCount = 0;
                for (const doc of custs.docs) {
                    await db.collection('customers').doc(doc.id).delete();
                    custCount++;
                }
                if (log) log.innerHTML += `<div class="text-danger">🗑️ Deleted ${custCount} customers</div>`;

                const routes = await db.collection('routes').get();
                let routeCount = 0;
                for (const doc of routes.docs) {
                    await db.collection('routes').doc(doc.id).delete();
                    routeCount++;
                }
                if (log) log.innerHTML += `<div class="text-danger">🗑️ Deleted ${routeCount} routes</div>`;

                if (log) log.innerHTML += `<div class="text-success">✅ All data cleared successfully!</div>`;
                if (status) status.textContent = '✅ Cleared';
                showToast('All data cleared successfully', 'info');

                await loadAllData();
                renderAll();
                initDashboard();

            } catch (err) {
                if (log) log.innerHTML += `<div class="text-danger">❌ Error: ${err.message}</div>`;
                if (status) status.textContent = '❌ Error';
                showToast('Error clearing data: ' + err.message, 'danger');
                console.error(err);
            }
        });
    }

    // --- CHANGE PASSWORD ---
    const changePasswordForm = $('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentPassword = $('currentPassword') ? $('currentPassword').value : '';
            const newPassword = $('newPassword') ? $('newPassword').value : '';
            const confirmPassword = $('confirmPassword') ? $('confirmPassword').value : '';
            const errorEl = $('passwordChangeError');
            const successEl = $('passwordChangeSuccess');
            const statusEl = $('passwordChangeStatus');
            const btn = $('changePasswordBtn');

            if (errorEl) errorEl.textContent = '';
            if (successEl) {
                successEl.style.display = 'none';
                successEl.textContent = '';
            }
            if (statusEl) statusEl.textContent = '';

            if (newPassword.length < 6) {
                if (errorEl) errorEl.textContent = 'New password must be at least 6 characters';
                return;
            }
            if (newPassword !== confirmPassword) {
                if (errorEl) errorEl.textContent = 'Passwords do not match';
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="loading-spinner"></span> Changing...';
            }
            if (statusEl) statusEl.textContent = '⏳ Changing password...';

            try {
                await changePassword(currentPassword, newPassword);
                if (statusEl) statusEl.textContent = '';
                if (successEl) {
                    successEl.textContent = '✅ Password changed successfully!';
                    successEl.style.display = 'block';
                }
                const cp = $('currentPassword');
                const np = $('newPassword');
                const cf = $('confirmPassword');
                if (cp) cp.value = '';
                if (np) np.value = '';
                if (cf) cf.value = '';
            } catch (err) {
                if (errorEl) errorEl.textContent = err.message;
                if (statusEl) statusEl.textContent = '';
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-check-lg"></i> Change Password';
                }
            }
        });
    }

    // --- SIDEBAR NAVIGATION ---
    qsa('.sidebar-nav .nav-item[data-page]').forEach(el => {
        el.addEventListener('click', () => navigateTo(el.dataset.page));
    });

    const sidebarToggle = $('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const sidebar = $('sidebar');
            const overlay = $('sidebarOverlay');
            if (sidebar) sidebar.classList.contains('open') ? closeSidebar() : (sidebar.classList.add('open'), overlay?.classList.add('open'));
        });
    }

    const sidebarOverlay = $('sidebarOverlay');
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // --- LOGOUT ---
    const logoutBtn = $('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', performLogout);

    const topbarLogoutBtn = $('topbarLogoutBtn');
    if (topbarLogoutBtn) {
        topbarLogoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            performLogout();
        });
    }

    const topbarLogoutBtnAlt = $('topbarLogoutBtnAlt');
    if (topbarLogoutBtnAlt) topbarLogoutBtnAlt.addEventListener('click', performLogout);

    // --- USER PROFILE & SETTINGS ---
    const userProfileBtn = $('userProfileBtn');
    if (userProfileBtn) {
        userProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('profile');
            const dropdown = bootstrap.Dropdown.getInstance($('userDropdownToggle'));
            if (dropdown) dropdown.hide();
        });
    }

    const userSettingsBtn = $('userSettingsBtn');
    if (userSettingsBtn) {
        userSettingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('settings');
            const dropdown = bootstrap.Dropdown.getInstance($('userDropdownToggle'));
            if (dropdown) dropdown.hide();
        });
    }

    // --- TRANSACTION TYPE TOGGLE ---
    setupTransactionTypeToggle();

    // --- KEYBOARD SHORTCUTS ---
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            navigateTo('transactions');
        }
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            navigateTo('reports');
        }
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            navigateTo('dashboard');
        }
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });

    // --- CHEQUE NOTIFICATIONS ---
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    setInterval(checkChequeNotifications, 300000);
    setTimeout(checkChequeNotifications, 5000);
});

// ================================================================
// INIT - Start the app
// ================================================================
checkAuth();

console.log('🚀 JDMS v2.0 initialized (Full Version)');
console.log('📦 Jayasinghe Distributors Management System');
console.log('🔷 Blue & Gold Theme');
console.log('⌨️ Keyboard shortcuts: Ctrl+T (Transactions), Ctrl+R (Reports), Ctrl+D (Dashboard)');
console.log('✅ Features: Customer-Route, Route Expenses, Tabs, Notifications');
