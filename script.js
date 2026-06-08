document.addEventListener('DOMContentLoaded', function() {
(
    function()
    {
    // Elements
    const incomesList = document.getElementById('incomes-list');
    const expensesList = document.getElementById('expenses-list');
    const addIncomeBtn = document.getElementById('add-income');
    const addExpenseBtn = document.getElementById('add-expense');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpensesEl = document.getElementById('total-expenses');
    const netSavingsEl = document.getElementById('net-savings');
    const savingsRateEl = document.getElementById('savings-rate');
    const exportCsvBtn = document.getElementById('export-csv');
    const saveNowBtn = document.getElementById('save-now');
    const clearAllBtn = document.getElementById('clear-all');
    const importSampleBtn = document.getElementById('import-sample');
    const toggleMonthlyBtn = document.getElementById('toggle-monthly');
    const toggleAnnualBtn  = document.getElementById('toggle-annual');
    let currentPeriod = 'monthly';
    const currencySelect   = document.getElementById('currency-select');

    function getCurrencySymbol(){ return currencySelect.value; }

    currencySelect.addEventListener('change', recalc);

    // Dark mode
    const darkToggleBtn = document.getElementById('dark-toggle');

    function applyDarkMode(on) {
      document.body.classList.toggle('dark-mode', on);
      darkToggleBtn.textContent = on ? '☀️' : '🌙';
      localStorage.setItem('darkMode', on ? '1' : '0');
    }

    darkToggleBtn.addEventListener('click', () => {
      applyDarkMode(!document.body.classList.contains('dark-mode'));
    });

    // restore preference on load
    if(localStorage.getItem('darkMode') === '1') applyDarkMode(true);
    const goalInput    = document.getElementById('goal-input');
    const progressBar  = document.getElementById('progress-bar');
    const goalMessage  = document.getElementById('goal-message');
    const goalStatus   = document.getElementById('goal-status');

    const CATEGORIES = [
      { label: 'Housing',       color: '#6366f1' },
      { label: 'Food',          color: '#22c55e' },
      { label: 'Transport',     color: '#f59e0b' },
      { label: 'Health',        color: '#ef4444' },
      { label: 'Entertainment', color: '#ec4899' },
      { label: 'Other',         color: '#94a3b8' },
    ];

    const STORAGE_KEY = 'budgetApp_v1';

    // Chart setup
    const ctx = document.getElementById('expense-chart').getContext('2d');
    let expensesChart = new Chart(ctx, {
      type: 'pie',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
      options: {
        plugins: { legend: { position: 'bottom' } },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // Utilities
    function money(n){ return Number(n).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}); }

    // Animated counter
    const _animState = {};
    function animateValue(el, toValue, duration=600){
      const id = el.id || el.className;
      if(_animState[id]) cancelAnimationFrame(_animState[id]);

      const fromValue = parseFloat(el.dataset.rawValue || el.textContent.replace(/[^0-9.-]/g,'')) || 0;
      el.dataset.rawValue = toValue;

      const start = performance.now();
      function step(now){
        const progress = Math.min((now - start) / duration, 1);
        // ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = fromValue + (toValue - fromValue) * ease;
        el.textContent = money(current);
        if(progress < 1){
          _animState[id] = requestAnimationFrame(step);
        } else {
          el.textContent = money(toValue);
          el.dataset.rawValue = toValue;
        }
      }
      _animState[id] = requestAnimationFrame(step);
    }
    function createRow(type, name='', amount='', category='Other'){
      const wrapper = document.createElement('div');
      wrapper.className = 'row';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.placeholder = type === 'income' ? 'Salary, freelance...' : 'Groceries, rent...';
      nameInput.value = name;
      nameInput.className = 'name';

      const amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.step = '0.01';
      amountInput.value = amount;
      amountInput.className = 'amount';
      amountInput.setAttribute('aria-label','amount');

      let categorySelect = null;
      if(type === 'expense') {
        categorySelect = document.createElement('select');
        categorySelect.className = 'cat-select';
        CATEGORIES.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.label;
          opt.textContent = c.label;
          categorySelect.appendChild(opt);
        });
        categorySelect.value = category;
        categorySelect.addEventListener('change', () => { recalc(); saveState(); });
      }

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';

      // hook events
      nameInput.addEventListener('input', debounce(saveState, 300));
      amountInput.addEventListener('input', () => { recalc(); saveState(); });
      removeBtn.addEventListener('click', () => {
        wrapper.remove();
        checkEmptyStates();
        recalc();
        saveState();
      });

      wrapper.appendChild(nameInput);
      wrapper.appendChild(amountInput);
      if(categorySelect) wrapper.appendChild(categorySelect);
      wrapper.appendChild(removeBtn);
      return wrapper;
    }

    // Empty state
    function showEmptyState(list, type) {
      if(list.querySelector('.empty-state')) return; // already shown
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = type === 'income'
        ? `<span class="empty-icon">💰</span><p>No income added yet</p><span class="empty-hint">Click "+ Add income" to get started</span>`
        : `<span class="empty-icon">📋</span><p>No expenses added yet</p><span class="empty-hint">Click "+ Add expense" to get started</span>`;
      list.appendChild(empty);
    }

    function checkEmptyStates() {
      // income
      const incRows = incomesList.querySelectorAll('.row');
      if(incRows.length === 0) showEmptyState(incomesList, 'income');
      else { const e = incomesList.querySelector('.empty-state'); if(e) e.remove(); }
      // expenses
      const expRows = expensesList.querySelectorAll('.row');
      if(expRows.length === 0) showEmptyState(expensesList, 'expense');
      else { const e = expensesList.querySelector('.empty-state'); if(e) e.remove(); }
    }

    // Add initial rows if empty
    function ensureOneRow(){
      if(!incomesList.firstChild) incomesList.appendChild(createRow('income','Salary', '0'));
      if(!expensesList.firstChild) expensesList.appendChild(createRow('expense','Rent', '0'));
    }

    // Add events
    addIncomeBtn.addEventListener('click', ()=>{ incomesList.appendChild(createRow('income')); checkEmptyStates(); saveState(); });
    addExpenseBtn.addEventListener('click', ()=>{ expensesList.appendChild(createRow('expense')); checkEmptyStates(); saveState(); });
    clearAllBtn.addEventListener('click', ()=>{
      if(!confirm('Clear all incomes and expenses?')) return;
      incomesList.innerHTML=''; expensesList.innerHTML=''; checkEmptyStates(); recalc(); saveState();
    });
    importSampleBtn.addEventListener('click', loadSample);

    saveNowBtn.addEventListener('click', ()=>{
      saveState();
      saveNowBtn.textContent = '✓ Saved';
      setTimeout(() => { saveNowBtn.textContent = 'Save'; }, 1500);
    });

    exportCsvBtn.addEventListener('click', exportCSV);

    // Period toggle
    function getPeriodMultiplier() {
      return currentPeriod === 'annual' ? 12 : 1;
    }

    toggleMonthlyBtn.addEventListener('click', () => {
      currentPeriod = 'monthly';
      toggleMonthlyBtn.classList.add('active');
      toggleAnnualBtn.classList.remove('active');
      recalc();
    });

    toggleAnnualBtn.addEventListener('click', () => {
      currentPeriod = 'annual';
      toggleAnnualBtn.classList.add('active');
      toggleMonthlyBtn.classList.remove('active');
      recalc();
    });

    // Debounce helper
    function debounce(fn, t=200){ let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a), t); }; }

    // Core calc
    function recalc(){
      const incomes = Array.from(incomesList.querySelectorAll('.row')).map(r => {
        const name = r.querySelector('.name').value.trim() || 'Source';
        const v = parseFloat(r.querySelector('.amount').value) || 0;
        return {name, amount: v};
      });
      const expenses = Array.from(expensesList.querySelectorAll('.row')).map(r => {
        const name = r.querySelector('.name').value.trim() || 'Expense';
        const v = parseFloat(r.querySelector('.amount').value) || 0;
        const cat = r.querySelector('.cat-select') ? r.querySelector('.cat-select').value : 'Other';
        return {name, amount: v, category: cat};
      });

      const totalIncome = incomes.reduce((s, x) => s + x.amount, 0);
      const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
      const net = totalIncome - totalExpenses;
      const rate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

      const m = getPeriodMultiplier();
      animateValue(totalIncomeEl,    totalIncome * m);
      animateValue(totalExpensesEl,  totalExpenses * m);
      animateValue(netSavingsEl,     net * m);
      savingsRateEl.textContent = rate.toFixed(1) + '%';

      // update all currency symbols
      document.querySelectorAll('.currency-symbol').forEach(el => {
        el.textContent = getCurrencySymbol();
      });

      updateChart(expenses);
      updateGoal(rate);
    }

    function updateGoal(rate) {
      const goal = parseFloat(goalInput.value) || 20;
      const pct  = Math.min((rate / goal) * 100, 100); // cap bar at 100%

      progressBar.style.width = pct + '%';

      // colour: red < 50% of goal, yellow 50–99%, green = met
      if (rate >= goal) {
        progressBar.style.background = '#22c55e';
        goalStatus.textContent = '🎉 Goal met!';
        goalStatus.style.color = '#22c55e';
        goalMessage.textContent = `You're saving ${rate.toFixed(1)}% — above your ${goal}% target. Great work!`;
      } else if (pct >= 50) {
        progressBar.style.background = '#f59e0b';
        goalStatus.textContent = `${pct.toFixed(0)}% of goal`;
        goalStatus.style.color = '#f59e0b';
        goalMessage.textContent = `Almost there — reduce expenses by a little more to hit ${goal}%.`;
      } else {
        progressBar.style.background = '#ef4444';
        goalStatus.textContent = `${pct.toFixed(0)}% of goal`;
        goalStatus.style.color = '#ef4444';
        goalMessage.textContent = `You need to save ${goal}% of income. Try cutting expenses or adding income.`;
      }
    }

    goalInput.addEventListener('input', recalc);

    function updateChart(expenses){
      const grouped = {};
      CATEGORIES.forEach(c => { grouped[c.label] = 0; });

      expenses.forEach(e => {
        const cat = e.category || 'Other';
        grouped[cat] = (grouped[cat] || 0) + e.amount;
      });

      const active = CATEGORIES.filter(c => grouped[c.label] > 0);

      if(active.length === 0){
        expensesChart.data.labels = [];
        expensesChart.data.datasets[0].data = [];
        expensesChart.update();
        return;
      }

      expensesChart.data.labels = active.map(c => c.label);
      expensesChart.data.datasets[0].data = active.map(c => grouped[c.label]);
      expensesChart.data.datasets[0].backgroundColor = active.map(c => c.color);
      expensesChart.update();
    }

    // Persistence
    function saveState(){
      const incomes = Array.from(incomesList.querySelectorAll('.row')).map(r => ({
        name: r.querySelector('.name').value,
        amount: r.querySelector('.amount').value
      }));
      const expenses = Array.from(expensesList.querySelectorAll('.row')).map(r => ({
        name: r.querySelector('.name').value,
        amount: r.querySelector('.amount').value,
        category: r.querySelector('.cat-select') ? r.querySelector('.cat-select').value : 'Other'
      }));
      const state = { incomes, expenses, savedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function loadState(){
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      try{
        const st = JSON.parse(raw);
        incomesList.innerHTML=''; expensesList.innerHTML='';
        st.incomes.forEach(i => incomesList.appendChild(createRow('income', i.name, i.amount)));
        st.expenses.forEach(e => expensesList.appendChild(createRow('expense', e.name, e.amount, e.category)));
        return true;
      }catch(e){ console.error('Failed to load state', e); return false;}
    }

    // Sample dataset
    function loadSample(){
      incomesList.innerHTML='';
      expensesList.innerHTML='';
      incomesList.appendChild(createRow('income','Salary', '120000'));
      incomesList.appendChild(createRow('income','Freelance', '20000'));
      expensesList.appendChild(createRow('expense','Rent','40000','Housing'));
      expensesList.appendChild(createRow('expense','Groceries','25000','Food'));
      expensesList.appendChild(createRow('expense','Transport','8000','Transport'));
      recalc(); saveState();
    }

    // CSV export
    function exportCSV(){
      const incomes = Array.from(incomesList.querySelectorAll('.row')).map(r => {
        return [ 'income', `"${r.querySelector('.name').value.replace(/"/g,'""')}"`, r.querySelector('.amount').value ];
      });
      const expenses = Array.from(expensesList.querySelectorAll('.row')).map(r => {
        return [ 'expense', `"${r.querySelector('.name').value.replace(/"/g,'""')}"`, r.querySelector('.amount').value ];
      });
      const rows = [['type','name','amount'], ...incomes, ...expenses];
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'budget_export.csv'; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    }

    // initialize
    (function init(){
      const loaded = loadState();
      if(!loaded) { ensureOneRow(); }
      checkEmptyStates();
      recalc();
      // autosave occasionally
      setInterval(saveState, 2000);
    })();

    // Recalculate live if user edits outside the row handlers (safety)
    document.addEventListener('input', (e)=>{
      if(e.target.matches('.amount') || e.target.matches('.name')) recalc();
    });
  })();
}); 