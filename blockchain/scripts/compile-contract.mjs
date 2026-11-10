import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from '../../backend/node_modules/solc/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '../..');
const contractPath = path.join(root, 'blockchain/contracts/RecipeRegistry.sol');
const source = await fs.readFile(contractPath, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'RecipeRegistry.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((issue) => issue.severity === 'error');
if (errors.length) {
  for (const error of errors) process.stderr.write(`${error.formattedMessage}\n`);
  process.exit(1);
}
const compiled = output.contracts?.['RecipeRegistry.sol']?.RecipeRegistry;
if (!compiled?.evm?.bytecode?.object) throw new Error('Solidity compiler did not produce deployable bytecode.');
const artifact = {
  contractName: 'RecipeRegistry',
  sourceName: 'RecipeRegistry.sol',
  compilerVersion: solc.version(),
  settings: input.settings,
  abi: compiled.abi,
  bytecode: `0x${compiled.evm.bytecode.object}`,
  deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
};
const artifactDir = path.join(root, 'blockchain/artifacts');
await fs.mkdir(artifactDir, { recursive: true });
await fs.writeFile(path.join(artifactDir, 'RecipeRegistry.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(`Compiled RecipeRegistry with ${artifact.compilerVersion}.`);
