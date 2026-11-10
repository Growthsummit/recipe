// Exports the app's recipe data to JSON so the Python pipeline uses the SAME recipes as the app.
const fs = require('fs');
const path = require('path');
process.env.PUBLIC_URL = '';
let src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'data', 'recipes.js'), 'utf8');
src = src.replace(/export (const|function)/g, '$1') + '\nmodule.exports = { RECIPES };';
const mod = { exports: {} };
new Function('module', 'process', src)(mod, process);
fs.writeFileSync(path.join(__dirname, 'data', 'recipes.json'), JSON.stringify(mod.exports.RECIPES, null, 2));
console.log('exported', mod.exports.RECIPES.length, 'recipes');
