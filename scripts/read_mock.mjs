import fs from 'fs';
const text = fs.readFileSync('mock_out.txt', 'utf8');
console.log(text.substring(text.length - 1000));
