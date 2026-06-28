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

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getToday() {
    return new Date().toISOString().split('T')[0];
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

function showLoading(btn) {
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Loading...';
    return () => { btn.disabled = false;
        btn.innerHTML = orig; };
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
            $('userAvatar').textContent = email.charAt(0).toUpperCase();
            await loadAllData();
            applyRoleRestrictions();
            initDashboard();
        } else {
            showToast('Please login to continue. (Demo mode active)', 'warning');
            demoLogin();
        }
    });
}

async function demoLogin() {
    try {
        state.currentUser = { uid: 'demo-user', email: 'demo@jdms.com' };
        state.userRole = 'admin';
        $('userAvatar').textContent = 'D';
        await loadAllData();
        applyRoleRestrictions();
        initDashboard();
        showToast('Demo mode: Logged in as Admin', 'info');
    } catch (e) {
        document.body.innerHTML =
            `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;padding:24px;text-align:center;">
                <h2>🔐 Authentication Required</h2>
                <p>Please set up Firebase Authentication or use a valid login.</p>
                <p style="font-size:13px;color:#64748b;">Check firebase-config.js and enable Email/Password auth.</p>
            </div>`;
    }
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
    const monthlyIncome = monthTxns.reduce((s, t) => s + (parseFloat(t.cash) || 0) + (parseFloat(t.cheque) || 0) + (
        parseFloat(t.credit) || 0), 0);
    const monthlyExpenses = monthTxns.reduce((s, t) => s + (parseFloat(t.expense) || 0) + (parseFloat(t.petrol) || 0),
    0);
    const profit = monthlyIncome - monthlyExpenses;

    $('dashTodayCash').textContent = formatCurrency(cashToday);
    $('dashTodayCheques').textContent = formatCurrency(chequeToday);
    $('dashPendingCheques').textContent = pendingCheques;
    $('dashTotalExpenses').textContent = formatCurrency(totalExpenses);
    $('dashMonthlyIncome').textContent = formatCurrency(monthlyIncome);
    $('dashMonthlyExpenses').textContent = formatCurrency(monthlyExpenses);
    $('dashProfit').textContent = formatCurrency(profit);
    $('dashBanked').textContent = formatCurrency(totalBanked);
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
    $('txnCount').textContent = filtered.length + ' transactions';

    if (!filtered.length) {
        tbody.innerHTML =
            `<tr><td colspan="9" class="text-center text-muted py-4">No transactions found</td></tr>`;
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

// Global functions for inline onclick
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

// Transaction Form Events
document.addEventListener('DOMContentLoaded', function() {
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
    });

    $('txnUpdateBtn').addEventListener('click', () => {
        $('transactionForm').dispatchEvent(new Event('submit'));
    });

    $('txnDeleteBtn').addEventListener('click', () => {
        const id = $('txnEditId').value;
        if (id) deleteTransaction(id);
    });

    $('txnSearch').addEventListener('input', renderTransactions);

    // Export buttons
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
});

