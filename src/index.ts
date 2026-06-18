
import { Lexer } from './lexer/lexer';
import { readFileSync, writeFileSync } from 'node:fs';
import { Parser } from './parser/parser';
import { SemanticAnalyzer } from './semantic/semantic-analyzer';

const TEST_MAP = {
  '1': 'tests/ola.sds',
  '2': 'tests/expressao.sds',
  '3': 'tests/branches.sds',
  '4': 'tests/iteracao.sds',
  '5': 'tests/lambda.sds',
  '6': 'tests/fatorial.sds',
  '7': 'tests/logicos.sds',
  '8': 'tests/while.sds',
  '9': 'tests/booleano.sds',
  '10': 'tests/erro_lexico.sds',
  '11': 'tests/erro_sintatico.sds'
} as const;

const chosenText = TEST_MAP[process.argv[2] as keyof typeof TEST_MAP] ?? 'tests/programa.sds';
if (!chosenText) {
  console.error('Invalid test case selected. Inform a number between 1 and 8 as an argument.');
  process.exit(1);
}

const src = readFileSync(chosenText, 'utf-8');

const compilationStart = Date.now();

const tokens = new Lexer(src).processSource();
writeFileSync('outputs/tokens.txt', JSON.stringify(tokens, null, 2));

const ast = new Parser(tokens).parseProgram();
writeFileSync('outputs/ast.txt', JSON.stringify(ast, null, 2));

const cCode = new SemanticAnalyzer().analyze(ast);
writeFileSync('outputs/main.c', cCode);
const compilationTimeMs = Date.now() - compilationStart;
console.log(
  `Compilacao concluida em ${compilationTimeMs} ms.\n` +
  `Saida gerada em: outputs/main.c\n` +
  `Execute com: npm run run-compiled`
);
