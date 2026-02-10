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
    constructor() {
        this.presupuesto = readJson(CONFIG_FILES.presupuesto) || { presupuesto_diario: {} };
        this.estado = readJson(CONFIG_FILES.estado) || { balance_acumulado: 0, estados_diarios: {} };
        this.logs = readJson(CONFIG_FILES.logs) || [];
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
        writeJson(CONFIG_FILES.estado, this.estado);
        writeJson(CONFIG_FILES.logs, this.logs);

        return `Genial, te quedan ${this.estado.estados_diarios[stateKey].toFixed(2)} euros para este día. Puedes gastarlos o dejarlos para sumar al balance. Tu balance acumulado es de ${this.estado.balance_acumulado.toFixed(2)} euros.`;
    }

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

        const totalSpent = this.logs
            .filter(l => l.tipo === 'GASTO')
            .reduce((sum, l) => sum + l.monto, 0);

        return totalBudget - totalSpent;
    }

    /**
     * Process 'Balance' command
     */
    getBalanceMessage() {
        const balance = this.estado.balance_acumulado;
        if (balance >= 0) {
            return `Hasta ahora, has ahorrado ${balance.toFixed(2)} euros.`;
        } else {
            return `Hasta ahora, has gastado ${Math.abs(balance).toFixed(2)} euros de más.`;
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

    // Command: Balance
    if (cleanMsg.toLowerCase() === 'balance') {
        return controller.getBalanceMessage();
    }

    // Command: Gasté [monto] euros en [Ciudad], día [n]
    const expenseRegex = /Gast[eé] (\d+(?:\.\d+)?) euros en ([\w\s]+), d[ií]a (\d+)/i;
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
