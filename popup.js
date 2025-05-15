// Normal distribution functions
function normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

function normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Calculate days between two dates
function calculateDaysToExpiry(expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time part for accurate day calculation
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
}

// Black-Scholes and Greeks calculation
function blackScholesGreeks(S, K, T, r, sigma, optionType, q = 0) {
    if (T <= 0) {
        if (optionType === "call") {
            const price = Math.max(S - K, 0);
            const delta = S > K ? 1.0 : 0.0;
            return { price, delta, gamma: 0, theta: 0, vega: 0, rho: 0 };
        } else {
            const price = Math.max(K - S, 0);
            const delta = S < K ? -1.0 : 0.0;
            return { price, delta, gamma: 0, theta: 0, vega: 0, rho: 0 };
        }
    }

    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    let price, delta, rho;
    if (optionType === "call") {
        price = S * Math.exp(-q * T) * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
        delta = Math.exp(-q * T) * normalCDF(d1);
        rho = K * T * Math.exp(-r * T) * normalCDF(d2) / 100;
    } else {
        price = K * Math.exp(-r * T) * normalCDF(-d2) - S * Math.exp(-q * T) * normalCDF(-d1);
        delta = -Math.exp(-q * T) * normalCDF(-d1);
        rho = -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100;
    }

    const gamma = Math.exp(-q * T) * normalPDF(d1) / (S * sigma * Math.sqrt(T));
    const vega = S * Math.exp(-q * T) * normalPDF(d1) * Math.sqrt(T) / 100;
    const theta = (
        -(S * normalPDF(d1) * sigma * Math.exp(-q * T)) / (2 * Math.sqrt(T))
        - r * K * Math.exp(-r * T) * (optionType === "call" ? normalCDF(d2) : normalCDF(-d2))
        + q * S * Math.exp(-q * T) * (optionType === "call" ? normalCDF(d1) : normalCDF(-d1))
    ) / 365;

    return { price, delta, gamma, theta, vega, rho };
}

