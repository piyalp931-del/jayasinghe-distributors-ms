// ================================================================
// assets/js/app.js - Main Application Logic
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
        $('confirmTitle').textContent = title;
        $('confirmBody').textContent = body;
        const modal = new bootstrap.Modal($('confirmModal'));
        $('confirmOkBtn').onclick = () => { modal.hide();
            resolve(true); };
        modal.show();
        $('confirmModal').addEventListener('hidden.bs.modal', () => { resolve(false); }, { once: true });
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
        // Reset UI - will be handled by onAuthStateChanged
        // Clear state
        state.currentUser = null;
        state.userRole = 'viewer';
        // No reload needed, onAuthStateChanged will show login page
    } catch (err) {
        showToast('Error during logout: ' + err.message, 'danger');
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
                        created: new Date().toISOString()
                    });
                    state.userRole = 'admin';
                }
            } catch (e) {
                state.userRole = 'viewer';
            }
            const email = user.email || 'U';
            const displayName = email.split('@')[0] || 'User';
            $('userAvatar').textContent = displayName.charAt(0).toUpperCase();
            $('userDisplayName').textContent = displayName;
            $('userEmailDisplay').textContent = email;
            $('userRoleBadge').textContent = state.userRole.charAt(0).toUpperCase() + state.userRole.slice(1);
            
            // Show main app, hide login
            $('loginPage').style.display = 'none';
            $('mainApp').style.display = 'block';
            
            await loadAllData();
            applyRoleRestrictions();
            initDashboard();
            updateChequeBadge();
            updateTopbarStats();
            updateLastUpdated();
        } else {
            // No user, ensure login page is shown
            $('loginPage').style.display = 'flex';
            $('mainApp').style.display = 'none';
            // Do NOT auto-login - Demo mode is now manual only
        }
    });
}

// Manual Demo Login (triggered by button)
async function demoLogin() {
    try {
        // Set a fake user state
        state.currentUser = { uid: 'demo-user', email: 'demo@jdms.com' };
        state.userRole = 'admin';
        $('userAvatar').textContent = 'D';
        $('userDisplayName').textContent = 'Demo';
        $('userEmailDisplay').textContent = 'demo@jdms.com';
        $('userRoleBadge').textContent = 'Admin';
        
        $('loginPage').style.display = 'none';
        $('mainApp').style.display = 'block';
        
        await loadAllData();
        applyRoleRestrictions();
        initDashboard();
        updateChequeBadge();
        updateTopbarStats();
        updateLastUpdated();
        showToast('Demo mode: Logged in as Admin', 'info');
    } catch (e) {
        console.error('Demo login error:', e);
        showToast('Error loading demo data: ' + e.message, 'danger');
    }
}

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
    if ($('topbarTodayCash')) $('topbarTodayCash').textContent = formatCurrencyShort(cashToday);
    if ($('topbarPendingCheques')) $('topbarPendingCheques').textContent = pendingCheques;
}

