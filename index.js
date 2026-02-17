const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG_FILES = {
    presupuesto: path.join(__dirname, 'presupuesto.json'),
    estado: path.join(__dirname, 'estado.json'),
    logs: path.join(__dirname, 'logs.json')
};

const GROUP_NAME = 'Finanzas Viaje 2026';

/**
 * Utility to read JSON files
 */
function readJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return null;
    }
}

/**
 * Utility to write JSON files
 */
function writeJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
    }
}

/**
 * Main Controller for Financial Logic
 */
class FinancialController {
    constructor(configPaths = CONFIG_FILES) {
        this.config = configPaths;
        this.presupuesto = readJson(this.config.presupuesto) || { presupuesto_diario: {} };
        this.estado = readJson(this.config.estado) || { balance_acumulado: 0, estados_diarios: {} };
        this.logs = readJson(this.config.logs) || [];

        // Ensure random_remanente is initialized if it exists in budget but not in state.
        // Wait, logic is inside registerRandomExpense?
        // Let's keep constructor clean. But wait, `registerRandomExpense` writes to `this.config.estado`.
        // So I must use `this.config` instead of `CONFIG_FILES` in write calls.
    }

    /**
     * Process a "Gasté [monto] euros en [Ciudad], día [n]" message
     */
    registerExpense(amount, city, day) {
        const cityBudget = this.presupuesto.presupuesto_diario[city];
        if (!cityBudget) return `Error: No encontré presupuesto para la ciudad ${city}.`;

        const dayKey = `dia_${day}`;
        const dailyBudget = cityBudget[dayKey];
        if (dailyBudget === undefined) return `Error: No encontré presupuesto para el día ${day} en ${city}.`;

        const stateKey = `${city}||${dayKey}`;
        if (this.estado.estados_diarios[stateKey] === undefined) {
            this.estado.estados_diarios[stateKey] = dailyBudget;
        }

        // 1. Update daily remaining
        this.estado.estados_diarios[stateKey] -= amount;

        // 2. Log the transaction
        const logEntry = {
            timestamp: new Date().toISOString(),
            tipo: 'GASTO',
            monto: amount,
            ciudad: city,
            dia: day,
            remanente_dia: this.estado.estados_diarios[stateKey]
        };
        this.logs.push(logEntry);

        // 3. Recalculate total balance
        this.estado.balance_acumulado = this.calculateTotalBalance();
        logEntry.balance_total = this.estado.balance_acumulado;

        // 4. Save persistence
        writeJson(this.config.estado, this.estado);
        writeJson(this.config.logs, this.logs);

        return `Genial, te quedan ${this.estado.estados_diarios[stateKey].toFixed(2)} euros para este día. Puedes gastarlos o dejarlos para sumar al balance. Tu balance acumulado es de ${this.estado.balance_acumulado.toFixed(2)} euros.`;
    }

    /**
     * Total Balance = Sum of budgets for all "activated" days - Total expenses
     */

    /**
     * Total Balance = Sum of budgets for all "activated" days - Total expenses
     */
    calculateTotalBalance() {
        let totalBudget = 0;
        const activatedStateKeys = Object.keys(this.estado.estados_diarios);

        activatedStateKeys.forEach(key => {
            const [city, dayKey] = key.split('||');
            if (this.presupuesto.presupuesto_diario[city] && this.presupuesto.presupuesto_diario[city][dayKey] !== undefined) {
                totalBudget += this.presupuesto.presupuesto_diario[city][dayKey];
            }
        });

        // Add Random Budget
        totalBudget += (this.presupuesto.configuracion.presupuesto_random || 0);

        const totalSpent = this.logs
            .filter(l => l.tipo === 'GASTO' || l.tipo === 'GASTO_RANDOM')
            .reduce((sum, l) => sum + l.monto, 0);

        return totalBudget - totalSpent;
    }


    /**
     * Process a "Gasté [monto] euros en random" message
     */
    registerRandomExpense(amount) {
        const randomBudget = this.presupuesto.configuracion.presupuesto_random || 0;

        // Initialize random_remanente if not exists
        if (this.estado.random_remanente === undefined) {
            // If never touched, it starts full.
            // But if we are registering an expense, we need to know what was the *initial* state or if we are just subtracting from a running total.
            // Assumption: random_remanente tracks the *current* available money.
            // If it's undefined, we set it to the budget from config.
            this.estado.random_remanente = randomBudget;
        }

        // 1. Update random remaining
        this.estado.random_remanente -= amount;

        // 2. Log the transaction
        const logEntry = {
            timestamp: new Date().toISOString(),
            tipo: 'GASTO_RANDOM',
            monto: amount,
            remanente_random: this.estado.random_remanente
        };
        this.logs.push(logEntry);

        // 3. Recalculate total balance
        this.estado.balance_acumulado = this.calculateTotalBalance();
        logEntry.balance_total = this.estado.balance_acumulado;

        // 4. Save persistence
        writeJson(this.config.estado, this.estado);
        writeJson(this.config.logs, this.logs);

        return `Gastado en random. Te quedan ${this.estado.random_remanente.toFixed(2)} euros en tu cuenta "por libre". Tu balance global es ${this.estado.balance_acumulado.toFixed(2)} euros.`;
    }

