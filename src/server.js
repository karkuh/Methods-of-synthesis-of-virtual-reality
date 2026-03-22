const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

app.get('/', (req, res) => {
    res.redirect('/phone');
});

app.get('/phone', (req, res) => {
    res.sendFile(path.join(__dirname, 'phone.html'));
});

let lastData = { alpha: 0, beta: 0, gamma: 0 };
let isPhoneConnected = false;

wss.on('connection', (ws) => {
    console.log('--- Нове підключення до WebSocket ---');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            lastData = data;
            isPhoneConnected = true;

            console.log(`ТЕЛЕФОН -> Z: ${data.alpha.toFixed(2)}, X: ${data.beta.toFixed(2)}, Y: ${data.gamma.toFixed(2)}`);
            
        } catch (e) {
        }
    });

    ws.on('close', () => {
        console.log('Підключення закрито');
        isPhoneConnected = false;
    });
});

setInterval(() => {
    if (isPhoneConnected) {
        const payload = JSON.stringify(lastData);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
}, 20);

const PORT = 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log('============================================');
    console.log(`СЕРВЕР ЗАПУЩЕНО НА ПОРТУ ${PORT}`);
    console.log(`Адреса для телефону: /phone`);
    console.log('============================================');
});