// ================================================================
// LOAD DATA
// ================================================================
async function loadAllData() {
    try {
        const txnSnap = await db.collection('transactions').orderBy('date', 'desc').get();
        state.transactions = txnSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const custSnap = await db.collection('customers').orderBy('name').get();
        state.customers = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const routeSnap = await db.collection('routes').orderBy('name').get();
        state.routes = routeSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const userSnap = await db.collection('users').get();
        state.users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const settingsSnap = await db.collection('settings').doc('app').get();
        if (settingsSnap.exists) {
            state.settings = { ...state.settings, ...settingsSnap.data() };
            const s = state.settings;
            if ($('setCompanyName')) $('setCompanyName').value = s.companyName || 'Jayasinghe Distributors';
            if ($('setCurrency')) $('setCurrency').value = s.currency || 'LKR';
            if ($('setDateFormat')) $('setDateFormat').value = s.dateFormat || 'DD/MM/YYYY';
        }

        state.cheques = state.transactions
            .filter(t => t.cheque && parseFloat(t.cheque) > 0)
            .map(t => ({
                id: t.id,
                date: t.date,
                route: t.route,
                customer: t.customer || 'N/A',
                chequeNo: t.chequeNo || 'N/A',
                bank: t.bank || 'N/A',
                amount: parseFloat(t.cheque) || 0,
                chequeDate: t.chequeDate || t.date,
                status: t.chequeStatus || 'pending',
                transactionId: t.id,
            }));

        renderAll();
        updateTopbarStats();

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
    updateChequeBadge();
    updateTopbarStats();
    updateLastUpdated();
}

// ================================================================
// POPULATE SELECTS
// ================================================================
function populateSelects() {
    const routeSelects = ['txnRoute', 'reportRoute'];
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
        if (current) sel.value = current;
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
        if (current) custSel.value = current;
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

    if ($('dashTodayCash')) $('dashTodayCash').textContent = formatCurrency(cashToday);
    if ($('dashTodayCheques')) $('dashTodayCheques').textContent = formatCurrency(chequeToday);
    if ($('dashPendingCheques')) $('dashPendingCheques').textContent = pendingCheques;
    if ($('dashTotalExpenses')) $('dashTotalExpenses').textContent = formatCurrency(totalExpenses);
    if ($('dashMonthlyIncome')) $('dashMonthlyIncome').textContent = formatCurrency(monthlyIncome);
    if ($('dashMonthlyExpenses')) $('dashMonthlyExpenses').textContent = formatCurrency(monthlyExpenses);
    if ($('dashProfit')) $('dashProfit').textContent = formatCurrency(profit);
    if ($('dashBanked')) $('dashBanked').textContent = formatCurrency(totalBanked);

    if ($('topbarTodayCash')) $('topbarTodayCash').textContent = formatCurrencyShort(cashToday);
    if ($('topbarPendingCheques')) $('topbarPendingCheques').textContent = pendingCheques;
}

function renderRecentTransactions() {
    const container = $('recentTransactions');
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
// TRANSACTIONS CRUD
// ================================================================
function renderTransactions() {
    const tbody = $('txnTableBody');
    const search = $('txnSearch').value.toLowerCase();
    let filtered = state.transactions;
    if (search) {
        filtered = filtered.filter(t =>
            (t.route || '').toLowerCase().includes(search) ||
            (t.customer || '').toLowerCase().includes(search) ||
            (t.id || '').toLowerCase().includes(search)
        );
    }
    if ($('txnCount')) $('txnCount').textContent = filtered.length + ' transactions';

    const totalAmount = filtered.reduce((s, t) => s + (parseFloat(t.cash) || 0) + (parseFloat(t.cheque) || 0), 0);
    if ($('txnTotalAmount')) $('txnTotalAmount').textContent = 'Total: ' + formatCurrency(totalAmount);

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No transactions found</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.slice(0, 50).map(t => `
            <tr>
                <td><code style="font-size:12px;">${t.id || 'N/A'}</code></td>
                <td>${formatDate(t.date)}</td>
                <td>${t.route || '-'}</td>
                <td>${t.customer || '-'}</td>
                <td>${formatCurrency(t.cash)}</td>
                <td>${formatCurrency(t.cheque)}</td>
                <td>${formatCurrency(t.credit)}</td>
                <td>${formatCurrency(t.banked)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editTransaction('${t.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTransaction('${t.id}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');
}

function getTransactionFormData() {
    return {
        date: $('txnDate').value,
        route: $('txnRoute').value,
        deliveryDate: $('txnDeliveryDate').value || null,
        customer: $('txnCustomer').value || null,
        cash: parseFloat($('txnCash').value) || 0,
        cheque: parseFloat($('txnCheque').value) || 0,
        chequeNo: $('txnChequeNo').value || null,
        bank: $('txnBank').value || null,
        branch: $('txnBranch').value || null,
        chequeDate: $('txnChequeDate').value || null,
        credit: parseFloat($('txnCredit').value) || 0,
        advance: parseFloat($('txnAdvance').value) || 0,
        expense: parseFloat($('txnExpense').value) || 0,
        expenseReason: $('txnExpenseReason').value || null,
        petrol: parseFloat($('txnPetrol').value) || 0,
        km: $('txnKM').value || null,
        banked: parseFloat($('txnBanked').value) || 0,
        primary: $('txnPrimary').value || null,
        driver: $('txnDriver').value || null,
        notes: $('txnNotes').value || null,
        chequeStatus: 'pending',
    };
}

window.editTransaction = async function(id) {
    const txn = state.transactions.find(t => t.id === id);
    if (!txn) return;
    $('txnEditId').value = id;
    $('txnDate').value = txn.date || '';
    $('txnRoute').value = txn.route || '';
    $('txnDeliveryDate').value = txn.deliveryDate || '';
    $('txnCustomer').value = txn.customer || '';
    $('txnCash').value = txn.cash || '';
    $('txnCheque').value = txn.cheque || '';
    $('txnChequeNo').value = txn.chequeNo || '';
    $('txnBank').value = txn.bank || '';
    $('txnBranch').value = txn.branch || '';
    $('txnChequeDate').value = txn.chequeDate || '';
    $('txnCredit').value = txn.credit || '';
    $('txnAdvance').value = txn.advance || '';
    $('txnExpense').value = txn.expense || '';
    $('txnExpenseReason').value = txn.expenseReason || '';
    $('txnPetrol').value = txn.petrol || '';
    $('txnKM').value = txn.km || '';
    $('txnBanked').value = txn.banked || '';
    $('txnPrimary').value = txn.primary || '';
    $('txnDriver').value = txn.driver || '';
    $('txnNotes').value = txn.notes || '';
    $('txnUpdateBtn').style.display = 'inline-block';
    $('txnDeleteBtn').style.display = 'inline-block';
    $('txnSaveBtn').textContent = 'Update';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('txnFormTitle').textContent = 'Edit Transaction';
};

window.deleteTransaction = async function(id) {
    const ok = await showConfirm('Delete Transaction', 'Are you sure you want to delete this transaction?');
    if (!ok) return;
    try {
        await db.collection('transactions').doc(id).delete();
        showToast('Transaction deleted.');
        await loadAllData();
        renderAll();
        initDashboard();
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
    }
};

// ================================================================
// TRANSACTION FORM EVENTS
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    if ($('txnDate')) $('txnDate').value = getToday();
    if ($('reportMonth')) $('reportMonth').value = new Date().toISOString().slice(0, 7);
    if ($('reportYear')) $('reportYear').value = new Date().getFullYear();

    // --- LOGIN CLEAR BUTTON ---
    $('loginClearBtn').addEventListener('click', function() {
        $('loginEmail').value = '';
        $('loginPassword').value = '';
        $('loginError').textContent = '';
        showToast('Fields cleared', 'info');
    });

    // --- LOGIN FORM ---
    $('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('loginEmail').value;
        const password = $('loginPassword').value;
        const errorDiv = $('loginError');
        const loginBtn = $('loginBtn');

        errorDiv.textContent = '';
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loading-spinner"></span> Logging in...';

        try {
            await auth.signInWithEmailAndPassword(email, password);
            showToast('Login successful!', 'success');
        } catch (err) {
            errorDiv.textContent = err.message;
            loginBtn.disabled = false;
            loginBtn.innerHTML = 'Login';
        }
    });

    // --- DEMO LOGIN BUTTON ---
    $('demoLoginBtn').addEventListener('click', demoLogin);

    // --- TRANSACTION FORM ---
    $('transactionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = $('txnEditId').value;
        const data = getTransactionFormData();

        try {
            if (editId) {
                await db.collection('transactions').doc(editId).update(data);
                showToast('Transaction updated successfully!');
                $('txnUpdateBtn').style.display = 'none';
                $('txnDeleteBtn').style.display = 'none';
                $('txnEditId').value = '';
                $('txnSaveBtn').textContent = 'Save';
                $('txnFormTitle').textContent = 'Add Transaction';
            } else {
                data.id = generateId();
                data.createdAt = new Date().toISOString();
                await db.collection('transactions').add(data);
                showToast('Transaction saved successfully!');
            }
            $('transactionForm').reset();
            $('txnDate').value = getToday();
            await loadAllData();
            renderAll();
            initDashboard();
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    });

    $('txnClearBtn').addEventListener('click', () => {
        $('transactionForm').reset();
        $('txnDate').value = getToday();
        $('txnEditId').value = '';
        $('txnUpdateBtn').style.display = 'none';
        $('txnDeleteBtn').style.display = 'none';
        $('txnSaveBtn').textContent = 'Save';
        $('txnFormTitle').textContent = 'Add Transaction';
        showToast('Form cleared', 'info');
    });

    $('txnUpdateBtn').addEventListener('click', () => {
        $('transactionForm').dispatchEvent(new Event('submit'));
    });

    $('txnDeleteBtn').addEventListener('click', () => {
        const id = $('txnEditId').value;
        if (id) deleteTransaction(id);
    });

    $('txnSearch').addEventListener('input', renderTransactions);
    $('txnRefreshBtn').addEventListener('click', async () => {
        await loadAllData();
        renderAll();
        initDashboard();
        showToast('Data refreshed!', 'info');
    });

    $('txnViewReportBtn').addEventListener('click', () => {
        navigateTo('reports');
        setTimeout(() => {
            $('reportType').value = 'monthly';
            $('reportMonth').value = new Date().toISOString().slice(0, 7);
            $('reportGenerateBtn').click();
        }, 300);
    });

    $('txnExportExcel').addEventListener('click', () => {
        const data = state.transactions.map(t => ({
            ID: t.id,
            Date: t.date,
            Route: t.route,
            Customer: t.customer,
            Cash: t.cash || 0,
            Cheque: t.cheque || 0,
            Credit: t.credit || 0,
            Banked: t.banked || 0,
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

    $('txnExportPDF').addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        doc.setFontSize(16);
        doc.text('Transaction Report', 14, 20);
        doc.setFontSize(10);
        doc.text('Generated: ' + new Date().toLocaleString(), 14, 28);

        const cols = ['ID', 'Date', 'Route', 'Customer', 'Cash', 'Cheque', 'Credit', 'Banked'];
        const rows = state.transactions.slice(0, 30).map(t => [
            t.id || '', t.date || '', t.route || '', t.customer || '',
            (t.cash || 0).toFixed(2), (t.cheque || 0).toFixed(2),
            (t.credit || 0).toFixed(2), (t.banked || 0).toFixed(2)
        ]);

        if (doc.autoTable) {
            doc.autoTable({ head: [cols], body: rows, startY: 35 });
        } else {
            doc.text('PDF export requires jspdf-autotable plugin.', 14, 60);
        }
        doc.save(`Transactions_${getToday()}.pdf`);
        showToast('PDF exported!');
    });

    $('txnPrintBtn').addEventListener('click', () => {
        window.print();
    });

    // ================================================================
    // CUSTOMERS
    // ================================================================
    $('customerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = $('custEditId').value;
        const data = {
            name: $('custName').value.trim(),
            phone: $('custPhone').value.trim(),
            email: $('custEmail').value.trim(),
            address: $('custAddress').value.trim(),
            creditLimit: parseFloat($('custCreditLimit').value) || 0,
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
            $('customerForm').reset();
            $('custEditId').value = '';
            $('custDeleteBtn').style.display = 'none';
            await loadAllData();
            renderAll();
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    });

    $('custClearBtn').addEventListener('click', () => {
        $('customerForm').reset();
        $('custEditId').value = '';
        $('custDeleteBtn').style.display = 'none';
        showToast('Form cleared', 'info');
    });

    $('custSearch').addEventListener('input', renderCustomers);
    $('custDeleteBtn').addEventListener('click', () => {
        const id = $('custEditId').value;
        if (id) deleteCustomer(id);
    });

    // ================================================================
    // ROUTES
    // ================================================================
    $('routeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('routeName').value.trim();
        if (!name) return showToast('Route name is required', 'warning');
        const editId = $('routeEditId').value;
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
            $('routeForm').reset();
            $('routeEditId').value = '';
            await loadAllData();
            renderAll();
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    });

    $('routeClearBtn').addEventListener('click', () => {
        $('routeForm').reset();
        $('routeEditId').value = '';
        showToast('Form cleared', 'info');
    });

    // ================================================================
    // USERS
    // ================================================================
    $('userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('userEmail').value.trim();
        const password = $('userPassword').value;
        const role = $('userRole').value;
        const editId = $('userEditId').value;

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
            $('userForm').reset();
            $('userEditId').value = '';
            $('userDeleteBtn').style.display = 'none';
            await loadAllData();
            renderAll();
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    });

    $('userClearBtn').addEventListener('click', () => {
        $('userForm').reset();
        $('userEditId').value = '';
        $('userDeleteBtn').style.display = 'none';
        showToast('Form cleared', 'info');
    });

    $('userDeleteBtn').addEventListener('click', () => {
        const id = $('userEditId').value;
        if (id) deleteUser(id);
    });

    // ================================================================
    // REPORTS
    // ================================================================
    $('reportGenerateBtn').addEventListener('click', () => {
        const type = $('reportType').value;
        const month = $('reportMonth').value;
        const year = $('reportYear').value;
        const route = $('reportRoute').value;
        generateReport(type, month, year, route);
    });

    $('reportClearBtn').addEventListener('click', () => {
        $('reportType').value = 'daily';
        $('reportMonth').value = new Date().toISOString().slice(0, 7);
        $('reportYear').value = new Date().getFullYear();
        $('reportRoute').value = '';
        $('reportResult').innerHTML =
            `<div class="empty-state"><i class="bi bi-file-earmark-bar-graph"></i><p>Select criteria and click Generate</p></div>`;
        showToast('Filters cleared', 'info');
    });

    $('reportPrintBtn').addEventListener('click', () => {
        const content = $('reportResult').innerHTML;
        if (content.includes('No data')) {
            return showToast('Generate a report first', 'warning');
        }
        const win = window.open('', '_blank');
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
    });

    $('reportExportPDF').addEventListener('click', () => {
        const content = $('reportResult').innerHTML;
        if (content.includes('No data')) {
            return showToast('Generate a report first', 'warning');
        }
        const win = window.open('', '_blank');
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
    });

    $('reportExportExcel').addEventListener('click', () => {
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

    // ================================================================
    // BACKUP
    // ================================================================
    let autoBackupInterval = null;

    $('backupExport').addEventListener('click', async () => {
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
            history.innerHTML =
                `<div class="py-2 border-bottom" style="border-color:var(--border);">✅ Backup at ${new Date().toLocaleString()} (${state.transactions.length} txns)</div>` +
                history.innerHTML;
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    });

    $('backupRestore').addEventListener('click', async () => {
        const fileInput = $('backupFileInput');
        if (!fileInput.files.length) return showToast('Select a JSON backup file', 'warning');
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

    $('backupAutoToggle').addEventListener('click', function() {
        if (autoBackupInterval) {
            clearInterval(autoBackupInterval);
            autoBackupInterval = null;
            this.innerHTML = '<i class="bi bi-clock me-1"></i> Auto Backup: Off';
            showToast('Auto backup disabled');
        } else {
            autoBackupInterval = setInterval(() => {
                $('backupExport').click();
            }, 60000 * 30);
            this.innerHTML = '<i class="bi bi-clock me-1"></i> Auto Backup: On';
            showToast('Auto backup enabled (every 30 min)');
        }
    });

    // ================================================================
    // SETTINGS
    // ================================================================
    $('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const settings = {
                companyName: $('setCompanyName').value,
                currency: $('setCurrency').value,
                dateFormat: $('setDateFormat').value,
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

    $('settingsClearBtn').addEventListener('click', () => {
        $('setCompanyName').value = 'Jayasinghe Distributors';
        $('setCurrency').value = 'LKR';
        $('setDateFormat').value = 'DD/MM/YYYY';
        showToast('Settings reset to defaults', 'info');
    });

    // Theme
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

    themeSwitch?.addEventListener('click', () => setTheme(!state.darkMode));
    themeToggle?.addEventListener('click', () => setTheme(!state.darkMode));

    // Logo
    $('logoUploadBtn').addEventListener('click', () => $('logoFileInput').click());
    $('logoFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const ref = storage.ref('logos/company_logo');
            await ref.put(file);
            const url = await ref.getDownloadURL();
            await db.collection('settings').doc('app').set({ logoUrl: url }, { merge: true });
            $('logoPreview').innerHTML = `<img src="${url}" alt="Logo" />`;
            showToast('Logo uploaded!');
        } catch (err) {
            showToast('Error uploading logo: ' + err.message, 'danger');
        }
    });

    async function loadLogo() {
        try {
            const doc = await db.collection('settings').doc('app').get();
            if (doc.exists && doc.data().logoUrl) {
                $('logoPreview').innerHTML = `<img src="${doc.data().logoUrl}" alt="Logo" />`;
            }
        } catch (e) {}
    }
    loadLogo();

    $('logoRemoveBtn').addEventListener('click', async () => {
        try {
            await db.collection('settings').doc('app').set({ logoUrl: null }, { merge: true });
            $('logoPreview').innerHTML = '<i class="bi bi-cloud-upload"></i>';
            showToast('Logo removed');
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    });

    // ================================================================
    // SAMPLE DATA
    // ================================================================
    $('generateSampleDataBtn').addEventListener('click', async () => {
        const btn = $('generateSampleDataBtn');
        const status = $('sampleDataStatus');
        const log = $('sampleDataLog');

        btn.disabled = true;
        status.textContent = '⏳ Generating...';
        log.innerHTML = '<div class="text-info">⏳ Generating sample data...</div>';

        try {
            const sampleRoutes = ['Colombo North', 'Colombo South', 'Kandy', 'Galle', 'Matara', 'Negombo', 'Kalutara'];
            const sampleCustomers = [
                'Lanka Traders', 'City Mart', 'Sunshine Stores', 'Green Valley', 'Ocean Enterprises',
                'Royal Distributors', 'Prime Supplies', 'Lakshmi Stores', 'Ceylon Wholesale', 'Island Traders'
            ];
            const sampleChequeNos = ['CHQ-001', 'CHQ-002', 'CHQ-003', 'CHQ-004', 'CHQ-005'];

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

                    const txn = {
                        id: generateId(),
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
                        primary: customer.split(' ')[0],
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
    });

    $('clearSampleDataBtn').addEventListener('click', async () => {
        const ok = await showConfirm('Clear All Data', 'This will delete ALL transactions, customers, and routes. Are you sure?');
        if (!ok) return;

        const log = $('sampleDataLog');
        const status = $('sampleDataStatus');
        status.textContent = '⏳ Clearing...';
        log.innerHTML = '<div class="text-warning">⏳ Clearing all data...</div>';

        try {
            const txns = await db.collection('transactions').get();
            let count = 0;
            for (const doc of txns.docs) {
                await db.collection('transactions').doc(doc.id).delete();
                count++;
            }
            log.innerHTML += `<div class="text-danger">🗑️ Deleted ${count} transactions</div>`;

            const custs = await db.collection('customers').get();
            let custCount = 0;
            for (const doc of custs.docs) {
                await db.collection('customers').doc(doc.id).delete();
                custCount++;
            }
            log.innerHTML += `<div class="text-danger">🗑️ Deleted ${custCount} customers</div>`;

            const routes = await db.collection('routes').get();
            let routeCount = 0;
            for (const doc of routes.docs) {
                await db.collection('routes').doc(doc.id).delete();
                routeCount++;
            }
            log.innerHTML += `<div class="text-danger">🗑️ Deleted ${routeCount} routes</div>`;

            log.innerHTML += `<div class="text-success">✅ All data cleared successfully!</div>`;
            status.textContent = '✅ Cleared';
            showToast('All data cleared successfully', 'info');

            await loadAllData();
            renderAll();
            initDashboard();

        } catch (err) {
            log.innerHTML += `<div class="text-danger">❌ Error: ${err.message}</div>`;
            status.textContent = '❌ Error';
            showToast('Error clearing data: ' + err.message, 'danger');
            console.error(err);
        }
    });

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
            routes: 'Routes',
            reports: 'Reports',
            users: 'Users',
            backup: 'Backup',
            settings: 'Settings',
            'sample-data': 'Sample Data'
        };
        if ($('pageTitle')) $('pageTitle').textContent = titles[page] || page;

        closeSidebar();

        if (page === 'dashboard') initDashboard();
        if (page === 'transactions') renderTransactions();
        if (page === 'cheques') renderCheques();
        if (page === 'reports') {
            if ($('reportMonth')) $('reportMonth').value = new Date().toISOString().slice(0, 7);
            if ($('reportYear')) $('reportYear').value = new Date().getFullYear();
        }
    }

    window.navigateTo = navigateTo;

    qsa('.sidebar-nav .nav-item[data-page]').forEach(el => {
        el.addEventListener('click', () => navigateTo(el.dataset.page));
    });

    const sidebar = $('sidebar');
    const overlay = $('sidebarOverlay');

    function openSidebar() {
        sidebar.classList.add('open');
        overlay.classList.add('open');
    }

    window.closeSidebar = function() {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    };

    $('sidebarToggle').addEventListener('click', () => {
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    overlay.addEventListener('click', closeSidebar);

    // ================================================================
    // LOGOUT - Multiple triggers
    // ================================================================
    $('logoutBtn').addEventListener('click', performLogout);
    $('topbarLogoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        performLogout();
    });
    $('topbarLogoutBtnAlt').addEventListener('click', performLogout);

    $('userProfileBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Profile page coming soon!', 'info');
    });

    $('userSettingsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('settings');
        const dropdown = bootstrap.Dropdown.getInstance($('userDropdownToggle'));
        if (dropdown) dropdown.hide();
    });

    // ================================================================
    // CHEQUES
    // ================================================================
    window.updateChequeStatus = async function(txnId, newStatus) {
        try {
            await db.collection('transactions').doc(txnId).update({ chequeStatus: newStatus });
            showToast('Cheque status updated to ' + newStatus);
            await loadAllData();
            renderAll();
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    };

    $('cheqSearch').addEventListener('input', renderCheques);
    $('cheqStatusFilter').addEventListener('change', renderCheques);

    // ================================================================
    // KEYBOARD SHORTCUTS
    // ================================================================
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

    // ================================================================
    // NOTIFICATIONS
    // ================================================================
    function checkNotifications() {
        const today = new Date();
        const overdue = state.cheques.filter(c => {
            if (c.status !== 'pending') return false;
            const chqDate = new Date(c.chequeDate);
            if (isNaN(chqDate)) return false;
            const diff = (today - chqDate) / (1000 * 60 * 60 * 24);
            return diff > 7;
        });

        if (overdue.length > 0) {
            const dot = $('notifDot');
            if (dot) {
                dot.style.display = 'block';
                dot.textContent = overdue.length;
            }
            if (Notification.permission === 'granted') {
                new Notification('JDMS - Overdue Cheques', {
                    body: `${overdue.length} cheque(s) are overdue by more than 7 days.`,
                    icon: 'https://via.placeholder.com/64/1a3a6b/fff?text=JD'
                });
            }
        } else {
            const dot = $('notifDot');
            if (dot) dot.style.display = 'none';
        }
    }

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    setInterval(checkNotifications, 300000);
    setTimeout(checkNotifications, 3000);

    // ================================================================
    // ROLE RESTRICTIONS
    // ================================================================
    function applyRoleRestrictions() {
        const role = state.userRole;
        const isAdmin = role === 'admin';
        const isManager = role === 'manager' || isAdmin;
        const isViewer = role === 'viewer';

        const adminItems = ['users', 'backup', 'settings', 'sample-data'];
        adminItems.forEach(page => {
            const el = qs(`.sidebar-nav .nav-item[data-page="${page}"]`);
            if (el) el.style.display = isAdmin ? 'flex' : 'none';
        });

        if (isViewer) {
            qsa('.btn-outline-primary, .btn-outline-danger, .btn-danger').forEach(el => {
                if (el.closest('.table-wrapper') || el.closest('.stat-card')) {
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.5';
                }
            });
        } else {
            qsa('.btn-outline-primary, .btn-outline-danger, .btn-danger').forEach(el => {
                el.style.pointerEvents = '';
                el.style.opacity = '';
            });
        }
    }

    // ================================================================
    // INIT
    // ================================================================
    checkAuth();

    console.log('🚀 JDMS v2.0 initialized');
    console.log('📦 Jayasinghe Distributors Management System');
    console.log('🔷 Blue & Gold Theme');
    console.log('📊 Firebase + Chart.js + SheetJS');
    console.log('⌨️ Keyboard shortcuts: Ctrl+T (Transactions), Ctrl+R (Reports), Ctrl+D (Dashboard)');
});