// UI handling
document.addEventListener('DOMContentLoaded', function() {
    // Set default expiry date to 30 days from now
    const expiryInput = document.getElementById('expiry');
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    expiryInput.valueAsDate = defaultExpiry;

    // Add resize observer to handle chart resizing
    const chartContainer = document.getElementById('chart');
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            if (entry.target === chartContainer && window.lastPlotlyData) {
                Plotly.relayout(chartContainer, {
                    width: entry.contentRect.width,
                    height: Math.max(400, entry.contentRect.height)
                });
            }
        }
    });
    resizeObserver.observe(chartContainer);

    // Add strategy change handler
    const strategySelect = document.getElementById('strategy');
    strategySelect.addEventListener('change', function() {
        const strategy = this.value;
        const spreadFields = document.querySelectorAll('.spread-field');
        const ironCondorFields = document.querySelectorAll('.iron-condor-field');
        const strangleFields = document.querySelectorAll('.strangle-field');
        const butterflyFields = document.querySelectorAll('.butterfly-field');
        const straddleFields = document.querySelectorAll('.straddle-field');

        // Hide all additional fields first
        spreadFields.forEach(field => field.style.display = 'none');
        ironCondorFields.forEach(field => field.style.display = 'none');
        strangleFields.forEach(field => field.style.display = 'none');
        butterflyFields.forEach(field => field.style.display = 'none');
        straddleFields.forEach(field => field.style.display = 'none');

        // Show relevant fields based on strategy
        if (strategy === 'Bull Call Spread') {
            spreadFields.forEach(f => f.style.display = 'flex');
            setSpreadLabels('call');
        } else if (strategy === 'Bear Put Spread') {
            spreadFields.forEach(f => f.style.display = 'flex');
            setSpreadLabels('put');
        } else if (strategy === 'Iron Condor') {
            spreadFields.forEach(f => f.style.display = 'flex');
            ironCondorFields.forEach(f => f.style.display = 'flex');
            setSpreadLabels('generic');
        } else if (strategy === 'Long Strangle') {
            strangleFields.forEach(field => field.style.display = 'flex');
            document.getElementById('premium_straddle').parentElement.style.display = 'flex';
            setSpreadLabels('generic');
        } else if (strategy === 'Long Butterfly Spread') {
            butterflyFields.forEach(field => field.style.display = 'flex');
            setSpreadLabels('generic');
        } else if (strategy === 'Long Straddle') {
            straddleFields.forEach(field => field.style.display = 'flex');
            setSpreadLabels('generic');
        } else {
            setSpreadLabels('generic');
        }
    });

    const calculateButton = document.getElementById('calculate');
    calculateButton.addEventListener('click', calculate);

    // Load user preferences from chrome.storage.local
    if (window.chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['volatility', 'riskFree', 'dividend', 'strategy'], function(data) {
            if (data.volatility !== undefined) document.getElementById('volatility').value = data.volatility;
            if (data.riskFree !== undefined) document.getElementById('riskFree').value = data.riskFree;
            if (data.dividend !== undefined) document.getElementById('dividend').value = data.dividend;
            if (data.strategy !== undefined) {
                const strategyEl = document.getElementById('strategy');
                strategyEl.value = data.strategy;
                // Dispatch change event to update input fields
                const event = new Event('change', { bubbles: true });
                strategyEl.dispatchEvent(event);
                // Set labels on load
                if (data.strategy === 'Bull Call Spread') setSpreadLabels('call');
                else if (data.strategy === 'Bear Put Spread') setSpreadLabels('put');
                else setSpreadLabels('generic');
            }
        });
    }

    // Save all input values on change
    const allInputIds = [
        'strategy', 'stock', 'strike', 'strike2', 'strike3', 'strike4',
        'premium', 'premium2', 'premium3', 'premium4', 'quantity',
        'expiry', 'volatility', 'riskFree', 'dividend',
        'strike_strangle', 'strike_butterfly', 'premium_straddle'
    ];
    allInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', function() {
                if (chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['inputs'], function(data) {
                        const inputs = data.inputs || {};
                        inputs[id] = el.value;
                        chrome.storage.local.set({inputs});
                    });
                }
            });
        }
    });

    // Restore all input values on load
    if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['inputs'], function(data) {
            const inputs = data.inputs || {};
            allInputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && inputs[id] !== undefined) {
                    el.value = inputs[id];
                    // For strategy, dispatch change event to update UI
                    if (id === 'strategy') {
                        const event = new Event('change', { bubbles: true });
                        el.dispatchEvent(event);
                    }
                }
            });
        });
    }

    // Save/Load Setup logic
    const saveBtn = document.getElementById('save-setup');
    const loadSelect = document.getElementById('load-setup');
    const setupNameInput = document.getElementById('setup-name');
    const inputIds = [
        'strategy', 'stock', 'strike', 'strike2', 'strike3', 'strike4',
        'premium', 'premium2', 'premium3', 'premium4', 'quantity',
        'expiry', 'volatility', 'riskFree', 'dividend',
        'strike_strangle', 'strike_butterfly', 'premium_straddle'
    ];

    function getSetupFromInputs() {
        const setup = {};
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) setup[id] = el.value;
        });
        console.log('getSetupFromInputs:', setup);
        return setup;
    }

    function setInputsFromSetup(setup) {
        console.log('setInputsFromSetup:', setup);
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && setup[id] !== undefined) {
                el.value = setup[id];
                const event = new Event('change', { bubbles: true });
                el.dispatchEvent(event);
            }
        });
        calculate();
    }

    function refreshSetupDropdown() {
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['setups'], function(data) {
                const setups = data.setups || {};
                console.log('refreshSetupDropdown setups:', setups);
                loadSelect.innerHTML = '<option value="">Load Setup...</option>';
                Object.keys(setups).forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    loadSelect.appendChild(opt);
                });
            });
        }
    }

    saveBtn.addEventListener('click', function() {
        const name = setupNameInput.value.trim();
        if (!name) { alert('Please enter a setup name.'); return; }
        const setup = getSetupFromInputs();
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['setups'], function(data) {
                const setups = data.setups || {};
                setups[name] = setup;
                console.log('Saving setup:', name, setup, setups);
                chrome.storage.local.set({setups}, function() {
                    console.log('Setup saved to chrome.storage.local');
                    refreshSetupDropdown();
                    alert('Setup saved!');
                });
            });
        }
    });

    loadSelect.addEventListener('change', function() {
        const name = loadSelect.value;
        if (!name) return;
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['setups'], function(data) {
                const setups = data.setups || {};
                console.log('Loading setup:', name, setups[name]);
                if (setups[name]) setInputsFromSetup(setups[name]);
            });
        }
    });

    refreshSetupDropdown();

    // Reset button logic
    const resetBtn = document.getElementById('reset-inputs');
    resetBtn.addEventListener('click', function() {
        // Only reset basic parameters
        const basicInputIds = [
            'strategy', 'stock', 'strike', 'strike2', 'strike3', 'strike4',
            'premium', 'premium2', 'premium3', 'premium4', 'quantity',
            'strike_strangle', 'strike_butterfly', 'premium_straddle'
        ];
        basicInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'number' || el.type === 'text') el.value = (id === 'quantity' ? '1' : '0');
                if (id === 'strategy') el.value = 'Long Call';
                // Dispatch change event for strategy
                if (id === 'strategy') {
                    const event = new Event('change', { bubbles: true });
                    el.dispatchEvent(event);
                }
            }
        });
        // Remove only the basic parameters from storage
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['inputs'], function(data) {
                const inputs = data.inputs || {};
                basicInputIds.forEach(id => { delete inputs[id]; });
                chrome.storage.local.set({inputs});
            });
        }
        calculate();
    });

    // Delete Setup button logic
    const deleteBtn = document.getElementById('delete-setup');
    deleteBtn.addEventListener('click', function() {
        const name = loadSelect.value;
        if (!name) { alert('Select a setup to delete.'); return; }
        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['setups'], function(data) {
                const setups = data.setups || {};
                if (setups[name]) {
                    delete setups[name];
                    chrome.storage.local.set({setups}, function() {
                        refreshSetupDropdown();
                        alert('Setup deleted!');
                    });
                }
            });
        }
    });
});

