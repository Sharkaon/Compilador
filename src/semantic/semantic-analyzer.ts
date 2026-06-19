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
  private lambdaBodies: Map<string, string> = new Map();
  private tempCounter: number = 0;
  private lambdaFunctionsCode: string[] = [];
  private functionVariables: Map<string, FunctionSignature> = new Map();
  private loopCounter: number = 0;

  constructor() {
    this.globalScope = new Scope();
    this.currentScope = this.globalScope;
    
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

  public analyze(program: ast.Program): string {
    const collector = new VariableCollector();
    collector.collect(program);
    this.globalVariables = collector.getVariables();
    this.collectedLambdas = collector.getLambdas();
    this.functionVariables = collector.getFunctionVariables();

    const lambdaOriginalNames = collector.getLambdaOriginalNames();
    this.generateLambdaFunctions(lambdaOriginalNames);

    this.generateStartingCode();
    this.generateGlobalVariables();
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
    for (const [name, sig] of this.functionVariables) {
      const returnTypeC = this.dataTypeToCType(sig.returnType);
      const paramTypesC = sig.paramTypes.map(t => this.typeAnnotationToCType(t)).join(', ');
      const pointer = `${returnTypeC} (*${name})(${paramTypesC})`;
      this.emit(`${pointer};\n`);
    }

    const declarations = this.buildVariableDeclarations(this.globalVariables);
    for (const declaration of declarations) {
      this.emit(declaration);
    }

    if (declarations.length > 0) {
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
    
    const previousScope = this.currentScope;
    const previousReturnType = this.currentFunctionReturnType;
    const previousFunctionName = this.currentFunctionName;
    const previousHasReturn = this.hasReturn;
    
    this.currentScope = new Scope(previousScope);
    this.currentFunctionReturnType = this.typeAnnotationToDataType(lambda.returnType);
    this.currentFunctionName = name;
    this.originalFunctionName = originalName;
    this.hasReturn = false;
    
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
    
    const paramNames = new Set(lambda.parameters.map(p => p.name));
    const localVars = this.collectLocalVariables(lambda.body, paramNames);
    const localDeclarations = this.buildVariableDeclarations(localVars);
    if (localDeclarations.length > 0) {
      for (const declaration of localDeclarations) {
        lines.push(this.indent() + declaration);
      }
      lines.push('');
    }
    
    const bodyCode = this.generateBlockCode(lambda.body);
    lines.push(bodyCode);
    
    if (!this.hasReturn && this.currentFunctionReturnType !== 'number') {
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

  private collectLocalVariables(block: ast.Block, paramNames: Set<string> = new Set()): Map<string, DataType> {
    const collector = new VariableCollector();
    collector.setIgnoredNames(paramNames);
    const fakeProgram: ast.Program = { type: 'Program', declarations: block.declarations };
    collector.collect(fakeProgram);
    return collector.getVariables();
  }

  private buildVariableDeclarations(variables: Map<string, DataType>): string[] {
    const numberVars: string[] = [];
    const stringVars: string[] = [];

    for (const [varName, type] of variables) {
      if (type === 'string') {
        stringVars.push(`${varName}[256]`);
        continue;
      }

      if (type === 'number' || type === 'boolean') {
        numberVars.push(varName);
      }
    }

    const declarations: string[] = [];
    if (numberVars.length > 0) {
      declarations.push(`int ${numberVars.join(', ')};`);
    }
    if (stringVars.length > 0) {
      declarations.push(`char ${stringVars.join(', ')};`);
    }
    return declarations;
  }

  private generateBlockCode(block: ast.Block, isTopLevel: boolean = false): string {
    const previousCode = this.cCode;
    const previousIndent = this.indentLevel;
    
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
      case 'WhileStmt':
        this.visitWhileStmt(decl);
        break;
      case 'ReturnStmt':
        this.visitReturnStmt(decl);
        break;
    }
  }

  private visitAssignmentStmt(stmt: ast.AssignmentStmt): void {
    const exprType = this.visitExpression(stmt.value);
    
    let varInfo = this.currentScope.lookup(stmt.identifier);
    if (!varInfo) {
      if (stmt.value.type === 'LambdaExpression') {
        const lambda = stmt.value as ast.LambdaExpression;
        const paramTypes = lambda.parameters.map(p => this.typeAnnotationToDataType(p.typeAnnotation));
        const returnType = this.typeAnnotationToDataType(lambda.returnType);
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
          lambdaName = `__lambda_${this.lambdaCounter++}`;
          this.collectedLambdas.set(lambdaName, lambda);
        }
        this.emit(`${stmt.identifier} = ${lambdaName};`);
      } else {
        this.currentScope.declare(stmt.identifier, {
          name: stmt.identifier,
          type: exprType
        });
      }
    } else {
      if (!this.areTypesCompatible(varInfo.type, exprType)) {
        throw new Error(`Tipo incompatível: variável '${stmt.identifier}' é '${varInfo.type}', mas atribuição é '${exprType}'.`);
      }
    }
    
    const code = this.expressionToC(stmt.value);
    if (exprType === 'string') {
      this.emit(`strcpy(${stmt.identifier}, ${code});`);
    } else {
      this.emit(`${stmt.identifier} = ${code};`);
    }
  }

  private visitExprStmt(stmt: ast.ExprStmt): void {
    if (stmt.expression.type === 'FunctionCall') {
      const call = stmt.expression as ast.FunctionCall;
      
      const args = call.arguments || [];
      
      if (call.callee.name === 'escrever') {
        if (!args[0]) {
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
        if (!args[0]) {
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
    const controlCode = this.expressionToC(stmt.count);
    const loopVar = `_i${this.loopCounter++}`;
    this.emit(`for (int ${loopVar} = 0; ${loopVar} < ${controlCode}; ${loopVar}++) {`);
    this.indentLevel++;
    this.visitBlock(stmt.body);
    this.indentLevel--;
    this.emit(`}`);
  }

  private visitWhileStmt(stmt: ast.WhileStmt): void {
    const conditionType = this.visitExpression(stmt.condition);
    if (!this.areTypesCompatible(conditionType, 'boolean')) {
      throw new Error(`While expects a boolean or numeric condition.`);
    }

    const conditionCode = this.expressionToC(stmt.condition);
    this.emit(`while (${conditionCode}) {`);
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
      case 'LogicalExpression':
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
      if (this.collectedLambdas.has(expr.name)) {
        return 'function';
      }
      throw new Error(`Identificador '${expr.name}' não declarado.`);
    }
    return info.type;
  }

  private visitFunctionCall(expr: ast.FunctionCall): DataType {
    let funcInfo = this.currentScope.lookup(expr.callee.name);
    if (!funcInfo || (funcInfo.type !== 'function' && !funcInfo.functionType)) {
      throw new Error(`'${expr.callee.name}' não é uma função.`);
    }
    let isLambda = false;
    
    if (!funcInfo && this.collectedLambdas.has(expr.callee.name)) {
      isLambda = true;
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
        if (this.currentFunctionName && this.originalFunctionName && calleeName === this.originalFunctionName) {
          const args = expr.arguments.map(arg => this.expressionToC(arg)).join(', ');
          return `${this.currentFunctionName}(${args})`;
        }
        const args = expr.arguments.map(arg => this.expressionToC(arg)).join(', ');
        return `${calleeName}(${args})`;
      case 'LambdaExpression':
        const lambdaName = `__lambda_${this.lambdaCounter++}`;
        this.collectedLambdas.set(lambdaName, expr);
        return lambdaName;
      default:
        throw new Error(`Tipo de expressão não suportada na geração C: ${(expr as any).type}`);
    }
  }

  private concatenationWithTempVariable(left: ast.Expression, right: ast.Expression) {
    const tempVar = `__temp_${this.tempCounter++}`;
    const leftCode = this.expressionToC(left);
    const rightCode = this.expressionToC(right);
    
    this.emit(`char ${tempVar}[512];`);
    
    const leftType = this.visitExpression(left);
    const rightType = this.visitExpression(right);
    let leftTemplate = '%s';
    let rightTemplate = '%s';
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
