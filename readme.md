## Convenções
...? : opcional
...* : zero ou mais repetições
'...' : terminais
// : comentário

# Gramática

## Programa e declarações
programa         = declaração*

declaração       = atribuição ';'
                 | exprStmt ';'
                 | branchesStmt
                 | retorno ';'

atribuição       = IDENT '=' expressão

exprStmt         = expressão

retorno          = 'return' expressão?

branchesStmt     = 'branches' ramo+

ramo             = '(' condição? ')' '->' bloco
condição         = expressão

## Blocos e corpo
bloco            = '{' declaração* '}'

## Expressões (com precedência)
expressão        = atribuiçãoExpr

atribuiçãoExpr = IDENT '=' (atribuiçãoExpr | igualdade)

igualdade        = relacional ( ('==' | '!=') relacional )*

relacional       = aditiva ( ('<' | '>' | '<=' | '>=') aditiva )*

aditiva          = termo ( ('+' | '-') termo )*

termo            = fator ( ('*' | '/') fator )*

fator            = NUMBER
                 | STRING
                 | 'true'
                 | 'false'
                 | IDENT
                 | '(' expressão ')'
                 | chamada
                 | lambda
                 | 'iterate' '(' expressão ')' bloco      // repetição

## Chamada de função
chamada          = primária '(' argumentos? ')'

primária         = IDENT
                 | '(' expressão ')'

argumentos       = expressão ( ',' expressão )*
Função lambda (expressão)
text
lambda           = '(' parâmetros? ')' '->' tipo bloco

parâmetros       = param ( ',' param )*
param            = IDENT ':' tipo

tipo             = 'number'
                 | 'string'
                 | 'boolean'
                 | '(' tipos? ')' '->' tipo

tipos            = tipo ( ',' tipo )*

## Tokens (definição léxica)
NUMBER           = [0-9]+ ( '.' [0-9]+ )?
STRING           = '"' ( [^"] )* '"'
IDENT            = [a-zA-Z_][a-zA-Z0-9_]*

## Palavras reservadas:
branches, iterate, return, number, string, boolean, true, false

## Operadores e pontuadores:
'='  '=='  '!='  '<'  '>'  '<='  '>='
'+'  '-'  '*'  '/'
'('  ')'  '{'  '}'  ';'  ','  ':'  '->'

# Como Rodar

Tendo node instalado no seu sistema, rodar `npx ts-node src/index.ts`
Isso vai compilar o código em tests/programa.sds
O output será criado em outputs/code.c
O código C pode ser executado com "npm run run-compiled"

### Programas padrão de teste
Foram incluídos, na pasta tests/, alguns programas prontos na linguagem fantasia que podem ser executados com `npx ts-node src/index.ts <NÚMERO>`
O número de cada programa é
  1 -> ola.sds
  2 -> expressao.sds
  3 -> branches.sds
  4 -> iteracao.sds
  5 -> lambda.sds
  6 -> fatorial.sds
  7 -> erro_lexico.sds
  8 -> erro_sintatico.sds
