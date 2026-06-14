import * as ast from '../parser/ast';
import { DataType, SymbolInfo, Scope } from './types';
import { VariableCollector } from './collector';

export class SemanticAnalyzer {
  private globalScope: Scope;
  private currentScope: Scope;
  private cCode: string[] = [];
  private indentLevel: number = 0;
  private currentFunctionReturnType: DataType | null = null;
  private hasReturn: boolean = false;
  private currentFunctionName: string | null = null;
  private lambdaCounter: number = 0;
  private collectedLambdas: Map<string, ast.LambdaExpression> = new Map();
  private globalVariables: Map<string, DataType> = new Map();
  private lambdaBodies: Map<string, string> = new Map(); // código C gerado para lambdas
  private tempCounter: number = 0;

  constructor() {
    this.globalScope = new Scope();
    this.currentScope = this.globalScope;
    
    // Declara funções nativas
    this.globalScope.declare('escrever', {
      name: 'escrever',
      type: 'function',
      functionType: {
        paramTypes: ['number'],
        returnType: 'number'
      }
    });
    this.globalScope.declare('escreverString', {
      name: 'escreverString',
      type: 'function',
      functionType: {
        paramTypes: ['string'],
        returnType: 'number'
      }
    });
  }

  private indent(): string {
    return '    '.repeat(this.indentLevel);
  }

  private emit(line: string): void {
    this.cCode.push(this.indent() + line);
  }

  private emitRaw(line: string): void {
    this.cCode.push(line);
  }

  // Método principal
  public analyze(program: ast.Program): string {
    // Primeira passagem: coletar variáveis e lambdas
    const collector = new VariableCollector();
    collector.collect(program);
    this.globalVariables = collector.getVariables();
    console.log(this.globalVariables);
    this.collectedLambdas = collector.getLambdas();

    // Gerar código para lambdas primeiro
    this.generateLambdaFunctions();

    // Segunda passagem: gerar código principal
    this.generateStartingCode();

    // Declara variáveis globais no início do main
    this.generateGlobalVariables();

    // Visita as declarações do programa
    for (const decl of program.declarations) {
      this.visitDeclaration(decl);
    }

    this.generateFinishingCode();

    return this.cCode.join('\n');
  }

  private generateStartingCode() {
    this.emitRaw('#include <stdio.h>');
    this.emitRaw('#include <stdlib.h>');
    this.emitRaw('');
    this.emitRaw('int main() {');
    this.indentLevel++;
  }

  private generateFinishingCode() {
    this.indentLevel--;
    this.emitRaw('}');
  }

  private generateGlobalVariables() {
    const numberVars: string[] = [];
    const stringVars: string[] = [];
    for (const [varName, type] of this.globalVariables) {
      if (type === 'string') {
        stringVars.push(`char ${varName}[256]`);
      } else if (type === 'number') {
        numberVars.push(`int ${varName}`);
      }
    }

    if (numberVars.length > 0) {
      this.emit(`${numberVars.join(', ')};`);
    }
    if (stringVars.length > 0) {
      this.emit(`${stringVars.join(', ')};`);
    }
    if (numberVars.length > 0 || stringVars.length > 0) {
      this.emit('');
    }
  }

  private generateLambdaFunctions(): void {
    for (const [name, lambda] of this.collectedLambdas) {
      const lambdaCode = this.generateLambdaFunction(name, lambda);
      this.lambdaBodies.set(name, lambdaCode);
    }
  }

  private generateLambdaFunction(name: string, lambda: ast.LambdaExpression): string {
    const lines: string[] = [];
    const returnType = this.typeAnnotationToCType(lambda.returnType);
    
    // Constrói lista de parâmetros para C
    const params: string[] = [];
    for (const param of lambda.parameters) {
      const paramType = this.typeAnnotationToCType(param.typeAnnotation);
      params.push(`${paramType} ${param.name}`);
    }
    
    lines.push(`${returnType} ${name}(${params.join(', ')}) {`);
    
    // Escopo da lambda
    const previousScope = this.currentScope;
    const previousReturnType = this.currentFunctionReturnType;
    const previousFunctionName = this.currentFunctionName;
    const previousHasReturn = this.hasReturn;
    
    this.currentScope = new Scope(previousScope);
    this.currentFunctionReturnType = this.typeAnnotationToDataType(lambda.returnType);
    this.currentFunctionName = name;
    this.hasReturn = false;
    
    // Declara parâmetros no escopo
    for (const param of lambda.parameters) {
      const paramType = this.typeAnnotationToDataType(param.typeAnnotation);
      this.currentScope.declare(param.name, { name: param.name, type: paramType });
    }
    
    // Coleta variáveis implícitas da lambda
    const localVars = this.collectLocalVariables(lambda.body);
    if (localVars.size > 0) {
      lines.push(`    int ${Array.from(localVars).join(', ')};`);
      lines.push('');
    }
    
    // Gera código do corpo
    const bodyCode = this.generateBlockCode(lambda.body);
    lines.push(bodyCode);
    
    // Verifica retorno
    if (!this.hasReturn && this.currentFunctionReturnType === 'number') {
      lines.push('    return 0;');
    }
    
    lines.push('}');
    lines.push('');
    
    this.currentScope = previousScope;
    this.currentFunctionReturnType = previousReturnType;
    this.currentFunctionName = previousFunctionName;
    this.hasReturn = previousHasReturn;
    
    return lines.join('\n');
  }

