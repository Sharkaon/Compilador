
import { Token, TokenType } from '../lexer/lexer';
import * as ast from './ast';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length || this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private peekNext(): Token | undefined {
    return this.tokens[this.current + 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  // Consome um token se ele for de qualquer um dos tipos passados
  private consumeIfIs(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(`${message} but found ${this.peek().type} at line ${this.peek().line}`);
  }

  public parseProgram(): ast.Program {
    const declarations: ast.Declaration[] = [];
    while (!this.isAtEnd() && this.peek().type !== 'EOF') {
      declarations.push(this.parseDeclaration());
    }
    return { type: 'Program', declarations };
  }

  private parseDeclaration(): ast.Declaration {
    if (this.consumeIfIs('BRANCHES')) {
      return this.parseBranchesStmt();
    }
    if (this.consumeIfIs('RETURN')) {
      return this.parseReturnStmt();
    }
    if (this.consumeIfIs('ITERATE')) {
      return this.parseIterateStmt();
    }
    if (this.check('IDENT') && this.peekNext()?.type === 'ASSIGN') {
      return this.parseAssignmentStmt();
    }
    const expr = this.parseExpression();
    this.consume('SEMICOLON', "Expected ';' after expression");
    return { type: 'ExprStmt', expression: expr };
  }

  private parseIterateStmt(): ast.IterateStmt {
    this.consume('LPAREN', "Expected '(' after 'iterate'");
    const expr = this.parseExpression();
    this.consume('RPAREN', "Expected ')' after iterate expression");
    const body = this.parseBlock();
    return { type: 'IterateStmt', expression: expr, body };
  }

  private parseAssignmentStmt(): ast.AssignmentStmt {
    const identifier = this.consume('IDENT', 'Expected identifier').lexeme;
    this.consume('ASSIGN', "Expected '='");
    const value = this.parseExpression();
    this.consume('SEMICOLON', "Expected ';' after assignment");
    return { type: 'AssignmentStmt', identifier, value };
  }

  private parseReturnStmt(): ast.ReturnStmt {
    let value: ast.Expression = { type: 'NumberLiteral', value: 0 }; 
    if (!this.check('SEMICOLON')) {
      value = this.parseExpression();
    } 
    this.consume('SEMICOLON', "Expected ';' after return");
    return { type: 'ReturnStmt', value };
  }

  private parseBranchesStmt(): ast.BranchesStmt {
    const branches: ast.Branch[] = [];
    while (this.check('LPAREN') || (this.check('ARROW') && branches.length > 0)) {
      if (this.check('LPAREN')) {
        this.advance(); // consome '('
        const condition = this.parseExpression();
        this.consume('RPAREN', "Expected ')' after branch condition");
        this.consume('ARROW', "Expected '->' after condition");
        const block = this.parseBlock();
        branches.push({ type: 'Branch', condition, block });
      } else {
        this.consume('ARROW', "Expected '->' for default branch");
        const block = this.parseBlock();
        branches.push({ type: 'Branch', block });
      }
    }
    return { type: 'BranchesStmt', branches };
  }

  private parseBlock(): ast.Block {
    this.consume('LBRACE', "Expected '{' to start block");
    const declarations: ast.Declaration[] = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      declarations.push(this.parseDeclaration());
    }
    this.consume('RBRACE', "Expected '}' to close block");
    return { type: 'Block', declarations };
  }

  // Parseamento das expressões respeitando o nível de precedência
  private parseExpression(): ast.Expression {
    return this.parseAssignmentExpression();
  }

  private parseAssignmentExpression(): ast.Expression {
    if (this.check('IDENT') && this.peekNext()?.type === 'ASSIGN') {
      const idToken = this.consume('IDENT', 'Expected identifier');
      const left: ast.Identifier = { type: 'Identifier', name: idToken.lexeme };
      this.consume('ASSIGN', "Expected '='");
      const right = this.parseAssignmentExpression(); // lado direito pode ser outra atribuição
      return { type: 'AssignmentExpression', left, right };
    }
    return this.parseEqualityExpression();
  }

  private parseEqualityExpression(): ast.Expression {
    let left = this.parseRelationalExpression();
    while (this.consumeIfIs('EQ', 'NE')) {
      const operator = this.previous().type === 'EQ' ? '==' : '!=';
      const right = this.parseRelationalExpression();
      left = { type: 'EqualityExpression', left, operator, right };
    }
    return left;
  }

  private parseRelationalExpression(): ast.Expression {
    let left = this.parseAdditiveExpression();
    while (this.consumeIfIs('LT', 'GT', 'LE', 'GE')) {
      let operator: '<' | '>' | '<=' | '>=';
      switch (this.previous().type) {
        case 'LT': operator = '<'; break;
        case 'GT': operator = '>'; break;
        case 'LE': operator = '<='; break;
        case 'GE': operator = '>='; break;
        default: throw new Error('Invalid relational operator');
      }
      const right = this.parseAdditiveExpression();
      left = { type: 'RelationalExpression', left, operator, right };
    }
    return left;
  }

  private parseAdditiveExpression(): ast.Expression {
    let left = this.parseMultiplicativeExpression();
    while (this.consumeIfIs('PLUS', 'MINUS')) {
      const operator = this.previous().type === 'PLUS' ? '+' : '-';
      const right = this.parseMultiplicativeExpression();
      left = { type: 'AdditiveExpression', left, operator, right };
    }
    return left;
  }

  private parseMultiplicativeExpression(): ast.Expression {
    let left: ast.Expression = this.parsePrimaryExpression();
    while (this.consumeIfIs('TIMES', 'DIVISION')) {
      const operator = this.previous().type === 'TIMES' ? '*' : '/';
      const right = this.parsePrimaryExpression();
      left = { type: 'MultiplicativeExpression', left, operator, right };
    }
    return left;
  }

  private parsePrimaryExpression(): ast.PrimaryExpression {
    if (this.consumeIfIs('NUMBER')) {
      const value = parseFloat(this.previous().lexeme);
      return { type: 'NumberLiteral', value };
    }
    if (this.consumeIfIs('STRING')) {
      const raw = this.previous().lexeme;
      const value = raw.slice(1, -1);
      return { type: 'StringLiteral', value };
    }
    if (this.consumeIfIs('IDENT')) {
      const name = this.previous().lexeme;
      if (this.check('LPAREN')) {
        return this.parseFunctionCall(name);
      }
      return { type: 'Identifier', name };
    }
    if (this.check('LPAREN') && this.isLambdaAhead()) {
      return this.parseLambda();
    }
    if (this.consumeIfIs('LPAREN') && !this.isLambdaAhead()) {
      const expr = this.parseExpression();
      this.consume('RPAREN', "Expected ')' after parenthesized expression");
      return { type: 'ParenthesizedExpression', expression: expr };
    }
    throw new Error(`Unexpected token ${this.peek().type} at line ${this.peek().line}`);
  }

  private parseFunctionCall(calleeName: string): ast.FunctionCall {
    this.consume('LPAREN', "Expected '(' after function name");
    const args: ast.Expression[] = [];
    if (!this.check('RPAREN')) {
      do {
        args.push(this.parseExpression());
      } while (this.consumeIfIs('COMMA'));
    }
    this.consume('RPAREN', "Expected ')' after arguments");
    return {
      type: 'FunctionCall',
      callee: { type: 'Identifier', name: calleeName },
      arguments: args,
    };
  }

  private isLambdaAhead(): boolean {
    const savedPos = this.current;
    try {
      this.consume('LPAREN', "Expected '('");
      // Parâmetros: IDENT ':' tipo (',' IDENT ':' tipo)*
      while (!this.check('RPAREN')) {
        if (!this.check('IDENT')) return false;
        this.advance();
        if (!this.check('COLON')) return false;
        this.advance();
        this.parseTypeAnnotation();
        if (!this.check('COMMA')) break;
        this.advance();
      }
      this.consume('RPAREN', "Expected ')'");
      return this.check('ARROW');
    } catch (e) {
      return false;
    } finally {
      this.current = savedPos;
    }
  }

  private parseLambda(): ast.LambdaExpression {
    this.consume('LPAREN', "Expected '('");
    const parameters: ast.Parameter[] = [];
    if (!this.check('RPAREN')) {
      do {
        const name = this.consume('IDENT', "Expected identifier").lexeme;
        this.consume('COLON', "Expected ':' after parameter name");
        const typeAnn = this.parseTypeAnnotation();
        parameters.push({ type: 'Parameter', name, typeAnnotation: typeAnn });
      } while (this.consumeIfIs('COMMA'));
    }
    this.consume('RPAREN', "Expected ')' after parameters");
    this.consume('ARROW', "Expected '->' in lambda");
    console.log(this.tokens);
    const returnType = this.parseTypeAnnotation();
    const body = this.parseBlock();
    return { type: 'LambdaExpression', parameters, returnType, body };
  }

  private parseTypeAnnotation(): ast.TypeAnnotation {
    if (this.consumeIfIs('NUMBER_TYPE')) {
      return { kind: 'number' };
    }
    if (this.consumeIfIs('STRING_TYPE')) {
      return { kind: 'string' };
    }
    if (this.consumeIfIs('LPAREN')) {
      const paramTypes: ast.TypeAnnotation[] = [];
      if (!this.check('RPAREN')) {
        do {
          paramTypes.push(this.parseTypeAnnotation());
        } while (this.consumeIfIs('COMMA'));
      }
      this.consume('RPAREN', "Expected ')' after parameter types");
      this.consume('ARROW', "Expected '->' in function type");
      const returnType = this.parseTypeAnnotation();
      return { kind: 'function', paramTypes, returnType };
    }
    throw new Error(`Expected type annotation, found ${this.peek().type}`);
  }
}
