import * as ast from '../parser/ast';
import { DataType, SymbolInfo, Scope, FunctionSignature } from './types';
import { VariableCollector } from './collector';

export class SemanticAnalyzer {
  private globalScope: Scope;
  private currentScope: Scope;
  private cCode: string[] = [];
  private indentLevel: number = 0;
  private currentFunctionReturnType: DataType | null = null;
  private hasReturn: boolean = false;
  private currentFunctionName: string | null = null;
  private originalFunctionName: string | null = null;
  private lambdaCounter: number = 0;
  private collectedLambdas: Map<string, ast.LambdaExpression> = new Map();
  private globalVariables: Map<string, DataType> = new Map();
  private lambdaBodies: Map<string, string> = new Map(); // código C gerado para lambdas
  private tempCounter: number = 0;
  private lambdaFunctionsCode: string[] = [];
  private functionVariables: Map<string, FunctionSignature> = new Map();
  private loopCounter: number = 0;

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
    this.collectedLambdas = collector.getLambdas();
    this.functionVariables = collector.getFunctionVariables();

    // Gerar código para lambdas primeiro
    const lambdaOriginalNames = collector.getLambdaOriginalNames();
    this.generateLambdaFunctions(lambdaOriginalNames);

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
    this.emitRaw('#include <string.h>');
    this.emitRaw('');