  private collectLocalVariables(block: ast.Block): Map<string, DataType> {
    const collector = new VariableCollector();
    // Criamos um programa fictício com o bloco
    const fakeProgram: ast.Program = {
      type: 'Program',
      declarations: block.declarations
    };
    collector.collect(fakeProgram);
    return collector.getVariables();
  }

  private generateBlockCode(block: ast.Block, isTopLevel: boolean = false): string {
    const previousCode = this.cCode;
    const previousIndent = this.indentLevel;
    
    // Buffer temporário para o código do bloco
    this.cCode = [];
    
    const previousScope = this.currentScope;
    this.currentScope = new Scope(previousScope);
    
    for (const decl of block.declarations) {
      this.visitDeclaration(decl);
    }
    
    this.currentScope = previousScope;
    
    const result = this.cCode.join('\n');
    this.cCode = previousCode;
    this.indentLevel = previousIndent;
    
    return result;
  }

  private visitDeclaration(decl: ast.Declaration): void {
    switch (decl.type) {
      case 'AssignmentStmt':
        this.visitAssignmentStmt(decl);
        break;
      case 'ExprStmt':
        this.visitExprStmt(decl);
        break;
      case 'BranchesStmt':
        this.visitBranchesStmt(decl);
        break;
      case 'ReturnStmt':
        this.visitReturnStmt(decl);
        break;
    }
  }

  private visitAssignmentStmt(stmt: ast.AssignmentStmt): void {
    // Verifica tipo da expressão (pode ser number ou string)
    const exprType = this.visitExpression(stmt.value);
    
    // Verifica se a variável existe
    let varInfo = this.currentScope.lookup(stmt.identifier);
    if (!varInfo) {
      // Declara implicitamente com o tipo da expressão
      this.currentScope.declare(stmt.identifier, {
        name: stmt.identifier,
        type: exprType  // 'number' ou 'string'
      });
    } else {
      // Verifica compatibilidade de tipo (não permitir reatribuir string com number ou vice-versa)
      if (varInfo.type !== exprType) {
        throw new Error(`Tipo incompatível: variável '${stmt.identifier}' é '${varInfo.type}', mas atribuição é '${exprType}'.`);
      }
    }
    
    // Gera código C (para string, o código C precisa ser diferente)
    const code = this.expressionToC(stmt.value);
    if (exprType === 'string') {
      // String em C precisa ser copiada com strcpy, pois não se pode atribuir diretamente com '='
      this.emit(`strcpy(${stmt.identifier}, ${code});`);
    } else {
      this.emit(`${stmt.identifier} = ${code};`);
    }
  }

  private visitExprStmt(stmt: ast.ExprStmt): void {
    if (stmt.expression.type === 'FunctionCall') {
      const call = stmt.expression as ast.FunctionCall;
      
      // Fallback para arguments vazio ou undefined
      const args = call.arguments || [];
      
      if (call.callee.name === 'escrever') {
        // Tratamento especial para escrever
        if (!args[0]) {
          // Sem argumento: apenas imprime uma linha em branco
          this.emit(`printf("\\n");`);
        } else {
          const arg = args[0]!;
          const argType = this.visitExpression(arg);
          const argCode = this.expressionToC(arg);
          
          if (argType === 'string') {
            this.emit(`printf("%s\\n", ${argCode});`);
          } else {
            this.emit(`printf("%d\\n", ${argCode});`);
          }
        }
      } else if (call.callee.name === 'escreverString') {
        if (!args[0]) {
          this.emit(`printf("\\n");`);
        } else {
          const argCode = this.expressionToC(args[0]);
          this.emit(`printf("%s\\n", ${argCode});`);
        }
      } else {
        // Chamada de função normal
        if (!args[0]) {
          // Função sem argumentos
          this.emit(`${call.callee.name}();`);
        } else {
          const code = this.expressionToC(stmt.expression);
          this.emit(`${code};`);
        }
      }
    } else {
      const code = this.expressionToC(stmt.expression);
      this.emit(`${code};`);
    }
  }

