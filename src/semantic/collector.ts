import * as ast from '../parser/ast';
import { DataType } from './types';


export class VariableCollector {
  private variables: Map<string, DataType> = new Map();
  private lambdas: Map<string, ast.LambdaExpression> = new Map();
  private lambdaId: number = 0;

  collect(program: ast.Program): void {
    for (const decl of program.declarations) {
      this.visitDeclaration(decl);
    }
  }

  private visitDeclaration(decl: ast.Declaration): void {
    switch (decl.type) {
      case 'AssignmentStmt':
        const inferredType = this.inferExpressionType(decl.value);
        this.recordVariable(decl.identifier, inferredType);
        this.visitExpression(decl.value);
        break;
      case 'ExprStmt':
        this.visitExpression(decl.expression);
        break;
      case 'BranchesStmt':
        for (const branch of decl.branches) {
          if (branch.condition) this.visitExpression(branch.condition);
          this.visitBlock(branch.block);
        }
        break;
      case 'ReturnStmt':
        if (decl.value) this.visitExpression(decl.value);
        break;
    }
  }

  private visitBlock(block: ast.Block): void {
    for (const decl of block.declarations) {
      this.visitDeclaration(decl);
    }
  }

  private visitExpression(expr: ast.Expression): void {
    switch (expr.type) {
      case 'NumberLiteral':
        // Número literal não adiciona variável
        break;
      case 'StringLiteral':
        // String literal não adiciona variável
        break;
      case 'Identifier':
        // Identificador: registra a variável com tipo padrão 'number'
        // (será atualizado se houver uma atribuição posterior)
        const skipIfExiting = true;
        this.recordVariable(expr.name, 'number', skipIfExiting);
        break;
      case 'ParenthesizedExpression':
        this.visitExpression(expr.expression);
        break;
      case 'AssignmentExpression':
        // Lado esquerdo é um identificador
        const inferredRightType = this.inferExpressionType(expr.right);
        this.recordVariable(expr.left.name, inferredRightType);
        this.visitExpression(expr.right);
        break;
      case 'EqualityExpression':
      case 'RelationalExpression':
      case 'AdditiveExpression':
      case 'MultiplicativeExpression':
        this.visitExpression(expr.left);
        this.visitExpression(expr.right);
        break;
      case 'FunctionCall':
        for (const arg of expr.arguments) {
          this.visitExpression(arg);
        }
        break;
      case 'LambdaExpression':
        const lambdaName = `__lambda_${this.lambdaId++}`;
        this.lambdas.set(lambdaName, expr);
        // Não coletamos variáveis do corpo agora, faremos depois
        break;
      case 'IterateExpression':
        this.visitExpression(expr.expression);
        this.visitBlock(expr.body);
        break;
    }
  }

  private inferExpressionType(expr: ast.Expression): DataType {
    switch (expr.type) {
      case 'NumberLiteral':
        return 'number';
      case 'StringLiteral':
        return 'string';
      case 'Identifier': {
        const existing = this.variables.get(expr.name);
        return existing || 'number'; // fallback para number se não encontrado
      }
      case 'ParenthesizedExpression':
        return this.inferExpressionType(expr.expression);
      case 'AssignmentExpression':
        return this.inferExpressionType(expr.right);
      case 'EqualityExpression':
      case 'RelationalExpression':
      case 'AdditiveExpression':
        const leftType = this.inferExpressionType(expr.left);
        const rightType = this.inferExpressionType(expr.right);
        // Se algum lado for string, resultado é string
        if (leftType === 'string' || rightType === 'string') {
          return 'string';
        }
        return 'number';
      case 'MultiplicativeExpression':
        return 'number'; // operações aritméticas retornam number
      case 'FunctionCall':
        return 'number'; // assumimos que funções retornam number
      case 'LambdaExpression':
        return 'function';
      default:
        return 'number';
    }
  }

  private recordVariable(name: string, type: DataType, skipIfExiting = false): void {
    const existing = this.variables.get(name);
    if (existing && skipIfExiting) return;

    if (existing && existing !== type) {
      throw new Error(
        `Tipo conflitante para variável '${name}': já definida como '${existing}', agora '${type}'.`
      );
    }
    if (!existing) {
      this.variables.set(name, type);
    }
  }

  getVariables(): Map<string, DataType> {
    return this.variables;
  }

  getLambdas(): Map<string, ast.LambdaExpression> {
    return this.lambdas;
  }
}