    // Inserir as definições das funções lambda aqui (antes do main)
    for (const lambdaCode of this.lambdaFunctionsCode) {
      this.emitRaw(lambdaCode);
      this.emitRaw('');
    }

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
        stringVars.push(`${varName}[256]`);
      } else if (type === 'number' || type === 'boolean') {
        numberVars.push(varName);
      }
    }

    for (const [name, sig] of this.functionVariables) {
      const returnTypeC = this.dataTypeToCType(sig.returnType);
      const paramTypesC = sig.paramTypes.map(t => this.typeAnnotationToCType(t)).join(', ');
      const pointer = `${returnTypeC} (*${name})(${paramTypesC})`;
      this.emit(`${pointer};\n`);
    }

    if (numberVars.length > 0) {
      this.emit(`int ${numberVars.join(', ')};`);
    }
    if (stringVars.length > 0) {
      this.emit(`char* ${stringVars.join(', ')};`);
    }
    if (numberVars.length > 0 || stringVars.length > 0) {
      this.emit('');
    }
  }

  private generateLambdaFunctions(lambdaOriginalNames: Map<string, string>): void {
    for (const [name, lambda] of this.collectedLambdas) {
      const originalName = lambdaOriginalNames.get(name);
      const lambdaCode = this.generateLambdaFunction(name, lambda, originalName);
      this.lambdaFunctionsCode.push(lambdaCode);
    }
  }

  private generateLambdaFunction(name: string, lambda: ast.LambdaExpression, originalName: string | null = null): string {
    const lines: string[] = [];
    const returnTypeC = this.typeAnnotationToCType(lambda.returnType);
    const params: string[] = [];
    for (const param of lambda.parameters) {
      if (param.typeAnnotation.kind !== 'function') {
        const paramTypeC = this.typeAnnotationToCType(param.typeAnnotation);
        params.push(`${paramTypeC} ${param.name}`);
        continue;
      }

      const returnTypeC = this.typeAnnotationToCType(param.typeAnnotation.returnType);
      const paramTypesC = param.typeAnnotation.paramTypes.map(t => this.typeAnnotationToCType(t)).join(', ');
      params.push(`${returnTypeC} (*${param.name})(${paramTypesC})`);
    }
    lines.push(`${returnTypeC} ${name}(${params.join(', ')}) {`);
    this.indentLevel++;
    
    // Escopo da lambda
    const previousScope = this.currentScope;
    const previousReturnType = this.currentFunctionReturnType;
    const previousFunctionName = this.currentFunctionName;
    const previousHasReturn = this.hasReturn;
    
    this.currentScope = new Scope(previousScope);
    this.currentFunctionReturnType = this.typeAnnotationToDataType(lambda.returnType);
    this.currentFunctionName = name;
    this.originalFunctionName = originalName;
    this.hasReturn = false;
    
    // Declarar parâmetros no escopo
    for (const param of lambda.parameters) {
      if (param.typeAnnotation.kind !== 'function') {
        const paramType = this.typeAnnotationToDataType(param.typeAnnotation);
        this.currentScope.declare(param.name, { name: param.name, type: paramType });
        continue;
      }

      const paramTypes = param.typeAnnotation.paramTypes.map(t => this.typeAnnotationToDataType(t));
      const returnType = this.typeAnnotationToDataType(param.typeAnnotation.returnType);
      this.currentScope.declare(param.name, {
        name: param.name,
        type: 'function',
        functionType: { paramTypes, returnType }
      });
    }

    if (originalName) {
      const paramTypes = lambda.parameters.map(p => this.typeAnnotationToDataType(p.typeAnnotation));
      const returnType = this.typeAnnotationToDataType(lambda.returnType);
      this.currentScope.declare(originalName, {
        name: originalName,
        type: 'function',
        functionType: { paramTypes, returnType }
      });
    }
    
    // Coletar variáveis locais da lambda (usar um collector separado ou reutilizar)
    const paramNames = new Set(lambda.parameters.map(p => p.name));
    const localVars = this.collectLocalVariables(lambda.body, paramNames);
    if (localVars.size > 0) {
      const numberVars: string[] = [];
      const stringVars: string[] = [];
      for (const v of localVars) {
        // precisamos saber o tipo; simplificando: assumimos number para variáveis não declaradas explicitamente
        // Para simplificar, declaramos todas como int (para números) ou char[] (se detectar string)
        // Vamos apenas declarar como int; strings serão tratadas por atribuições com strcpy.
        numberVars.push(`int ${v}`);
      }
      if (numberVars.length) lines.push(this.indent() + numberVars.join(', ') + ';');
      if (stringVars.length) lines.push(this.indent() + stringVars.join(', ') + ';');
      lines.push('');
    }
    
    // Gerar o corpo
    const bodyCode = this.generateBlockCode(lambda.body);
    lines.push(bodyCode);
    
    // Verificar retorno
    if (!this.hasReturn && this.currentFunctionReturnType !== 'number') {
      // Para funções que não retornam valor? Na nossa linguagem, toda função deve retornar.
      if (this.currentFunctionReturnType === 'string') {
        lines.push(this.indent() + `return "";`);
      } else {
        lines.push(this.indent() + `return 0;`);
      }
    }
    
    this.indentLevel--;
    lines.push('}');
    
    this.currentScope = previousScope;
    this.currentFunctionReturnType = previousReturnType;
    this.currentFunctionName = previousFunctionName;
    this.hasReturn = previousHasReturn;
    
    return lines.join('\n');
  }

  private collectLocalVariables(block: ast.Block, paramNames: Set<string> = new Set()): Set<string> {
    const collector = new VariableCollector();
    // Configurar o collector para ignorar os nomes dos parâmetros
    collector.setIgnoredNames(paramNames);
    const fakeProgram: ast.Program = { type: 'Program', declarations: block.declarations };
    collector.collect(fakeProgram);
    return new Set(collector.getVariables().keys()); // agora retorna apenas variáveis locais, não parâmetros
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
      case 'IterateStmt':
        this.visitIterateStmt(decl);
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
    console.log(varInfo);
    if (!varInfo) {
      if (stmt.value.type === 'LambdaExpression') {
        // É uma função
        const lambda = stmt.value as ast.LambdaExpression;
        const paramTypes = lambda.parameters.map(p => this.typeAnnotationToDataType(p.typeAnnotation));
        const returnType = this.typeAnnotationToDataType(lambda.returnType);
        console.log('LAMBDAA');
        this.currentScope.declare(stmt.identifier, {
          name: stmt.identifier,
          type: 'function',
          functionType: { paramTypes, returnType, paramNames: lambda.parameters.map(p => p.name) }
        });

        let lambdaName: string | undefined;
        for (const [name, l] of this.collectedLambdas) {
          if (l === lambda) {
            lambdaName = name;
            break;
          }
        }
        if (!lambdaName) {
          // Fallback: gera um novo nome (não deveria acontecer)
          lambdaName = `__lambda_${this.lambdaCounter++}`;
          this.collectedLambdas.set(lambdaName, lambda);
        }
        // Emite a atribuição do ponteiro para função no código C
        this.emit(`${stmt.identifier} = ${lambdaName};`);
      } else {
        // Declara implicitamente com o tipo da expressão
        this.currentScope.declare(stmt.identifier, {
          name: stmt.identifier,
          type: exprType  // 'number' ou 'string'
        });
      }
    } else {
      // Verifica compatibilidade de tipo (não permitir reatribuir string com number ou vice-versa)
      if (!this.areTypesCompatible(varInfo.type, exprType)) {
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

  private visitIterateStmt(stmt: ast.IterateStmt): void {
    const controlType = this.visitExpression(stmt.expression);
    if (controlType !== 'number') {
      throw new Error(`Iterate espera expressão numérica para o número de repetições.`);
    }
    // Geração de código C: for (int _i = 0; _i < N; _i++) { ... }
    const controlCode = this.expressionToC(stmt.expression);
    const loopVar = `_i${this.loopCounter++}`;
    this.emit(`for (int ${loopVar} = 0; ${loopVar} < ${controlCode}; ${loopVar}++) {`);
    this.indentLevel++;
    this.visitBlock(stmt.body);
    this.indentLevel--;
    this.emit(`}`);
  }

  private visitReturnStmt(stmt: ast.ReturnStmt): void {
    if (this.currentFunctionReturnType === null && this.currentFunctionName === null) {
      throw new Error(`'return' fora de função/lambda.`);
    }
    
    if (stmt.value) {
      const exprType = this.visitExpression(stmt.value);
      if (this.currentFunctionReturnType && !this.areTypesCompatible(exprType, this.currentFunctionReturnType)) {
        throw new Error(`Retorno espera '${this.currentFunctionReturnType}', mas expressão é '${exprType}'.`);
      }
      const code = this.expressionToC(stmt.value);
      this.emit(`return ${code};`);
    } else {
      if (this.currentFunctionReturnType === 'number' || this.currentFunctionReturnType === 'boolean') {
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
      case 'LogicalExpression':           // NOVO
        return this.visitBinaryExpression(expr);
      case 'UnaryExpression':
        return this.visitUnaryExpression(expr);
      case 'NumberLiteral':
        return 'number';
      case 'StringLiteral':
        return 'string';
      case 'BooleanLiteral':
        return 'boolean';
      case 'Identifier':
        return this.visitIdentifier(expr);
      case 'ParenthesizedExpression':
        return this.visitExpression(expr.expression);
      case 'FunctionCall':
        return this.visitFunctionCall(expr);
      case 'LambdaExpression':
        return 'function';
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
    if (!this.areTypesCompatible(rightType, 'number')) {
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
    
    if (!this.areTypesCompatible(leftType, 'number') || !this.areTypesCompatible(rightType, 'number')) {
      throw new Error(`Operador '${expr.operator}' requer operandos numéricos.`);
    }
    
    return 'number';
  }

  private visitUnaryExpression(expr: ast.UnaryExpression): DataType {
    const operandType = this.visitExpression(expr.operand);
    if (!this.areTypesCompatible(operandType, 'number')) {
      throw new Error(`Operador '${expr.operator}' requer operando numérico.`);
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
    if (!funcInfo || (funcInfo.type !== 'function' && !funcInfo.functionType)) {
      throw new Error(`'${expr.callee.name}' não é uma função.`);
    }
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
      if (!this.areTypesCompatible(argType, expectedParams[i]!)) {
        throw new Error(`Argumento ${i + 1} da função '${expr.callee.name}' espera '${expectedParams[i]}', mas é '${argType}'.`);
      }
    }
    
    return funcInfo.functionType!.returnType;
  }

  private expressionToC(expr: ast.Expression): string {
    switch (expr.type) {
      case 'NumberLiteral':
        return expr.value.toString();
      case 'StringLiteral':
        return `"${expr.value}"`;
      case 'BooleanLiteral':
        return expr.value ? '1' : '0';
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
      case 'LogicalExpression':
        return `${this.expressionToC(expr.left)} ${expr.operator} ${this.expressionToC(expr.right)}`;
      case 'UnaryExpression':
        return `!${this.expressionToC(expr.operand)}`;
      case 'FunctionCall':
        const calleeName = expr.callee.name;
        // Se a função atual tem um nome original e o callee é esse nome, substitui pelo nome da lambda
        if (this.currentFunctionName && this.originalFunctionName && calleeName === this.originalFunctionName) {
          // Usa o próprio nome da função (__lambda_X)
          const args = expr.arguments.map(arg => this.expressionToC(arg)).join(', ');
          return `${this.currentFunctionName}(${args})`;
        }
        // Caso contrário, uso normal
        const args = expr.arguments.map(arg => this.expressionToC(arg)).join(', ');
        return `${calleeName}(${args})`;
      case 'LambdaExpression':
        // Lambdas devem ter sido convertidas para funções C
        const lambdaName = `__lambda_${this.lambdaCounter++}`;
        this.collectedLambdas.set(lambdaName, expr);
        return lambdaName;
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
    if (ann.kind === 'string') return 'string';
    if (ann.kind === 'boolean') return 'boolean';
    if (ann.kind === 'function') return 'function';
    throw new Error(`Tipo desconhecido: ${Object.hasOwn(ann, 'kind') ? (ann as any).kind : ann}`);
  }

  private typeAnnotationToCType(ann: ast.TypeAnnotation): string {
    if (ann.kind === 'number') return 'int';
    if (ann.kind === 'boolean') return 'int';
    if (ann.kind === 'string') return 'char*';
    if (ann.kind === 'function') {
      const returnC = this.typeAnnotationToCType(ann.returnType);
      const paramsC = ann.paramTypes.map(p => this.typeAnnotationToCType(p)).join(', ');
      return `${returnC} (*)(${paramsC})`;
    }
    throw new Error(`Tipo C desconhecido: ${(ann as any).kind}`);
  }

  private dataTypeToCType(type: DataType): string {
    if (type === 'number') return 'int';
    if (type === 'boolean') return 'int';
    if (type === 'string') return 'char*';
    return 'void*';
  }

  private areTypesCompatible(a: DataType, b: DataType): boolean {
    if (a === b) return true;
    const numericTypes: DataType[] = ['number', 'boolean'];
    return numericTypes.includes(a) && numericTypes.includes(b);
  }
}