  private visitBranchesStmt(stmt: ast.BranchesStmt): void {
    let hasDefault = false;
    for (let i = 0; i < stmt.branches.length; i++) {
      const branch = stmt.branches[i];

      if (!branch)
        throw new Error('Nenhuma branch');
      
      if (branch.condition) {
        const condCode = this.expressionToC(branch.condition);
        if (i === 0) {
          this.emit(`if (${condCode}) {`);
        } else {
          this.emit(`else if (${condCode}) {`);
        }
      } else {
        if (hasDefault) {
          throw new Error('Múltiplos ramos padrão em branches.');
        }
        hasDefault = true;
        this.emit(`else {`);
      }
      
      this.indentLevel++;
      this.visitBlock(branch.block);
      this.indentLevel--;
      this.emit(`}`);
    }
  }

  private visitReturnStmt(stmt: ast.ReturnStmt): void {
    if (this.currentFunctionReturnType === null && this.currentFunctionName === null) {
      throw new Error(`'return' fora de função/lambda.`);
    }
    
    if (stmt.value) {
      const exprType = this.visitExpression(stmt.value);
      if (exprType !== this.currentFunctionReturnType) {
        throw new Error(`Retorno espera '${this.currentFunctionReturnType}', mas expressão é '${exprType}'.`);
      }
      const code = this.expressionToC(stmt.value);
      this.emit(`return ${code};`);
    } else {
      if (this.currentFunctionReturnType === 'number') {
        this.emit(`return 0;`);
      }
    }
    this.hasReturn = true;
  }

  private visitBlock(block: ast.Block): void {
    const previousScope = this.currentScope;
    this.currentScope = new Scope(previousScope);
    
    for (const decl of block.declarations) {
      this.visitDeclaration(decl);
    }
    
    this.currentScope = previousScope;
  }

  private visitExpression(expr: ast.Expression | undefined): DataType {
    if (!expr)
      throw new Error('Expressão necessária');

    switch (expr.type) {
      case 'AssignmentExpression':
        return this.visitAssignmentExpression(expr);
      case 'EqualityExpression':
      case 'RelationalExpression':
      case 'AdditiveExpression':
      case 'MultiplicativeExpression':
        return this.visitBinaryExpression(expr);
      case 'NumberLiteral':
        return 'number';
      case 'StringLiteral':
        return 'string';
      case 'Identifier':
        return this.visitIdentifier(expr);
      case 'ParenthesizedExpression':
        return this.visitExpression(expr.expression);
      case 'FunctionCall':
        return this.visitFunctionCall(expr);
      case 'LambdaExpression':
        return 'function';
      case 'IterateExpression':
        return this.visitIterateExpression(expr);
      default:
        throw new Error(`Expressão desconhecida: ${(expr as any).type}`);
    }
  }

  private visitAssignmentExpression(expr: ast.AssignmentExpression): DataType {
    let varInfo = this.currentScope.lookup(expr.left.name);
    if (!varInfo) {
      this.currentScope.declare(expr.left.name, {
        name: expr.left.name,
        type: 'number'
      });
    }
    
    const rightType = this.visitExpression(expr.right);
    if (rightType !== 'number') {
      throw new Error(`Atribuição espera 'number', mas lado direito é '${rightType}'.`);
    }
    return 'number';
  }

  private visitBinaryExpression(expr: any): DataType {
    const leftType = this.visitExpression(expr.left);
    const rightType = this.visitExpression(expr.right);

    // Sobecarga de operador para concatenação
    if (expr.operator === '+' && (leftType === 'string' || rightType === 'string')) {
      return 'string';
    }
    
    if (leftType !== 'number' || rightType !== 'number') {
      throw new Error(`Operador '${expr.operator}' requer operandos numéricos.`);
    }
    
    return 'number';
  }

  private visitIdentifier(expr: ast.Identifier): DataType {
    const info = this.currentScope.lookup(expr.name);
    if (!info) {
      // Para lambdas, o identificador pode ser o nome da função gerada
      if (this.collectedLambdas.has(expr.name)) {
        return 'function';
      }
      throw new Error(`Identificador '${expr.name}' não declarado.`);
    }
    return info.type;
  }

