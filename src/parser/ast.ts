export interface Program {
  type: 'Program';
  declarations: Declaration[];
}

export type Declaration =
  | AssignmentStmt
  | ExprStmt
  | BranchesStmt
  | IterateStmt
  | EnquantoStmt
  | ReturnStmt;

export interface IterateStmt {
  type: 'IterateStmt';
  expression: Expression;
  body: Block;
}

export interface EnquantoStmt {
  type: 'EnquantoStmt';
  condition: Expression;
  body: Block;
}

// atribuição = IDENT '=' expressão
export interface AssignmentStmt {
  type: 'AssignmentStmt';
  identifier: string;
  value: Expression;
}

// exprStmt = expressão (isolada)
export interface ExprStmt {
  type: 'ExprStmt';
  expression: Expression;
}

// retorno = 'return' expressão?
export interface ReturnStmt {
  type: 'ReturnStmt';
  value?: Expression; // opcional
}

// branchesStmt = 'branches' ramo+
export interface BranchesStmt {
  type: 'BranchesStmt';
  branches: Branch[];
}

// ramo = '(' condição? ')' '->' bloco
export interface Branch {
  type: 'Branch';
  condition?: Expression; // ausente no ramo default/else
  block: Block;
}

// bloco = '{' declaração* '}'
export interface Block {
  type: 'Block';
  declarations: Declaration[];
}

export type Expression =
  | AssignmentExpression
  | EqualityExpression
  | RelationalExpression
  | AdditiveExpression
  | MultiplicativeExpression
  | PrimaryExpression;

export interface AssignmentExpression {
  type: 'AssignmentExpression';
  left: Identifier;
  right: Expression;
}

export interface EqualityExpression {
  type: 'EqualityExpression';
  left: Expression;
  operator: '==' | '!=';
  right: Expression;
}

export interface RelationalExpression {
  type: 'RelationalExpression';
  left: Expression;
  operator: '<' | '>' | '<=' | '>=';
  right: Expression;
}

export interface AdditiveExpression {
  type: 'AdditiveExpression';
  left: Expression;
  operator: '+' | '-';
  right: Expression;
}

export interface MultiplicativeExpression {
  type: 'MultiplicativeExpression';
  left: Expression;
  operator: '*' | '/';
  right: Expression;
}

// Primários: literais, identificador, parênteses, chamada, lambda, iterate
export type PrimaryExpression =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | Identifier
  | ParenthesizedExpression
  | FunctionCall
  | LambdaExpression;

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
}

export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
}

export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface Identifier {
  type: 'Identifier';
  name: string;
}

export interface ParenthesizedExpression {
  type: 'ParenthesizedExpression';
  expression: Expression;
}

// Chamada de função: primária '(' argumentos? ')'
export interface FunctionCall {
  type: 'FunctionCall';
  callee: Identifier;
  arguments: Expression[];
}

// Lambda: '(' parâmetros? ')' '->' tipo bloco
export interface LambdaExpression {
  type: 'LambdaExpression';
  parameters: Parameter[];
  returnType: TypeAnnotation;
  body: Block;
}

export interface Parameter {
  type: 'Parameter';
  name: string;
  typeAnnotation: TypeAnnotation;
}

export type TypeAnnotation = 
  | { kind: 'number' }
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'function'; paramTypes: TypeAnnotation[]; returnType: TypeAnnotation };

export type Node =
  | Declaration
  | AssignmentStmt
  | ExprStmt
  | ReturnStmt
  | BranchesStmt
  | EnquantoStmt
  | Branch
  | Block
  | Expression
  | AssignmentExpression
  | EqualityExpression
  | RelationalExpression
  | AdditiveExpression
  | MultiplicativeExpression
  | PrimaryExpression
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | Identifier
  | ParenthesizedExpression
  | FunctionCall
  | LambdaExpression
  | Parameter
  | TypeAnnotation;