// ================================================================
// CUSTOMERS CRUD
// ================================================================
function renderCustomers() {
    const tbody = $('custTableBody');
    const search = $('custSearch').value.toLowerCase();
    let filtered = state.customers;
    if (search) {
        filtered = filtered.filter(c =>
            (c.name || '').toLowerCase().includes(search) ||
            (c.phone || '').includes(search) ||
            (c.email || '').toLowerCase().includes(search)
        );
    }
    $('custCount').textContent = filtered.length + ' customers';

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No customers</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>${c.phone || '-'}</td>
                <td>${c.email || '-'}</td>
                <td>${formatCurrency(c.creditLimit)}</td>
                <td>${formatCurrency(c.balance || 0)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="editCustomer('${c.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomer('${c.id}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');
}

document.addEventListener('DOMContentLoaded', function() {
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

    $('custSearch').addEventListener('input', renderCustomers);

    $('custDeleteBtn').addEventListener('click', () => {
        const id = $('custEditId').value;
        if (id) deleteCustomer(id);
    });
});

window.editCustomer = function(id) {
    const c = state.customers.find(c => c.id === id);
    if (!c) return;
    $('custEditId').value = id;
    $('custName').value = c.name || '';
    $('custPhone').value = c.phone || '';
    $('custEmail').value = c.email || '';
    $('custAddress').value = c.address || '';
    $('custCreditLimit').value = c.creditLimit || '';
    $('custDeleteBtn').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteCustomer = async function(id) {
    const ok = await showConfirm('Delete Customer', 'This will also remove all associated transactions?');
    if (!ok) return;
    try {
        await db.collection('customers').doc(id).delete();
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
    const search = $('cheqSearch').value.toLowerCase();
    const statusFilter = $('cheqStatusFilter').value;

    let filtered = state.cheques;
    if (search) {
        filtered = filtered.filter(c =>
            (c.route || '').toLowerCase().includes(search) ||
            (c.customer || '').toLowerCase().includes(search) ||
            (c.chequeNo || '').toLowerCase().includes(search) ||
            (c.bank || '').toLowerCase().includes(search)
        );
    }
    if (statusFilter) {
        filtered = filtered.filter(c => c.status === statusFilter);
    }

    $('cheqPending').textContent = state.cheques.filter(c => c.status === 'pending').length;
    $('cheqCleared').textContent = state.cheques.filter(c => c.status === 'cleared').length;
    $('cheqReturned').textContent = state.cheques.filter(c => c.status === 'returned').length;
    $('cheqDeposited').textContent = state.cheques.filter(c => c.status === 'deposited').length;
    $('cheqCount').textContent = filtered.length + ' cheques';

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
                    <select class="form-select form-select-sm" style="width:auto;display:inline-block;" onchange="updateChequeStatus('${c.id}', this.value)">
                        <option value="pending" ${c.status==='pending'?'selected':''}>Pending</option>
                        <option value="cleared" ${c.status==='cleared'?'selected':''}>Cleared</option>
                        <option value="returned" ${c.status==='returned'?'selected':''}>Returned</option>
                        <option value="deposited" ${c.status==='deposited'?'selected':''}>Deposited</option>
                    </select>
                </td>
            </tr>
        `).join('');
}

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

document.addEventListener('DOMContentLoaded', function() {
    $('cheqSearch').addEventListener('input', renderCheques);
    $('cheqStatusFilter').addEventListener('change', renderCheques);
});

// ================================================================
// ROUTES CRUD
// ================================================================
function renderRoutes() {
    const tbody = $('routeTableBody');
    $('routeCount').textContent = state.routes.length + ' routes';
    if (!state.routes.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">No routes</td></tr>`;
        return;
    }
    tbody.innerHTML = state.routes.map((r, i) => `
            <tr>
                <td>${i+1}</td>
                <td><strong>${r.name}</strong></td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteRoute('${r.id}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');
    populateSelects();
}

document.addEventListener('DOMContentLoaded', function() {
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
});

window.deleteRoute = async function(id) {
    const ok = await showConfirm('Delete Route', 'Are you sure?');
    if (!ok) return;
    try {
        await db.collection('routes').doc(id).delete();
        showToast('Route deleted.');
        await loadAllData();
        renderAll();
    } catch (err) {
        showToast('Error: ' + err.message, 'danger');
    }
};

// ================================================================
// USERS CRUD
// ================================================================
function renderUsers() {
    const tbody = $('userTableBody');
    $('userCount').textContent = state.users.length + ' users';
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
                    <button class="btn btn-sm btn-outline-primary" onclick="editUser('${u.id}')"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${u.id}')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');
}

document.addEventListener('DOMContentLoaded', function() {
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

    $('userDeleteBtn').addEventListener('click', () => {
        const id = $('userEditId').value;
        if (id) deleteUser(id);
    });
});

window.editUser = function(id) {
    const u = state.users.find(u => u.id === id);
    if (!u) return;
    $('userEditId').value = id;
    $('userEmail').value = u.email || '';
    $('userPassword').value = '';
    $('userRole').value = u.role || 'viewer';
    $('userDeleteBtn').style.display = 'inline-block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteUser = async function(id) {
    if (id === state.currentUser?.uid) {
        return showToast('Cannot delete yourself', 'warning');
    }
    const ok = await showConfirm('Delete User', 'Are you sure?');
    if (!ok) return;
    try {
        await db.collection('users').doc(id).delete();
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
document.addEventListener('DOMContentLoaded', function() {
    $('reportGenerateBtn').addEventListener('click', () => {
        const type = $('reportType').value;
        const month = $('reportMonth').value;
        const year = $('reportYear').value;
        const route = $('reportRoute').value;
        generateReport(type, month, year, route);
    });

    $('reportExportPDF').addEventListener('click', () => {
        const content = $('reportResult').innerHTML;
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
});

function generateReport(type, month, year, route) {
    const container = $('reportResult');
    let data = [...state.transactions];

    if (type === 'daily' && month) {
        data = data.filter(t => t.date === month);
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
    } else if (type === 'route' && route) {
        data = data.filter(t => t.route === route);
    } else if (type === 'customer' && route) {
        data = data.filter(t => t.customer === route);
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

    const totalCash = data.reduce((s, t) => s + (parseFloat(t.cash) || 0), 0);
    const totalCheque = data.reduce((s, t) => s + (parseFloat(t.cheque) || 0), 0);
    const totalCredit = data.reduce((s, t) => s + (parseFloat(t.credit) || 0), 0);
    const totalExpense = data.reduce((s, t) => s + (parseFloat(t.expense) || 0), 0);
    const totalPetrol = data.reduce((s, t) => s + (parseFloat(t.petrol) || 0), 0);
    const totalBanked = data.reduce((s, t) => s + (parseFloat(t.banked) || 0), 0);
    const totalIncome = totalCash + totalCheque + totalCredit;
    const totalCost = totalExpense + totalPetrol;
    const profit = totalIncome - totalCost;

    let html = `
            <div class="table-responsive">
                <h6 class="fw-semibold mb-3">Report: ${type.toUpperCase()} ${month||year||route?'('+(month||year||route)+')':''}</h6>
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
// BACKUP
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
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
            const ok = await showConfirm('Restore Backup',
                'This will overwrite all current data. Are you sure?');
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
});

// ================================================================
// SETTINGS
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
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

    // Theme toggle
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

    // Logo upload
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
        settings: 'Settings'
    };
    $('pageTitle').textContent = titles[page] || page;

    closeSidebar();

    if (page === 'dashboard') initDashboard();
    if (page === 'transactions') renderTransactions();
    if (page === 'cheques') renderCheques();
    if (page === 'reports') {
        $('reportMonth').value = new Date().toISOString().slice(0, 7);
        $('reportYear').value = new Date().getFullYear();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    qsa('.sidebar-nav .nav-item[data-page]').forEach(el => {
        el.addEventListener('click', () => navigateTo(el.dataset.page));
    });

    // Sidebar toggle
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

    // Logout
    $('logoutBtn').addEventListener('click', async () => {
        const ok = await showConfirm('Logout', 'Are you sure you want to logout?');
        if (!ok) return;
        try {
            await auth.signOut();
            showToast('Logged out');
            location.reload();
        } catch (err) {
            showToast('Error: ' + err.message, 'danger');
        }
    });
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
        dot.style.display = 'block';
        dot.textContent = overdue.length;
        if (Notification.permission === 'granted') {
            new Notification('JDMS - Overdue Cheques', {
                body: `${overdue.length} cheque(s) are overdue by more than 7 days.`,
                icon: 'https://via.placeholder.com/64/1a3a6b/fff?text=JD'
            });
        }
    } else {
        $('notifDot').style.display = 'none';
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

    const adminItems = ['users', 'backup', 'settings'];
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
document.addEventListener('DOMContentLoaded', function() {
    $('txnDate').value = getToday();
    $('reportMonth').value = new Date().toISOString().slice(0, 7);
    $('reportYear').value = new Date().getFullYear();

    // Start auth
    checkAuth();

    console.log('🚀 JDMS v2.0 initialized');
    console.log('📦 Jayasinghe Distributors Management System');
    console.log('🔷 Blue & Gold Theme');
    console.log('📊 Firebase + Chart.js + SheetJS');
});