function calculatePayoff(strategy, stockPrice, params) {
    const {K1, K2, K3, K4, P1, P2, P3, P4, K_strangle, K_butterfly} = params;
    let payoff = 0;
    switch(strategy) {
        case 'Long Call':
            payoff = Math.max(stockPrice - K1, 0) - P1;
            break;
        case 'Long Put':
            payoff = Math.max(K1 - stockPrice, 0) - P1;
            break;
        case 'Short Call':
            payoff = P1 - Math.max(stockPrice - K1, 0);
            break;
        case 'Short Put':
            payoff = P1 - Math.max(K1 - stockPrice, 0);
            break;
        case 'Bull Call Spread':
            payoff = Math.max(stockPrice - K1, 0) - Math.max(stockPrice - K2, 0) - (P1 - P2);
            break;
        case 'Bear Put Spread':
            payoff = Math.max(K1 - stockPrice, 0) - Math.max(K2 - stockPrice, 0) - (P1 - P2);
            break;
        case 'Iron Condor': {
            // SHORT (credit) iron condor: Buy put K1, Sell put K2, Sell call K3, Buy call K4
            const credit = (P2 + P3) - (P1 + P4);
            payoff =
                + Math.max(K1 - stockPrice, 0)   // long put
                - Math.max(K2 - stockPrice, 0)   // short put
                - Math.max(stockPrice - K3, 0)   // short call
                + Math.max(stockPrice - K4, 0)   // long call
                + credit;
            break;
        }
        case 'Long Straddle': {
            const totalCost = P1 + P2;
            payoff = Math.max(stockPrice - K1, 0) + Math.max(K1 - stockPrice, 0) - (P1 + P2);
            break;
        }
        case 'Long Strangle':
            payoff = Math.max(stockPrice - K_strangle, 0) + Math.max(K1 - stockPrice, 0) - (P1 + P2);
            break;
        case 'Long Butterfly Spread': {
            const netPremium = P1 - 2 * P2 + P3;
            const width = K2 - K1; // = K3 - K2 for symmetric fly
            payoff = Math.max(stockPrice - K1, 0)
                    - 2 * Math.max(stockPrice - K2, 0)
                    + Math.max(stockPrice - K3, 0)
                    - netPremium;
            break;
        }
    }
    return payoff;
}