    /**
     * Total Balance = (Sum of budgets for all "activated" days + Random Budget) - Total expenses
     * Wait, simplistic approach: 
     * Balance = (Sum of Activated Daily Budgets + Random Budget) - (Daily Expenses + Random Expenses)
     * Actually, the simplest way is:
     * Balance = (Sum of Activated Daily Budgets - Daily Expenses) + (Random Budget - Random Expenses)
     * We already track "estados_diarios" which is (Daily Budget - Daily Expenses) per day.
     * We track "random_remanente" which is (Random Budget - Random Expenses).
     * So Balance = Sum(estados_diarios) + random_remanente?
     * 
     * Let's check calculateTotalBalance existing logic.
     * current logic: Sum(activated budgets) - Sum(GASTO logs).
     * 
     * If we add "GASTO_RANDOM" logs, we need to include them in the subtraction.
     * And we need to include "presupuesto_random" in the addition IF the random account is "activated".
     * Let's consider the random account always activated if we have used it or if we want it to count towards savings.
     * 
     * Let's refine existing logic:
     * It sums budgets for keys in `estado.estados_diarios`.
     * Then subtracts ALL expenses of type 'GASTO'.
     * 
     * Revised logic:
     * Total Budget = Sum(activated daily budgets) + Random Budget (always? or only if used? Let's say always for now or maybe initialized).
     * Total Spent = Sum(GASTO) + Sum(GASTO_RANDOM).
     * 
     * Better approach matching current code style:
     * 1. Sum projected budgets for all activated daily keys.
     * 2. Add Random Budget (static) because it's a global pool.
     * 3. Subtract ALL expenses (Daily + Random).
     */
    calculateTotalBalance() {
        let totalBudget = 0;
        const activatedStateKeys = Object.keys(this.estado.estados_diarios);

        // 1. Daily Budgets
        activatedStateKeys.forEach(key => {
            const [city, dayKey] = key.split('||');
            if (this.presupuesto.presupuesto_diario[city] && this.presupuesto.presupuesto_diario[city][dayKey] !== undefined) {
                totalBudget += this.presupuesto.presupuesto_diario[city][dayKey];
            }
        });

        // 2. Random Budget
        // We include it in the "Total Budget" so that (Total Budget - Total Spent) = Savings.
        // NOTE: This implies existing "Balance" meant "Savings + Remaining Daily Allowances".
        // If I haven't spent my daily allowance, it counts as positive balance.
        // So yes, adding the full random budget is correct, as long as we subtract the random expenses.
        totalBudget += (this.presupuesto.configuracion.presupuesto_random || 0);

        // 3. Total Spent
        const totalSpent = this.logs
            .filter(l => l.tipo === 'GASTO' || l.tipo === 'GASTO_RANDOM')
            .reduce((sum, l) => sum + l.monto, 0);

        return totalBudget - totalSpent;
    }

    /**
     * Process 'Balance [City]' command
     */
    getCityBalanceMessage(city) {
        const totalCityBudget = this.presupuesto.totales_por_ciudad ? this.presupuesto.totales_por_ciudad[city] : null;
        if (totalCityBudget === null || totalCityBudget === undefined) {
            return `No encontré un presupuesto total para la ciudad "${city}". Asegúrate de que esté en el archivo de presupuesto.`;
        }

        const citySpent = this.logs
            .filter(l => l.tipo === 'GASTO' && l.ciudad && l.ciudad.toLowerCase() === city.toLowerCase())
            .reduce((sum, l) => sum + l.monto, 0);

        const remaining = totalCityBudget - citySpent;

        if (remaining >= 0) {
            return `En ${city}, has gastado ${citySpent.toFixed(2)} euros de un presupuesto total de ${totalCityBudget.toFixed(2)}. Te quedan ${remaining.toFixed(2)} euros.`;
        } else {
            return `En ${city}, has superado el presupuesto de ${totalCityBudget.toFixed(2)} euros por ${Math.abs(remaining).toFixed(2)} euros (Total gastado: ${citySpent.toFixed(2)}).`;
        }
    }

