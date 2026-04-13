#!/usr/bin/env node

const http = require('http');

const testData = JSON.stringify({
  action: 'signup',
  name: 'JWT Test User',
  email: `jwttest${Date.now()}@example.com`,
  password: 'SecurePass123!@#'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
};

console.log('Testing JWT Authentication System');
console.log('═══════════════════════════════════\n');

const req = http.request(options, (res) => {
  let data = '';

  console.log(`Status Code: ${res.statusCode}`);
  console.log(`\nResponse Headers:`);
  console.log(JSON.stringify(res.headers, null, 2));

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`\nResponse Body:`);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log(data);
    }

    if (res.headers['set-cookie']) {
      console.log(`\n✅ Auth Cookie Set!`);
      res.headers['set-cookie'].forEach((cookie) => {
        console.log(`   ${cookie.substring(0, 100)}...`);
      });
    } else {
      console.log(`\n❌ No auth cookie found`);
    }
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error.message);
  process.exit(1);
});

console.log('Sending signup request...\n');
req.write(testData);
req.end();