  private visitFunctionCall(expr: ast.FunctionCall): DataType {
    // Verifica se é uma lambda (função gerada)
    let funcInfo = this.currentScope.lookup(expr.callee.name);
    let isLambda = false;
    
    if (!funcInfo && this.collectedLambdas.has(expr.callee.name)) {
      isLambda = true;
      // Cria informação temporária para a lambda
      const lambda = this.collectedLambdas.get(expr.callee.name)!;
      funcInfo = {
        name: expr.callee.name,
        type: 'function',
        functionType: {
          paramTypes: lambda.parameters.map(p => this.typeAnnotationToDataType(p.typeAnnotation)),
          returnType: this.typeAnnotationToDataType(lambda.returnType)
        }
      };
    }
    
    if (!funcInfo || funcInfo.type !== 'function') {
      throw new Error(`'${expr.callee.name}' não é uma função.`);
    }
    
    const expectedParams = funcInfo.functionType!.paramTypes;
    if (expr.arguments.length !== expectedParams.length) {
      throw new Error(`Função '${expr.callee.name}' espera ${expectedParams.length} argumentos, mas recebeu ${expr.arguments.length}.`);
    }
    
    for (let i = 0; i < expr.arguments.length; i++) {
      const argType = this.visitExpression(expr.arguments[i]);
      if (argType !== expectedParams[i]) {
        throw new Error(`Argumento ${i + 1} da função '${expr.callee.name}' espera '${expectedParams[i]}', mas é '${argType}'.`);
      }
    }
    
    return funcInfo.functionType!.returnType;
  }

  private visitIterateExpression(expr: ast.IterateExpression): DataType {
    const controlType = this.visitExpression(expr.expression);
    if (controlType !== 'number') {
      throw new Error(`Iterate espera expressão numérica para o número de repetições.`);
    }
    
    // Visita o bloco (cria novo escopo)
    const previousScope = this.currentScope;
    this.currentScope = new Scope(previousScope);
    this.visitBlock(expr.body);
    this.currentScope = previousScope;
    
    return 'number';
  }

  private expressionToC(expr: ast.Expression): string {
    switch (expr.type) {
      case 'NumberLiteral':
        return expr.value.toString();
      case 'StringLiteral':
        return `"${expr.value}"`;
      case 'Identifier':
        return expr.name;
      case 'ParenthesizedExpression':
        return `(${this.expressionToC(expr.expression)})`;
      case 'AssignmentExpression':
        return `${this.expressionToC(expr.left)} = ${this.expressionToC(expr.right)}`;
      case 'EqualityExpression':
        return `${this.expressionToC(expr.left)} ${expr.operator} ${this.expressionToC(expr.right)}`;
      case 'RelationalExpression':
        return `${this.expressionToC(expr.left)} ${expr.operator} ${this.expressionToC(expr.right)}`;
      case 'AdditiveExpression':
        if (expr.operator === '+') {
          const leftType = this.visitExpression(expr.left);
          const rightType = this.visitExpression(expr.right);
          if (leftType === 'string' || rightType === 'string') {
            return this.concatenationWithTempVariable(expr.left, expr.right);
          }
        }
        return `${this.expressionToC(expr.left)} ${expr.operator} ${this.expressionToC(expr.right)}`;
      case 'MultiplicativeExpression':
        return `${this.expressionToC(expr.left)} ${expr.operator} ${this.expressionToC(expr.right)}`;
      case 'FunctionCall':
        const args = expr.arguments.map(arg => this.expressionToC(arg)).join(', ');
        return `${expr.callee.name}(${args})`;
      case 'LambdaExpression':
        // Lambdas devem ter sido convertidas para funções C
        const lambdaName = `__lambda_${this.lambdaCounter++}`;
        this.collectedLambdas.set(lambdaName, expr);
        return lambdaName;
      case 'IterateExpression':
        // Iterate como expressão não é suportada
        throw new Error('Iterate não deve aparecer como expressão.');
      default:
        throw new Error(`Tipo de expressão não suportada na geração C: ${(expr as any).type}`);
    }
  }

  private concatenationWithTempVariable(left: ast.Expression, right: ast.Expression) {
    // Concatenação: gerar variavel temporária
    const tempVar = `__temp_${this.tempCounter++}`;
    const leftCode = this.expressionToC(left);
    const rightCode = this.expressionToC(right);
    
    this.emit(`char ${tempVar}[512];`);
    
    const leftType = this.visitExpression(left);
    const rightType = this.visitExpression(right);
    let leftTemplate = '%s';
    let rightTemplate = '%s';
    // Verifica qual lado é string e qual é número
    if (leftType === 'number')
      leftTemplate = '%d';
    if (rightType === 'number')
      rightTemplate = '%d';

    this.emit(`snprintf(${tempVar}, 512, "${leftTemplate}${rightTemplate}", ${leftCode}, ${rightCode});`);
    return tempVar;
  }

  private typeAnnotationToDataType(ann: ast.TypeAnnotation): DataType {
    if (ann.kind === 'number') return 'number';
    if (ann.kind === 'function') return 'function';
    throw new Error(`Tipo desconhecido: ${Object.hasOwn(ann, 'kind') ? (ann as any).kind : ann}`);
  }

  private typeAnnotationToCType(ann: ast.TypeAnnotation): string {
    if (ann.kind === 'number') return 'int';
    if (ann.kind === 'function') return 'int (*)()';
    throw new Error(`Tipo C desconhecido: ${Object.hasOwn(ann, 'kind') ? (ann as any).kind : ann}`);
  }
}