    /**
     * Returns a formatted string with the budget summary.
     * if isActual is true, it shows remaining balances.
     * if isActual is false, it shows initial planned budget.
     */
    getBudgetReport(isActual = false) {
        const title = isActual ? "📊 PRESUPUESTO ACTUAL (RESTANTE)" : "📅 PLANIFICACIÓN DE PRESUPUESTO";
        let message = `*${title}*\n\n`;

        const cities = Object.keys(this.presupuesto.presupuesto_diario);

        cities.forEach(city => {
            message += `📍 *${city.toUpperCase()}*\n`;
            const days = Object.keys(this.presupuesto.presupuesto_diario[city])
                .filter(k => k.startsWith('dia_'))
                .sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));

            days.forEach(dayKey => {
                const dayNum = dayKey.split('_')[1];
                const initial = this.presupuesto.presupuesto_diario[city][dayKey];

                if (isActual) {
                    const stateKey = `${city}||${dayKey}`;
                    const remaining = this.estado.estados_diarios[stateKey] !== undefined
                        ? this.estado.estados_diarios[stateKey]
                        : initial;
                    message += `  - Día ${dayNum}: ${remaining.toFixed(2)}€\n`;
                } else {
                    message += `  - Día ${dayNum}: ${initial.toFixed(2)}€\n`;
                }
            });
            message += '\n';
        });

        const randomBudget = this.presupuesto.configuracion.presupuesto_random || 0;
        message += `💡 *CUENTA POR LIBRE*\n`;
        if (isActual) {
            const remainingRandom = this.estado.random_remanente !== undefined
                ? this.estado.random_remanente
                : randomBudget;
            message += `  - Disponible: ${remainingRandom.toFixed(2)}€\n`;
        } else {
            message += `  - Asignado: ${randomBudget.toFixed(2)}€\n`;
        }

        if (isActual) {
            message += `\n💰 *BALANCE GLOBAL:* ${this.estado.balance_acumulado.toFixed(2)}€`;
        }

        return message;
    }

    /**
     * Process 'Balance' command
     */
    getBalanceMessage() {
        const balance = this.estado.balance_acumulado;
        if (balance >= 0) {
            return `Hasta ahora, has ahorrado ${balance.toFixed(2)} euros en total (incluyendo cuenta por libre).`;
        } else {
            return `Hasta ahora, has gastado ${Math.abs(balance).toFixed(2)} euros de más en total (incluyendo cuenta por libre).`;
        }
    }
}

/**
 * Simple parser for the messages
 */
function handleMessage(message, groupName) {
    if (groupName !== GROUP_NAME) return null;

    const controller = new FinancialController();
    const cleanMsg = message.trim();

    // Command: Balance [Ciudad]
    const cityBalanceRegex = /^balance\s+([\w\s]+)$/i;
    const cityBalanceMatch = cleanMsg.match(cityBalanceRegex);

    if (cityBalanceMatch) {
        const city = cityBalanceMatch[1].trim();
        // If the city is actually just "balance" (recursive or generic), we skip or handle generic.
        // But the user said "balance Madrid" or "balance Barcelona".
        if (city.toLowerCase() !== 'balance') {
            return controller.getCityBalanceMessage(city);
        }
    }

    // Command: Presupuesto Actual
    if (cleanMsg.toLowerCase() === 'presupuesto actual') {
        return controller.getBudgetReport(true);
    }

    // Command: Presupuesto
    if (cleanMsg.toLowerCase() === 'presupuesto') {
        return controller.getBudgetReport(false);
    }

    // Command: Balance (Generic)
    if (cleanMsg.toLowerCase() === 'balance') {
        return controller.getBalanceMessage();
    }

    // Command: Gasté [monto] euros en random
    // Regex: /Gast[eé] (\d+(?:\.\d+)?) euros en random/i
    const randomExpenseRegex = /Gast[eé] (\d+(?:\.\d+)?) euros en random/i;
    const randomMatch = cleanMsg.match(randomExpenseRegex);

    if (randomMatch) {
        const amount = parseFloat(randomMatch[1]);
        return controller.registerRandomExpense(amount);
    }

    // Command: Gasté [monto] euros en [Ciudad], día [n]
    // Regex flexible para permitir comas o espacios extra
    const expenseRegex = /Gast[eé] (\d+(?:\.\d+)?) euros en\s*[,]?\s*([^,]+),?\s*d[ií]a\s+(\d+)/i;
    const match = cleanMsg.match(expenseRegex);

    if (match) {
        const amount = parseFloat(match[1]);
        const city = match[2].trim();
        const day = parseInt(match[3]);
        return controller.registerExpense(amount, city, day);
    }

    return null;
}

module.exports = { handleMessage, FinancialController };