function calculate() {
    try {
        // Get input values
        const strategy = document.getElementById('strategy').value;
        let S = parseFloat(document.getElementById('stock').value);
        const K1 = parseFloat(document.getElementById('strike').value); // low strike
        const P1 = parseFloat(document.getElementById('premium').value); // low premium
        const qty = Math.max(1, parseInt(document.getElementById('quantity').value));
        let K2 = 0, K3 = 0, K4 = 0, P2 = 0, P3 = 0, P4 = 0, K_strangle = 0, K_butterfly = 0;
        if (strategy.includes('Spread') || strategy === 'Iron Condor') {
            K2 = parseFloat(document.getElementById('strike2')?.value || 0);
            P2 = parseFloat(document.getElementById('premium2')?.value || 0);
        }
        if (strategy === 'Iron Condor') {
            K3 = parseFloat(document.getElementById('strike3')?.value || 0);
            K4 = parseFloat(document.getElementById('strike4')?.value || 0);
            P3 = parseFloat(document.getElementById('premium3')?.value || 0);
            P4 = parseFloat(document.getElementById('premium4')?.value || 0);
            // Validation for K1 < K2 < K3 < K4
            if (!(K1 < K2 && K2 < K3 && K3 < K4)) {
                document.getElementById('results').innerHTML = '<span style="color:red;">For Iron Condor, strikes must satisfy K1 &lt; K2 &lt; K3 &lt; K4.</span>';
                document.getElementById('chart').innerHTML = '';
                return;
            }
        }
        if (strategy === 'Long Strangle') {
            K_strangle = parseFloat(document.getElementById('strike_strangle')?.value || 0);
            P2 = parseFloat(document.getElementById('premium_straddle')?.value || 0);
            if (!(K1 < K_strangle)) {
                document.getElementById('results').innerHTML = '<span style="color:red;">For a strangle, the call strike must be above the put strike.</span>';
                document.getElementById('chart').innerHTML = '';
                document.getElementById('wing-width').innerHTML = '';
                document.getElementById('strangle-overview').innerHTML = '';
                return;
            }
            // Show strangle overview
            const totalCost = P1 + P2;
            document.getElementById('strangle-overview').innerHTML = `You're buying a $${K1.toFixed(2)} put (premium $${P1.toFixed(2)}) + a $${K_strangle.toFixed(2)} call (premium $${P2.toFixed(2)}) for a total debit of $${totalCost.toFixed(2)} per contract.`;
        } else {
            document.getElementById('strangle-overview').innerHTML = '';
        }
        if (strategy === 'Long Butterfly Spread') {
            K2 = parseFloat(document.getElementById('strike_strangle')?.value || 0); // mid strike
            K3 = parseFloat(document.getElementById('strike_butterfly')?.value || 0); // high strike
            P2 = parseFloat(document.getElementById('premium2')?.value || 0); // mid premium
            P3 = parseFloat(document.getElementById('premium3')?.value || 0); // high premium
            if (!(K1 < K2 && K2 < K3)) {
                document.getElementById('results').innerHTML = '<span style="color:red;">For a butterfly, strikes must satisfy K1 &lt; K2 &lt; K3.</span>';
                document.getElementById('chart').innerHTML = '';
                document.getElementById('wing-width').innerHTML = '';
                return;
            }
        }
        if (strategy === 'Long Straddle') {
            P2 = parseFloat(document.getElementById('premium_straddle')?.value || 0);
        }

        // Get market parameters and dates
        let expiryDate = document.getElementById('expiry').value;
        let daysToExpiry = calculateDaysToExpiry(expiryDate);
        let T = Math.max(daysToExpiry / 365, 0);
        let sigma = parseFloat(document.getElementById('volatility').value) / 100;
        const r = parseFloat(document.getElementById('riskFree').value) / 100;
        const q = parseFloat(document.getElementById('dividend').value) / 100;

        // Calculate option values and greeks for the primary option
        let optionType = strategy.includes('Put') ? 'put' : 'call';
        const { price, delta, gamma, theta, vega, rho } = blackScholesGreeks(S, K1, T, r, sigma, optionType, q);

        // Calculate payoff at expiry
        const stockPrices = [];
        const payoffs = [];
        const numPoints = 100;
        const minPrice = Math.max(0.5 * S, 0);
        const maxPrice = 1.5 * S;
        const priceStep = (maxPrice - minPrice) / (numPoints - 1);

        const params = {K1, K2, K3, K4, P1, P2, P3, P4, K_strangle, K_butterfly};
        for (let i = 0; i < numPoints; i++) {
            const stockPrice = minPrice + i * priceStep;
            stockPrices.push(stockPrice);
            const payoff = calculatePayoff(strategy, stockPrice, params);
            payoffs.push(payoff * qty * 100);
        }

        // Calculate break-even points (simplified for basic strategies)
        let breakeven, maxLoss, maxProfit;
        switch(strategy) {
            case 'Long Call':
                breakeven = K1 + P1;
                maxLoss = P1 * qty * 100;
                maxProfit = "Unlimited";
                break;
            case 'Long Put':
                breakeven = K1 - P1;
                maxLoss = P1 * qty * 100;
                maxProfit = (K1 - P1) * qty * 100;
                break;
            case 'Short Call':
                breakeven = K1 + P1;
                maxProfit = P1 * qty * 100;
                maxLoss = "Unlimited";
                break;
            case 'Short Put':
                breakeven = K1 - P1;
                maxProfit = P1 * qty * 100;
                maxLoss = K1 * qty * 100;
                break;
            case 'Bull Call Spread':
                breakeven = K1 + (P1 - P2);
                maxLoss = (P1 - P2) * qty * 100;
                maxProfit = (K2 - K1 - (P1 - P2)) * qty * 100;
                break;
            case 'Bear Put Spread':
                breakeven = K1 - (P1 - P2);
                maxLoss = (P1 - P2) * qty * 100;
                maxProfit = (K1 - K2 - (P1 - P2)) * qty * 100;
                break;
            case 'Iron Condor': {
                // SHORT (credit) iron condor: Buy put K1, Sell put K2, Sell call K3, Buy call K4
                const credit = (P2 + P3) - (P1 + P4);
                const widthPut  = K2 - K1;
                const widthCall = K4 - K3;
                const spreadW   = Math.max(widthPut, widthCall);
                maxProfit = credit * qty * 100;
                maxLoss   = (spreadW - credit) * qty * 100;
                const breakevenLow  = (K2 - credit).toFixed(2);
                const breakevenHigh = (K3 + credit).toFixed(2);
                breakeven = `Low $${breakevenLow}, High $${breakevenHigh}`;
                break;
            }
            case 'Long Straddle': {
                const totalCost = P1 + P2;
                breakeven = `Low $${(K1 - totalCost).toFixed(2)}, High $${(K1 + totalCost).toFixed(2)}`;
                maxLoss   = totalCost * qty * 100;
                maxProfit = 'Unlimited';
                break;
            }
            case 'Long Strangle': {
                const callGreeks = blackScholesGreeks(S, K_strangle, T, r, sigma, 'call', q);
                const putGreeks  = blackScholesGreeks(S, K1,        T, r, sigma, 'put',  q);
                delta = callGreeks.delta + putGreeks.delta;
                gamma = callGreeks.gamma + putGreeks.gamma;
                theta = callGreeks.theta + putGreeks.theta;
                vega  = callGreeks.vega  + putGreeks.vega;
                rho   = callGreeks.rho   + putGreeks.rho;
                const totalCost = P1 + P2;
                breakeven = `Low $${(K1 - totalCost).toFixed(2)}, High $${(K_strangle + totalCost).toFixed(2)}`;
                maxLoss   = totalCost * qty * 100;
                maxProfit = 'Unlimited';
                break;
            }
            case 'Long Butterfly Spread': {
                const netPremium = P1 - 2 * P2 + P3;
                const width = K2 - K1; // = K3 - K2 for symmetric fly
                breakeven = `Low: $${(K1 + netPremium).toFixed(2)}, High: $${(K3 - netPremium).toFixed(2)}`;
                maxProfit = (width * 100 - netPremium * 100).toFixed(2);
                maxLoss = (netPremium * 100).toFixed(2);
                break;
            }
        }

        // Format expiry date for display
        const expiryDisplay = new Date(expiryDate).toLocaleDateString();

        // Update results
        const results = document.getElementById('results');
        results.innerHTML = `
            <strong>Strategy:</strong> ${strategy}<br>
            <strong>Expiry Date:</strong> ${expiryDisplay} (in ${daysToExpiry} days)<br>
            <strong>Break-even Price:</strong> ${typeof breakeven === 'number' ? '$' + breakeven.toFixed(2) : breakeven}<br>
            <strong>Max Profit:</strong> ${typeof maxProfit === 'number' ? '$' + maxProfit.toFixed(2) : maxProfit}<br>
            <strong>Max Loss:</strong> ${typeof maxLoss === 'number' ? '$' + maxLoss.toFixed(2) : maxLoss}<br>
            <br>
            <strong>Greeks (for primary option):</strong><br>
            Delta: ${delta.toFixed(4)} <span class="greek-explanation">(Option price moves by $${delta.toFixed(4)} for every $1 move in the stock)</span><br>
            Gamma: ${gamma.toFixed(4)} <span class="greek-explanation">(Delta changes by ${gamma.toFixed(4)} for every $1 move in the stock)</span><br>
            Theta (per day): ${theta.toFixed(4)} <span class="greek-explanation">(Option loses $${Math.abs(theta).toFixed(4)} in value each day)</span><br>
            Vega (per 1% vol): ${vega.toFixed(4)} <span class="greek-explanation">(Option price changes $${vega.toFixed(4)} for each 1% change in volatility)</span><br>
            Rho (per 1% rate): ${rho.toFixed(4)} <span class="greek-explanation">(Option price changes $${rho.toFixed(4)} for each 1% change in rates)</span>
        `;
        // Show wing width for butterfly
        if (strategy === 'Long Butterfly Spread') {
            const width = (K2 - K1).toFixed(2);
            document.getElementById('wing-width').innerHTML = `Wing width: $${width}`;
        } else {
            document.getElementById('wing-width').innerHTML = '';
        }

        // Calculate y-ticks for absolute values, no symbols
        const yMin = Math.min(...payoffs);
        const yMax = Math.max(...payoffs);
        const numTicks = 7;
        const yTicks = [];
        const yTickVals = [];
        for (let i = 0; i < numTicks; i++) {
            const val = yMin + (i * (yMax - yMin) / (numTicks - 1));
            yTickVals.push(val);
            yTicks.push(`$${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        }

        // Calculate x-ticks for absolute values, no symbols
        const xMin = Math.min(...stockPrices);
        const xMax = Math.max(...stockPrices);
        const numXTicks = 7;
        const xTicks = [];
        const xTickVals = [];
        for (let i = 0; i < numXTicks; i++) {
            const val = xMin + (i * (xMax - xMin) / (numXTicks - 1));
            xTickVals.push(val);
            xTicks.push(`$${Math.abs(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        }

        // In the chart, if breakeven is a string with two numbers, plot both as vertical lines
        let breakevenLines = [];
        if (typeof breakeven === 'string' && breakeven.includes('Low') && breakeven.includes('High')) {
            const matches = breakeven.match(/\$([\d.]+)/g);
            if (matches && matches.length === 2) {
                const low = parseFloat(matches[0].replace('$', ''));
                const high = parseFloat(matches[1].replace('$', ''));
                breakevenLines = [low, high];
            }
        }

        const layout = {
            title: `${strategy} Payoff Diagram`,
            xaxis: { 
                title: 'Stock Price at Expiry',
                tickvals: xTickVals,
                ticktext: xTicks,
                tickmode: 'array',
                tickfont: {size: 16}
            },
            yaxis: { 
                title: 'Profit/Loss ($)',
                tickvals: yTickVals,
                ticktext: yTicks,
                tickmode: 'array',
                separatethousands: true,
                exponentformat: 'none',
                showexponent: 'none',
                tickfont: {size: 16},
            },
            shapes: breakevenLines.length ? breakevenLines.map(x => ({
                type: 'line',
                x0: x,
                x1: x,
                y0: Math.min(...payoffs),
                y1: Math.max(...payoffs),
                line: {
                    color: 'red',
                    width: 2,
                    dash: 'dash'
                }
            })) : (typeof breakeven === 'number' ? [{
                type: 'line',
                x0: breakeven,
                x1: breakeven,
                y0: Math.min(...payoffs),
                y1: Math.max(...payoffs),
                line: {
                    color: 'red',
                    width: 2,
                    dash: 'dash'
                }
            }] : []),
            margin: {
                l: 140,  // Further increased left margin for y-axis label
                r: 20,
                t: 40,
                b: 65
            },
            autosize: true
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        // Store the data for resize handling
        window.lastPlotlyData = {
            trace: {
                x: stockPrices,
                y: payoffs,
                mode: 'lines',
                name: 'P&L at Expiry'
            },
            layout: layout
        };

        Plotly.newPlot('chart', [window.lastPlotlyData.trace], layout, config);

    } catch (error) {
        document.getElementById('results').innerHTML = `Error: ${error.message}`;
        console.error('Calculator error:', error);
    }
}

// --- dynamic label helper ---
function setSpreadLabels(type) {
    const strike1Lbl = document.querySelector('label[for="strike"]');
    const prem1Lbl   = document.querySelector('label[for="premium"]');
    const strike2Lbl = document.querySelector('label[for="strike2"]');
    const prem2Lbl   = document.querySelector('label[for="premium2"]');

    if (type === 'call') {
        strike1Lbl.textContent = 'Lower Call Strike ($):';
        prem1Lbl.textContent   = 'Lower Call Premium ($):';
        strike2Lbl.textContent = 'Upper Call Strike ($):';
        prem2Lbl.textContent   = 'Upper Call Premium ($):';
    } else if (type === 'put') {
        strike1Lbl.textContent = 'Upper Put Strike ($):';
        prem1Lbl.textContent   = 'Upper Put Premium ($):';
        strike2Lbl.textContent = 'Lower Put Strike ($):';
        prem2Lbl.textContent   = 'Lower Put Premium ($):';
    } else { // fallback for generic / single-leg
        strike1Lbl.textContent = 'Strike Price ($):';
        prem1Lbl.textContent   = 'Premium ($):';
        strike2Lbl.textContent = 'Second Strike ($):';
        prem2Lbl.textContent   = 'Second Premium ($):';
    }
} 